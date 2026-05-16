const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const hubspot = require('./api/hubspot');
const salesforce = require('./api/salesforce');
const integrationSecrets = require('./api/integration-secrets');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Auth ──────────────────────────────────────────────────────────────────────
function loginPage(errorMsg) {
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
    p { color: #666; font-size: 0.9rem; margin-bottom: 32px; }
    .error {
      background: #fff0f0;
      border: 1px solid #fcc;
      color: #c00;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 0.875rem;
      margin-bottom: 20px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid #ddd;
      background: #fff;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      color: #111;
      transition: background 0.15s, box-shadow 0.15s;
    }
    .btn:hover { background: #f9f9f9; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .btn svg { flex-shrink: 0; }
    .footer { margin-top: 28px; font-size: 0.8rem; color: #aaa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🔧</div>
    <h1>TIC Tooling</h1>
    <p>Sign in with your Hook Google account to continue.</p>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
    <a class="btn" href="/auth/google">
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
        <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.169 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </a>
    <div class="footer">Access restricted to @hook.co accounts</div>
  </div>
</body>
</html>`;
}


app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
  },
  (_accessToken, _refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value || '';
    if (!email.endsWith('@hook.co')) {
      return done(null, false, { message: 'unauthorized' });
    }
    return done(null, {
      id: profile.id,
      email,
      name: profile.displayName,
      photo: profile.photos?.[0]?.value,
    });
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  const error = req.query.error === 'unauthorized'
    ? 'Access restricted to @hook.co accounts.'
    : null;
  res.send(loginPage(error));
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=unauthorized' }),
  (_req, res) => res.redirect('/')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

app.get('/auth/me', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.user });
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
