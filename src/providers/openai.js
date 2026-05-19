'use strict';

const { fetchWithTimeout } = require('../fetch');
const { getProviderApiKey } = require('../store');

const MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'o1',
  'o1-mini',
  'o3-mini',
  'o3',
  'code-davinci-002',
];

const MODEL_COSTS = {
  'gpt-4o':           { input: 5.00,   output: 15.00  },
  'gpt-4o-mini':      { input: 0.15,   output: 0.60   },
  'gpt-4-turbo':      { input: 10.00,  output: 30.00  },
  'gpt-4':            { input: 30.00,  output: 60.00  },
  'gpt-3.5-turbo':    { input: 0.50,   output: 1.50   },
  'o1':               { input: 15.00,  output: 60.00  },
  'o1-mini':          { input: 3.00,   output: 12.00  },
  'o3-mini':          { input: 1.10,   output: 4.40   },
  'o3':               { input: 10.00,  output: 40.00  },
  'code-davinci-002': { input: 2.00,   output: 2.00   },
};

const ORG_DAILY_LIMIT = 10_000_000;

function getApiKey() {
  const stored = getProviderApiKey('openai');
  if (stored && stored.length > 10) return stored;
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  return null;
}

async function fetchUsageFromUsageApi(apiKey) {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetchWithTimeout(
    `https://api.openai.com/v1/usage?date=${today}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
    10000
  );

  if (!res.ok) return null;

  const body = await res.json();
  const data = body.data || [];
  const totalCtx = data.reduce((s, d) => s + (d.n_context_tokens_total || 0), 0);
  const totalGen = data.reduce((s, d) => s + (d.n_generated_tokens_total || 0), 0);
  const totalTokens = totalCtx + totalGen;

  const cost = (totalCtx / 1e6 * 2.50) + (totalGen / 1e6 * 10.00);

  const modelCounts = {};
  data.forEach(d => {
    const m = d.snapshot_id || '';
    modelCounts[m] = (modelCounts[m] || 0) + (d.n_context_tokens_total || 0);
  });
  const activeModel = Object.keys(modelCounts).length
    ? Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0][0]
    : MODELS[0];

  const pct = Math.min(100, Math.round((totalTokens * 100) / ORG_DAILY_LIMIT));

  return {
    provider: 'openai',
    connected: true,
    error: null,
    session: { used: totalTokens, limit: ORG_DAILY_LIMIT, resetAt: 0, pct },
    period:  { used: totalTokens, limit: ORG_DAILY_LIMIT, resetAt: 0, pct },
    cost:    { session: Math.round(cost * 10000) / 10000, period: Math.round(cost * 10000) / 10000 },
    models: MODELS,
    activeModel: activeModel.slice(0, 40) || MODELS[0],
    lastFetched: Date.now(),
  };
}

async function fetchUsageFromModelsApi(apiKey) {
  const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  }, 8000);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || String(res.status));
  }

  const remaining = parseInt(res.headers.get('x-ratelimit-remaining-tokens') || '0', 10);
  const limit     = parseInt(res.headers.get('x-ratelimit-limit-tokens')     || '90000', 10);
  const resetStr  = res.headers.get('x-ratelimit-reset-tokens');
  const resetAt   = resetStr ? Date.now() + parseResetDuration(resetStr) : Date.now() + 60000;
  const used = Math.max(0, limit - remaining);
  const pct  = limit > 0 ? Math.round((used / limit) * 100) : 0;

  return {
    provider: 'openai',
    connected: true,
    error: null,
    session: { used, limit, resetAt, pct },
    period:  { used, limit, resetAt, pct },
    cost:    { session: 0, period: 0 },
    models: MODELS,
    activeModel: MODELS[0],
    lastFetched: Date.now(),
  };
}

function parseResetDuration(str) {
  let ms = 0;
  const h = str.match(/(\d+)h/); if (h) ms += parseInt(h[1]) * 3600000;
  const m = str.match(/(\d+)m/); if (m) ms += parseInt(m[1]) * 60000;
  const s = str.match(/(\d+)s/); if (s) ms += parseInt(s[1]) * 1000;
  return ms || 60000;
}

async function fetchUsage() {
  const apiKey = getApiKey();
  if (!apiKey) return emptyResult('No OpenAI API key configured.');

  try {
    const usageResult = await fetchUsageFromUsageApi(apiKey);
    if (usageResult) return usageResult;
    return await fetchUsageFromModelsApi(apiKey);
  } catch (err) {
    return emptyResult(`OpenAI fetch error: ${err.message}`);
  }
}

function emptyResult(error) {
  return {
    provider: 'openai',
    connected: false,
    error,
    session: { used: 0, limit: 0, resetAt: 0, pct: 0 },
    period:  { used: 0, limit: 0, resetAt: 0, pct: 0 },
    cost:    { session: 0, period: 0 },
    models: MODELS,
    activeModel: MODELS[0],
    lastFetched: Date.now(),
  };
}

function getCredentialFields() {
  return {
    apiKey: { label: 'API Key', type: 'password', placeholder: 'sk-proj-...' },
  };
}

async function validateCredentials(creds) {
  const key = (creds && creds.apiKey) || getApiKey();
  if (!key) return false;
  try {
    const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    }, 8000);
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = {
  id: 'openai',
  name: 'OpenAI / Codex',
  color: '#10A37F',
  mascot: 'codex',
  models: MODELS,
  modelCosts: MODEL_COSTS,
  fetchUsage,
  getCredentialFields,
  validateCredentials,
};
