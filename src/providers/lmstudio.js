'use strict';

const { fetchWithTimeout } = require('../fetch');
const { getProviderConfig } = require('../store');

const DEFAULT_BASE_URL = 'http://localhost:1234';

function getBaseUrl() {
  const cfg = getProviderConfig('lmstudio');
  return (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
}

async function fetchUsage() {
  const base = getBaseUrl();

  try {
    const modelsRes = await fetchWithTimeout(`${base}/v1/models`, {}, 4000);
    if (!modelsRes.ok) return emptyResult('LM Studio not reachable at ' + base);

    const modelsBody = await modelsRes.json();
    const models = (modelsBody.data || []).map(m => m.id);

    let memUsed = 0, memTotal = 0;
    try {
      const sysRes = await fetchWithTimeout(`${base}/api/v0/system`, {}, 4000);
      if (sysRes.ok) {
        const sys = await sysRes.json();
        memUsed  = sys.ram?.used  || 0;
        memTotal = sys.ram?.total || 0;
      }
    } catch (_) {}

    let activeModel = models[0] || '';
    try {
      const activeRes = await fetchWithTimeout(`${base}/api/v0/models`, {}, 4000);
      if (activeRes.ok) {
        const activeBody = await activeRes.json();
        const loaded = (activeBody.data || []).filter(m => m.state === 'loaded');
        if (loaded.length > 0) activeModel = loaded[0].id;
      }
    } catch (_) {}

    const pct = memTotal > 0 ? Math.min(100, Math.round((memUsed / memTotal) * 100)) : 0;

    return {
      provider: 'lmstudio',
      connected: true,
      error: null,
      session: { used: memUsed, limit: memTotal || 1, resetAt: 0, pct },
      period:  { used: memUsed, limit: memTotal || 1, resetAt: 0, pct },
      cost:    { session: 0, period: 0 },
      models: models.length > 0 ? models : ['(no models loaded)'],
      activeModel,
      lastFetched: Date.now(),
      extra: { memUsed, memTotal },
    };
  } catch (err) {
    return emptyResult(`LM Studio not running: ${err.message}`);
  }
}

function emptyResult(error) {
  return {
    provider: 'lmstudio',
    connected: false,
    error,
    session: { used: 0, limit: 0, resetAt: 0, pct: 0 },
    period:  { used: 0, limit: 0, resetAt: 0, pct: 0 },
    cost:    { session: 0, period: 0 },
    models: [],
    activeModel: '',
    lastFetched: Date.now(),
  };
}

function getCredentialFields() {
  return {
    baseUrl: { label: 'Base URL', type: 'text', placeholder: 'http://localhost:1234' },
  };
}

async function validateCredentials(creds) {
  const url = (creds && creds.baseUrl) || getBaseUrl();
  try {
    const res = await fetchWithTimeout(`${url.replace(/\/$/, '')}/v1/models`, {}, 4000);
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = {
  id: 'lmstudio',
  name: 'LM Studio (Local)',
  color: '#9C27B0',
  mascot: 'studio',
  models: [],
  modelCosts: {},
  fetchUsage,
  getCredentialFields,
  validateCredentials,
};
