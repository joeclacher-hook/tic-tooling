const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const hubspot = require('./api/hubspot');
const salesforce = require('./api/salesforce');
const integrationSecrets = require('./api/integration-secrets');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Auth ──────────────────────────────────────────────────────────────────────
function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in — TIC Tooling</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: #111;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.10);
      padding: 48px 40px 40px;
      width: 100%;
      max-width: 380px;
      text-align: center;
    }
    .logo { font-size: 2rem; margin-bottom: 12px; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 6px; }
    p { color: #666; font-size: 0.9rem; margin-bottom: 28px; }
    .error {
      background: #fff0f0;
      border: 1px solid #fcc;
      color: #c00;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 0.875rem;
      margin-bottom: 16px;
    }
    input[type="password"] {
      width: 100%;
      padding: 11px 14px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 0.95rem;
      margin-bottom: 12px;
      outline: none;
    }
    input[type="password"]:focus { border-color: #888; }
    button {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: none;
      background: #111;
      color: #fff;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #333; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🔧</div>
    <h1>TIC Tooling</h1>
    <p>Enter the access password to continue.</p>
    ${error ? '<div class="error">Incorrect password.</div>' : ''}
    <form method="POST" action="/login">
      <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" />
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.send(loginPage(req.query.error));
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.AUTH_PASSWORD) {
    req.session.authenticated = true;
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  if (req.headers.accept?.includes('application/json') || req.xhr) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.redirect('/login');
}

// All routes below this line require auth
app.use(requireAuth);

// Serve static files (the hub + all tools)
app.use(express.static(path.join(__dirname)));

function netlifyAdapter(handler) {
  return async (req, res) => {
    const event = {
      httpMethod: req.method,
      headers: req.headers,
      body: req.method === 'OPTIONS' ? '' : JSON.stringify(req.body),
    };
    const result = await handler(event);
    res.status(result.statusCode).set(result.headers || {}).send(result.body);
  };
}

app.options('/api/hubspot', netlifyAdapter(hubspot.handler));
app.post('/api/hubspot', netlifyAdapter(hubspot.handler));
app.options('/api/salesforce', netlifyAdapter(salesforce.handler));
app.post('/api/salesforce', netlifyAdapter(salesforce.handler));
app.options('/api/integration-secrets', netlifyAdapter(integrationSecrets.handler));
app.post('/api/integration-secrets', netlifyAdapter(integrationSecrets.handler));

// ── Claude Skills ─────────────────────────────────────────────────────────────
const skillsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const GH_TOKEN  = process.env.GITHUB_TOKEN;
const GH_REPO   = process.env.GITHUB_REPO   || 'joeclacher-hook/tic-tooling';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';
const SKILLS_BASE = 'tools/claude-skills/skills';
const MANIFEST_PATH = `${SKILLS_BASE}/manifest.json`;
const GH_HEADERS = () => ({
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
  'User-Agent': 'tic-tooling',
});

async function ghGet(filePath) {
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${filePath}?ref=${GH_BRANCH}`, { headers: GH_HEADERS() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET ${filePath}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function ghPut(filePath, content, message, sha) {
  const body = {
    message,
    content: Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content).toString('base64'),
    branch: GH_BRANCH,
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${filePath}`, {
    method: 'PUT', headers: GH_HEADERS(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub PUT ${filePath}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function ghDelete(filePath, message, sha) {
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${filePath}`, {
    method: 'DELETE',
    headers: GH_HEADERS(),
    body: JSON.stringify({ message, sha, branch: GH_BRANCH }),
  });
  if (!r.ok && r.status !== 404) throw new Error(`GitHub DELETE ${filePath}: ${r.status} ${await r.text()}`);
}

async function readManifest() {
  const data = await ghGet(MANIFEST_PATH);
  if (!data) return { skills: [], sha: null };
  return { skills: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')), sha: data.sha };
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Upload
app.post('/api/skills/upload', skillsUpload.array('files'), async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const { name, description = '' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!req.files?.length) return res.status(400).json({ error: 'at least one file is required' });

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const filenames = [];

    for (const file of req.files) {
      const safe = sanitizeName(file.originalname);
      await ghPut(`${SKILLS_BASE}/${id}/${safe}`, file.buffer, `feat: add skill "${name.trim()}" (${safe})`);
      filenames.push(safe);
    }

    const { skills, sha } = await readManifest();
    skills.push({ id, name: name.trim(), description: description.trim(), files: filenames, uploadedAt: new Date().toISOString() });
    await ghPut(MANIFEST_PATH, JSON.stringify(skills, null, 2), `chore: register skill "${name.trim()}"`, sha);

    res.json({ ok: true, id, filenames });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List
app.get('/api/skills/list', async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const { skills } = await readManifest();
    res.json({ skills });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get file content
app.get('/api/skills/file', async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const id = sanitizeName(String(req.query.id || ''));
    const filename = sanitizeName(String(req.query.filename || ''));
    if (!id || !filename) return res.status(400).json({ error: 'id and filename required' });
    const data = await ghGet(`${SKILLS_BASE}/${id}/${filename}`);
    if (!data) return res.status(404).json({ error: 'File not found' });
    res.json({ content: Buffer.from(data.content, 'base64').toString('utf8'), filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Edit name/description
app.patch('/api/skills/:id', async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const id = sanitizeName(req.params.id);
    const { name, description } = req.body;
    const { skills, sha } = await readManifest();
    const skill = skills.find(s => s.id === id);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    if (name !== undefined) skill.name = name.trim();
    if (description !== undefined) skill.description = description.trim();
    await ghPut(MANIFEST_PATH, JSON.stringify(skills, null, 2), `chore: update skill "${skill.name}"`, sha);
    res.json({ ok: true, skill });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete
app.delete('/api/skills/:id', async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const id = sanitizeName(req.params.id);
    const { skills, sha } = await readManifest();
    const idx = skills.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Skill not found' });
    const [skill] = skills.splice(idx, 1);

    for (const filename of skill.files) {
      const fileData = await ghGet(`${SKILLS_BASE}/${id}/${filename}`);
      if (fileData) await ghDelete(`${SKILLS_BASE}/${id}/${filename}`, `chore: remove skill "${skill.name}"`, fileData.sha);
    }

    const refreshed = await ghGet(MANIFEST_PATH);
    await ghPut(MANIFEST_PATH, JSON.stringify(skills, null, 2), `chore: remove skill "${skill.name}"`, refreshed?.sha);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chrome Extensions ─────────────────────────────────────────────────────────
const extUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const EXT_BASE     = 'tools/chrome-extensions/extensions';
const EXT_MANIFEST = `${EXT_BASE}/manifest.json`;

async function readExtManifest() {
  const data = await ghGet(EXT_MANIFEST);
  if (!data) return { extensions: [], sha: null };
  return { extensions: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')), sha: data.sha };
}

// Upload
app.post('/api/extensions/upload', extUpload.single('file'), async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const { name, description = '', details = '', interaction = 'None required', requirements = '' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!req.file)     return res.status(400).json({ error: 'a ZIP file is required' });

    const id       = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const filename = sanitizeName(req.file.originalname);

    await ghPut(`${EXT_BASE}/${id}/${filename}`, req.file.buffer, `feat: add extension "${name.trim()}" (${filename})`);

    const { extensions, sha } = await readExtManifest();
    extensions.push({ id, name: name.trim(), description: description.trim(), details: details.trim(), interaction, requirements: requirements.trim(), filename, uploadedAt: new Date().toISOString() });
    await ghPut(EXT_MANIFEST, JSON.stringify(extensions, null, 2), `chore: register extension "${name.trim()}"`, sha);

    res.json({ ok: true, id, filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List
app.get('/api/extensions/list', async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const { extensions } = await readExtManifest();
    res.json({ extensions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Download (binary)
app.get('/api/extensions/download', async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const id       = sanitizeName(String(req.query.id       || ''));
    const filename = sanitizeName(String(req.query.filename || ''));
    if (!id || !filename) return res.status(400).json({ error: 'id and filename required' });

    const data = await ghGet(`${EXT_BASE}/${id}/${filename}`);
    if (!data) return res.status(404).json({ error: 'File not found' });

    let buffer;
    if (data.content) {
      buffer = Buffer.from(data.content.replace(/\n/g, ''), 'base64');
    } else if (data.download_url) {
      const r = await fetch(data.download_url, { headers: { Authorization: `Bearer ${GH_TOKEN}` } });
      buffer = Buffer.from(await r.arrayBuffer());
    } else {
      return res.status(500).json({ error: 'Could not retrieve file content' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Edit metadata
app.patch('/api/extensions/:id', async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const id = sanitizeName(req.params.id);
    const { name, description, details, interaction, requirements } = req.body;
    const { extensions, sha } = await readExtManifest();
    const ext = extensions.find(e => e.id === id);
    if (!ext) return res.status(404).json({ error: 'Extension not found' });
    if (name         !== undefined) ext.name         = name.trim();
    if (description  !== undefined) ext.description  = description.trim();
    if (details      !== undefined) ext.details      = details.trim();
    if (interaction  !== undefined) ext.interaction  = interaction;
    if (requirements !== undefined) ext.requirements = requirements.trim();
    await ghPut(EXT_MANIFEST, JSON.stringify(extensions, null, 2), `chore: update extension "${ext.name}"`, sha);
    res.json({ ok: true, ext });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete
app.delete('/api/extensions/:id', async (req, res) => {
  if (!GH_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set on server' });
  try {
    const id = sanitizeName(req.params.id);
    const { extensions, sha } = await readExtManifest();
    const idx = extensions.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Extension not found' });
    const [ext] = extensions.splice(idx, 1);

    const fileData = await ghGet(`${EXT_BASE}/${id}/${ext.filename}`);
    if (fileData) await ghDelete(`${EXT_BASE}/${id}/${ext.filename}`, `chore: remove extension "${ext.name}"`, fileData.sha);

    const refreshed = await ghGet(EXT_MANIFEST);
    await ghPut(EXT_MANIFEST, JSON.stringify(extensions, null, 2), `chore: remove extension "${ext.name}"`, refreshed?.sha);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
