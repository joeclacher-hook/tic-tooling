# TIC Tooling — Internal Tools Hub
[
[https://github.com/joeclacher-hook/tic-tooling/](https://tic-tooling.onrender.com/)](https://tic-tooling.onrender.com/)

A Render-hosted web app that acts as a hub for internal tools. Each tool lives in its own folder under `tools/`. The hub index page is auto-generated on every deploy from the `tool.json` files.

## Repo structure

```
tools/
  <tool-name>/
    index.html      ← the tool's UI (required)
    tool.json       ← metadata shown on the hub (required)

api/
  hubspot.js        ← Express route handler: HubSpot query backend
  salesforce.js     ← Express route handler: Salesforce query backend

scripts/
  generate-hub.js   ← runs at build time, writes root index.html from tool.json files

server.js           ← Express server; mounts api/ handlers under /api/*
package.json        ← npm deps (express, AWS SDK, xlsx)
```

## Adding a new tool (frontend only)

1. Create a folder under `tools/` — the folder name becomes the URL slug:
   ```
   tools/my-tool/
   ```

2. Add a `tool.json` with the tool's metadata:
   ```json
   {
     "name": "My Tool",
     "description": "One line describing what it does",
     "icon": "🔧"
   }
   ```

3. Add an `index.html` — this is the full tool UI. It can be plain HTML/JS, no framework needed.

4. Push to `main`. Render deploys automatically and the hub updates.

The tool will be live at `https://tic-tooling.onrender.com/tools/my-tool/`.

## Adding a backend route (e.g. to call an API with secrets)

1. Create a handler file in `api/`:
   ```
   api/my-tool.js
   ```

2. Export a `handler` function that accepts a Render-compatible event object:
   ```js
   exports.handler = async (event) => {
     const body = JSON.parse(event.body);
     // do work...
     return {
       statusCode: 200,
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ result: '...' }),
     };
   };
   ```

3. Register the route in `server.js`:
   ```js
   const myTool = require('./api/my-tool');
   app.post('/api/my-tool', netlifyAdapter(myTool.handler));
   ```

4. Call it from your tool's HTML:
   ```js
   fetch('/api/my-tool', { method: 'POST', body: JSON.stringify({...}) })
   ```

5. If the handler needs npm packages, add them to the root `package.json`.

## Render deployment

- **Build command:** `npm install && npm run build`
- **Start command:** `node server.js`
- **Instance type:** Free tier is fine for internal use (note: spins down after 15 min inactivity, ~30s cold start)

Render auto-deploys on every push to `main`.

