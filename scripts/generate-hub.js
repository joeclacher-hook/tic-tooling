const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, '..', 'tools');
const outputFile = path.join(__dirname, '..', 'index.html');

const tools = [];

if (fs.existsSync(toolsDir)) {
  for (const name of fs.readdirSync(toolsDir).sort()) {
    const toolDir = path.join(toolsDir, name);
    const configFile = path.join(toolDir, 'tool.json');
    if (fs.statSync(toolDir).isDirectory() && fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        tools.push({ slug: name, ...config });
      } catch (e) {
        console.warn(`Skipping ${name}: invalid tool.json`);
      }
    }
  }
}

const cards = tools.map(t => `
    <a href="/tools/${t.slug}/" class="card">
      <div class="card-icon">${t.icon || '🔧'}</div>
      <div class="card-body">
        <h2>${t.name}</h2>
        <p>${t.description || ''}</p>
      </div>
    </a>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TIC Tooling</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f4f6f9;
      color: #1a1d23;
      min-height: 100vh;
    }

    header {
      background: #1a1d23;
      color: #fff;
      padding: 2.5rem 2rem 2rem;
    }

    header h1 { font-size: 1.8rem; font-weight: 700; letter-spacing: -0.5px; }
    header p  { margin-top: 0.4rem; color: #8b9ab0; font-size: 0.95rem; }

    main {
      max-width: 960px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1.25rem;
    }

    .card {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      background: #fff;
      border: 1px solid #e4e8ee;
      border-radius: 10px;
      padding: 1.4rem 1.25rem;
      text-decoration: none;
      color: inherit;
      transition: box-shadow 0.15s, border-color 0.15s;
    }

    .card:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      border-color: #c5cfe0;
    }

    .card-icon { font-size: 2rem; flex-shrink: 0; line-height: 1; }

    .card-body h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.3rem; }
    .card-body p  { font-size: 0.85rem; color: #5a6478; line-height: 1.5; }

    .empty {
      color: #8b9ab0;
      font-size: 0.95rem;
      padding: 3rem 0;
      text-align: center;
    }

    .empty code {
      background: #eef1f6;
      border-radius: 4px;
      padding: 0.1em 0.4em;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <header>
    <h1>TIC Tooling</h1>
    <p>Internal tools hub — add a folder to <code style="background:rgba(255,255,255,0.1);border-radius:4px;padding:0.1em 0.4em;font-size:0.9em">tools/</code> with a <code style="background:rgba(255,255,255,0.1);border-radius:4px;padding:0.1em 0.4em;font-size:0.9em">tool.json</code> to register a new tool</p>
  </header>
  <main>
    ${tools.length
      ? `<div class="grid">${cards}\n  </div>`
      : '<p class="empty">No tools yet. Drop a folder into <code>tools/</code> with an <code>index.html</code> and <code>tool.json</code>.</p>'}
  </main>
</body>
</html>
`;

fs.writeFileSync(outputFile, html);
console.log(`Generated index.html with ${tools.length} tool(s): ${tools.map(t => t.slug).join(', ') || 'none'}`);
