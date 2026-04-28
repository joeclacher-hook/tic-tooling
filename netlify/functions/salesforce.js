const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const XLSX = require('xlsx');

const TIMEOUT_MS = 25000;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  try {
    const result = await handle(JSON.parse(event.body));
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};

async function handle(body) {
  const { credentials: aws, region = 'eu-west-1', customer } = body;

  const sm = new SecretsManagerClient({
    region,
    credentials: {
      accessKeyId: aws.AccessKeyId,
      secretAccessKey: aws.SecretAccessKey,
      sessionToken: aws.SessionToken,
    },
  });

  const resp = await sm.send(new GetSecretValueCommand({ SecretId: `${customer}/salesforce` }));
  const creds = JSON.parse(resp.SecretString);

  const instanceUrl = (creds.instance_url || '').replace(/\/$/, '');
  if (!instanceUrl) throw new Error('instance_url not found in credentials');

  const token = await getToken(creds, instanceUrl);

  if (body.action === 'discover') return discover(token, instanceUrl, body.filter || '');
  return query(token, instanceUrl, body.object || '', body.queryType, body.limit || 10, body.soql || null);
}

async function getToken(creds, instanceUrl) {
  const tokenUrl = `${instanceUrl}/services/oauth2/token`;

  if (creds.refresh_token) {
    try {
      const r = await tFetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          refresh_token: creds.refresh_token,
        }).toString(),
      });
      if (r.ok) return (await r.json()).access_token;
    } catch { /* fall through */ }
  }

  if (creds.username && creds.password) {
    try {
      const r = await tFetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          username: creds.username,
          password: creds.password + (creds.security_token || ''),
        }).toString(),
      });
      if (r.ok) return (await r.json()).access_token;
    } catch { /* fall through */ }
  }

  const r = await tFetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.client_id,
      client_secret: creds.client_secret,
    }).toString(),
  });
  if (!r.ok) throw new Error(`Salesforce auth failed: ${await r.text()}`);
  return (await r.json()).access_token;
}

function sfHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function sfQuery(token, instanceUrl, soql) {
  const url = new URL(`${instanceUrl}/services/data/v59.0/query`);
  url.searchParams.set('q', soql);
  const r = await tFetch(url.toString(), { headers: sfHeaders(token) });
  if (!r.ok) throw new Error(`Salesforce query failed: ${await r.text()}`);
  return r.json();
}

async function discover(token, instanceUrl, filterTerm) {
  const r = await tFetch(`${instanceUrl}/services/data/v59.0/sobjects`, { headers: sfHeaders(token) });
  if (!r.ok) throw new Error(`Failed to fetch objects: ${await r.text()}`);
  let objects = (await r.json()).sobjects || [];

  if (filterTerm) {
    const t = filterTerm.toLowerCase();
    objects = objects.filter(o => o.name.toLowerCase().includes(t) || (o.label || '').toLowerCase().includes(t));
  }

  const rows = [];
  for (const obj of objects) {
    let count = 'N/A';
    if (obj.queryable) {
      try {
        const result = await sfQuery(token, instanceUrl, `SELECT COUNT() FROM ${obj.name}`);
        count = result.totalSize ?? 0;
      } catch { count = 'Error'; }
    }
    rows.push({ name: obj.name, label: obj.label || '', queryable: obj.queryable, record_count: count });
  }
  return { type: 'discover', rows };
}

async function query(token, instanceUrl, obj, qtype, limit, soql) {
  if (qtype === 'shape') {
    const r = await tFetch(`${instanceUrl}/services/data/v59.0/sobjects/${obj}/describe`, { headers: sfHeaders(token) });
    if (!r.ok) throw new Error(`Describe failed: ${await r.text()}`);
    const fields = (await r.json()).fields.map(f => ({ name: f.name, label: f.label, type: f.type, length: f.length }));
    return { type: 'shape', rows: fields, excel: makeExcel(fields, 'Object Shape'), filename: `${obj}_shape.xlsx` };
  }

  let queryStr = soql;
  if (!queryStr) {
    if (qtype === 'count')  queryStr = `SELECT COUNT() FROM ${obj}`;
    else if (qtype === 'list') queryStr = `SELECT Id, Name FROM ${obj} LIMIT 20`;
    else if (qtype === 'all')  queryStr = `SELECT FIELDS(ALL) FROM ${obj} LIMIT ${limit}`;
    else queryStr = `SELECT Id FROM ${obj} LIMIT 10`;
  }

  const result = await sfQuery(token, instanceUrl, queryStr);
  const records = result.records || [];
  const total = result.totalSize ?? 0;

  if (qtype === 'count') {
    const countVal = records[0]?.expr0 ?? total;
    return { type: 'count', total: countVal };
  }

  const clean = records.map(r => { const { attributes, ...rest } = r; return rest; });

  if (qtype === 'all' || soql) {
    return { type: qtype, rows: clean, total, excel: makeExcel(clean, 'Query Results'), filename: `${obj || 'query'}_results.xlsx` };
  }

  return { type: qtype, rows: clean, total };
}

function makeExcel(records, sheetName = 'Results') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(records);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })).toString('base64');
}

async function tFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
