'use strict';

const fetch = require('node-fetch');
const { getProviderConfig } = require('../store');

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
  const cfg = getProviderConfig('deepseek');
  if (cfg.apiKey && cfg.apiKey.length > 10) return cfg.apiKey;
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  return null;
}

async function fetchUsage() {
  const apiKey = getApiKey();
  if (!apiKey) return emptyResult('No DeepSeek API key configured.');

  try {
    // DeepSeek uses an OpenAI-compatible API
    const res = await fetch(`${BASE_URL}/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return emptyResult(`DeepSeek error: ${body.error?.message || res.status}`);
    }

    // DeepSeek doesn't expose rate-limit headers on the models endpoint;
    // use balance endpoint if available
    let balanceUsed = 0, balanceLimit = 0;
    try {
      const balRes = await fetch(`${BASE_URL}/user/balance`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (balRes.ok) {
        const bal = await balRes.json();
        // balance is in USD; normalise to a 0-100% scale against a $10 baseline
        const usdAvailable = parseFloat(bal.balance_infos?.[0]?.total_balance || '0');
        balanceUsed  = Math.max(0, 10.0 - usdAvailable);
        balanceLimit = 10.0;
      }
    } catch (_) {}

    const pct = balanceLimit > 0 ? Math.round((balanceUsed / balanceLimit) * 100) : 0;

    return {
      provider: 'deepseek',
      connected: true,
      error: null,
      session: { used: Math.round(balanceUsed * 1000), limit: Math.round(balanceLimit * 1000), resetAt: 0, pct },
      period:  { used: Math.round(balanceUsed * 1000), limit: Math.round(balanceLimit * 1000), resetAt: 0, pct },
      cost:    { session: balanceUsed, period: balanceUsed },
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
  const key = creds.apiKey || '';
  if (!key) return false;
  try {
    const res = await fetch(`${BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
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
