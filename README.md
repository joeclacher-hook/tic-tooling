# TIC Tooling — Internal Tools Hub

https://github.com/joeclacher-hook/tic-tooling/
A Netlify site that acts as a hub for internal tools. Each tool lives in its own folder under `tools/`. The hub index page is auto-generated on every deploy from the `tool.json` files.

## Repo structure

```
tools/
  <tool-name>/
    index.html      ← the tool's UI (required)
    tool.json       ← metadata shown on the hub (required)

netlify/functions/
  hubspot.js        ← Netlify Function: HubSpot query backend
  salesforce.js     ← Netlify Function: Salesforce query backend

scripts/
  generate-hub.js   ← runs at build time, writes root index.html from tool.json files

netlify.toml        ← build config; /api/* redirects to /.netlify/functions/*
package.json        ← npm deps for the functions (AWS SDK, xlsx)
```

## Adding a new tool

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

4. Push to `main`. Netlify deploys automatically and the hub updates.

The tool will be live at `https://tic-tooling.netlify.app/tools/my-tool/`.

## If your tool needs a backend (e.g. calling an API with secrets)

Add a JavaScript Netlify Function in `netlify/functions/`:

```
netlify/functions/my-tool.js
```

The function must export a `handler`:

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

Call it from your tool's HTML via `fetch('/api/my-tool', { method: 'POST', body: JSON.stringify({...}) })`.

If the function needs npm packages, add them to the root `package.json`.

## AWS credentials (for tools that use AWS Secrets Manager)

The CRM tool asks users to paste temporary AWS SSO credentials at runtime. If your tool also needs AWS access, follow the same pattern — prompt the user to run:

```bash
aws sso login --profile hook-production-tic
aws configure export-credentials --profile hook-production-tic
```

Then pass the JSON output to your Netlify Function and create a `boto3.Session` / `SecretsManagerClient` from those credentials.

Do not store AWS credentials or secrets in the repo.

## Existing tools

- **crm-queries** — Query HubSpot and Salesforce records via AWS Secrets Manager. Uses `netlify/functions/hubspot.js` and `netlify/functions/salesforce.js`.
