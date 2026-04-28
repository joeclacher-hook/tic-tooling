const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const XLSX = require('xlsx');

const TIMEOUT_MS = 25000;
const DISCOVER_DELAY_MS = 50;
const HUBSPOT_BASE = 'https://api.hubapi.com';
const STANDARD_OBJECTS = [
  'contacts','companies','deals','tickets','line_items','products',
  'quotes','calls','emails','meetings','notes','tasks','communications',
];

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

  const resp = await sm.send(new GetSecretValueCommand({ SecretId: `${customer}/hubspot` }));
  const creds = JSON.parse(resp.SecretString);
  const { token, authType } = await authenticate(creds);

  if (body.action === 'discover') return discover(token, authType, body.filter || '');
  return query(token, authType, body.object, body.queryType, body.limit || 100, body.properties || [], body.filters || []);
}

async function authenticate(creds) {
  if (creds.hapikey) return { token: creds.hapikey, authType: 'hapikey' };

  if (['client_id','client_secret','refresh_token'].every(k => k in creds)) {
    const r = await tFetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: creds.refresh_token,
      }).toString(),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`OAuth refresh failed: ${JSON.stringify(data)}`);
    return { token: data.access_token, authType: 'bearer' };
  }

  for (const key of ['access_token', 'token', 'api_key']) {
    if (creds[key]) return { token: creds[key], authType: 'bearer' };
  }

  throw new Error(`No usable token. Keys present: ${Object.keys(creds).join(', ')}`);
}

function headers(token, authType) {
  return authType === 'bearer'
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function buildUrl(path, token, authType, extra = {}) {
  const url = new URL(`${HUBSPOT_BASE}${path}`);
  if (authType === 'hapikey') url.searchParams.set('hapikey', token);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  return url.toString();
}

async function hsGet(token, authType, path, params = {}) {
  const r = await tFetch(buildUrl(path, token, authType, params), { headers: headers(token, authType) });
  if (!r.ok) throw new Error(`HubSpot ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function hsPost(token, authType, path, payload) {
  const r = await tFetch(buildUrl(path, token, authType), {
    method: 'POST',
    headers: headers(token, authType),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`HubSpot ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function hsCount(token, authType, obj) {
  try {
    const d = await hsPost(token, authType, `/crm/v3/objects/${obj}/search`,
      { filterGroups: [], limit: 1, properties: ['hs_object_id'] });
    return d.total ?? 0;
  } catch { return -1; }
}

const flatten = r => ({ id: r.id || '', ...r.properties });

async function discover(token, authType, filterTerm) {
  let schemas = [];
  try { schemas = (await hsGet(token, authType, '/crm/v3/schemas')).results || []; } catch { /* no custom objects */ }

  let all = [
    ...STANDARD_OBJECTS.map(o => ({ name: o, label: o[0].toUpperCase() + o.slice(1), type: 'standard' })),
    ...schemas.map(s => ({ name: s.fullyQualifiedName || s.name, label: s.labels?.singular || s.name, type: 'custom' })),
  ];

  if (filterTerm) {
    const t = filterTerm.toLowerCase();
    all = all.filter(o => o.name.toLowerCase().includes(t) || o.label.toLowerCase().includes(t));
  }

  const rows = [];
  for (const obj of all) {
    const count = await hsCount(token, authType, obj.name);
    rows.push({ ...obj, record_count: count >= 0 ? count : 'Error' });
    await sleep(DISCOVER_DELAY_MS);
  }
  return { type: 'discover', rows };
}

async function query(token, authType, obj, qtype, limit, props, filters) {
  if (qtype === 'count') return { type: 'count', total: await hsCount(token, authType, obj) };

  if (qtype === 'list') {
    const params = { limit: Math.min(limit, 100) };
    if (props.length) params.properties = props.join(',');
    const records = (await hsGet(token, authType, `/crm/v3/objects/${obj}`, params)).results || [];
    return { type: 'list', rows: records.map(flatten) };
  }

  if (qtype === 'shape') {
    const all = (await hsGet(token, authType, `/crm/v3/properties/${obj}`)).results || [];
    const rows = all.map(p => ({ name: p.name, label: p.label, type: p.type, fieldType: p.fieldType, group: p.groupName }));
    return { type: 'shape', rows, excel: makeExcel(rows, 'Object Shape'), filename: `${obj}_shape.xlsx` };
  }

  if (qtype === 'all') {
    const allProps = (await hsGet(token, authType, `/crm/v3/properties/${obj}`)).results || [];
    const propNames = allProps.map(p => p.name);
    const records = [];
    let after = null;
    while (records.length < limit) {
      const payload = { filterGroups: [], properties: propNames, limit: Math.min(100, limit - records.length) };
      if (after) payload.after = after;
      const data = await hsPost(token, authType, `/crm/v3/objects/${obj}/search`, payload);
      records.push(...(data.results || []));
      after = data.paging?.next?.after;
      if (!after || !data.results?.length) break;
    }
    const rows = records.map(flatten);
    return { type: 'all', rows, excel: makeExcel(rows, 'Query Results'), filename: `${obj}_records.xlsx` };
  }

  if (qtype === 'search') {
    const payload = { filterGroups: filters.length ? [{ filters }] : [], limit: Math.min(limit, 100) };
    if (props.length) payload.properties = props;
    const result = await hsPost(token, authType, `/crm/v3/objects/${obj}/search`, payload);
    return { type: 'search', rows: (result.results || []).map(flatten), total: result.total ?? 0 };
  }

  throw new Error(`Unknown query type: ${qtype}`);
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

const sleep = ms => new Promise(r => setTimeout(r, ms));
