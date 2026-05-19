'use strict';

const { fetchWithTimeout } = require('../fetch');
const { getProviderApiKey } = require('../store');

const MODELS = [
  'deepseek-chat',
  'deepseek-coder',
  'deepseek-reasoner',
];

const MODEL_COSTS = {
  'deepseek-chat':     { input: 0.14,  output: 0.28  },
  'deepseek-coder':    { input: 0.14,  output: 0.28  },
  'deepseek-reasoner': { input: 0.55,  output: 2.19  },
};

const BASE_URL = 'https://api.deepseek.com';

function getApiKey() {
  const stored = getProviderApiKey('deepseek');
  if (stored && stored.length > 10) return stored;
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  return null;
}

async function fetchUsage() {
  const apiKey = getApiKey();
  if (!apiKey) return emptyResult('No DeepSeek API key configured.');

  try {
    const balRes = await fetchWithTimeout(`${BASE_URL}/user/balance`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }, 10000);

    if (!balRes.ok) {
      const body = await balRes.json().catch(() => ({}));
      return emptyResult(`DeepSeek error: ${body.error?.message || balRes.status}`);
    }

    const bal = await balRes.json();
    const isAvailable = bal.is_available !== false;
    const infos = bal.balance_infos || [];
    const usdInfo = infos.find(i => i.currency === 'USD') || infos[0] || {};

    const total   = parseFloat(usdInfo.total_balance   || '0') || 0;
    const granted = parseFloat(usdInfo.granted_balance || '0') || 0;
    const toppedUp = parseFloat(usdInfo.topped_up_balance || '0') || 0;

    const orig = (granted + toppedUp) > 0 ? granted + toppedUp : total + 5;
    const used = orig > 0 ? Math.max(0, orig - total) : 0;
    const pct  = orig > 0 ? Math.min(100, Math.round((used / orig) * 100)) : 0;

    return {
      provider: 'deepseek',
      connected: isAvailable,
      error: null,
      session: { used: Math.round(used * 1000), limit: Math.round(orig * 1000), resetAt: 0, pct },
      period:  { used: Math.round(used * 1000), limit: Math.round(orig * 1000), resetAt: 0, pct },
      cost:    { session: Math.round(used * 10000) / 10000, period: Math.round(used * 10000) / 10000 },
      models: MODELS,
      activeModel: MODELS[0],
      lastFetched: Date.now(),
    };
  } catch (err) {
    return emptyResult(`DeepSeek fetch error: ${err.message}`);
  }
}

function emptyResult(error) {
  return {
    provider: 'deepseek',
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
    apiKey: { label: 'API Key', type: 'password', placeholder: 'sk-...' },
  };
}

async function validateCredentials(creds) {
  const key = (creds && creds.apiKey) || getApiKey();
  if (!key) return false;
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` },
    }, 8000);
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = {
  id: 'deepseek',
  name: 'DeepSeek',
  color: '#536AE6',
  mascot: 'seeker',
  models: MODELS,
  modelCosts: MODEL_COSTS,
  fetchUsage,
  getCredentialFields,
  validateCredentials,
};
