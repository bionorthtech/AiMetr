'use strict';

const fetch = require('node-fetch');
const { getProviderConfig } = require('../store');

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

function getApiKey() {
  const cfg = getProviderConfig('openai');
  if (cfg.apiKey && cfg.apiKey.length > 10) return cfg.apiKey;
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  return null;
}

async function fetchUsage() {
  const apiKey = getApiKey();
  if (!apiKey) return emptyResult('No OpenAI API key configured.');

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return emptyResult(`OpenAI error: ${body.error?.message || res.status}`);
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
  } catch (err) {
    return emptyResult(`OpenAI fetch error: ${err.message}`);
  }
}

// Parses strings like "6m0s" or "1h2m3s" into ms
function parseResetDuration(str) {
  let ms = 0;
  const h = str.match(/(\d+)h/); if (h) ms += parseInt(h[1]) * 3600000;
  const m = str.match(/(\d+)m/); if (m) ms += parseInt(m[1]) * 60000;
  const s = str.match(/(\d+)s/); if (s) ms += parseInt(s[1]) * 1000;
  return ms || 60000;
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
  const key = creds.apiKey || '';
  if (!key) return false;
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
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
