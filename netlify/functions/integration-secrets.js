const { SecretsManagerClient, ListSecretsCommand, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

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

async function handle({ credentials: aws, region = 'eu-west-1', customer, objectFilter }) {
  const sm = new SecretsManagerClient({
    region,
    credentials: {
      accessKeyId: aws.AccessKeyId,
      secretAccessKey: aws.SecretAccessKey,
      sessionToken: aws.SessionToken,
    },
  });

  // List secrets — filter by customer prefix, paginate fully
  const prefix = `${customer.trim()}/`;
  let secretNames = [];
  let nextToken;

  do {
    const resp = await sm.send(new ListSecretsCommand({
      Filters: [{ Key: 'name', Values: [customer.trim()] }],
      MaxResults: 100,
      ...(nextToken ? { NextToken: nextToken } : {}),
    }));
    const names = (resp.SecretList || [])
      .map(s => s.Name)
      .filter(n => n.startsWith(prefix));
    secretNames.push(...names);
    nextToken = resp.NextToken;
  } while (nextToken);

  // Optional: filter by the object name (part after the last /)
  if (objectFilter && objectFilter.trim()) {
    const obj = objectFilter.trim().toLowerCase();
    secretNames = secretNames.filter(n => n.split('/').pop().toLowerCase() === obj);
  }

  if (!secretNames.length) return { secrets: [] };

  // Fetch each secret value in parallel
  const secrets = await Promise.all(secretNames.map(async (name) => {
    try {
      const r = await sm.send(new GetSecretValueCommand({ SecretId: name }));
      const raw = r.SecretString || '';
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (_) {}
      return { name, raw, parsed };
    } catch (e) {
      return { name, error: e.message };
    }
  }));

  return { secrets };
}
