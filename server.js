const express = require('express');
const path = require('path');
const hubspot = require('./netlify/functions/hubspot');
const salesforce = require('./netlify/functions/salesforce');

const app = express();
app.use(express.json({ limit: '10mb' }));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
