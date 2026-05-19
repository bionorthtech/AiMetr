'use strict';

const { fetchWithTimeout } = require('../fetch');
const { getProviderConfig } = require('../store');

const DEFAULT_BASE_URL = 'http://localhost:11434';

function getBaseUrl() {
  const cfg = getProviderConfig('ollama');
  return (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
}

async function fetchUsage() {
  const base = getBaseUrl();

  try {
    const tagsRes = await fetchWithTimeout(`${base}/api/tags`, {}, 4000);
    if (!tagsRes.ok) return emptyResult('Ollama not reachable at ' + base);

    const tagsBody = await tagsRes.json();
    const models = (tagsBody.models || []).map(m => m.name);

    let runningModel = null;
    let vramUsed = 0;
    let vramTotal = 0;
    try {
      const psRes = await fetchWithTimeout(`${base}/api/ps`, {}, 4000);
      if (psRes.ok) {
        const psBody = await psRes.json();
        const procs = psBody.models || [];
        if (procs.length > 0) {
          runningModel = procs[0].name;
          vramUsed  = procs.reduce((s, m) => s + (m.size_vram || 0), 0);
          vramTotal = procs[0].size || procs[0].details?.parameter_size || 8_000_000_000;
        }
      }
    } catch (_) {}

    const pct = vramTotal > 0 ? Math.min(100, Math.round((vramUsed / vramTotal) * 100)) : 0;

    return {
      provider: 'ollama',
      connected: true,
      error: null,
      session: { used: vramUsed, limit: vramTotal || 1, resetAt: 0, pct },
      period:  { used: vramUsed, limit: vramTotal || 1, resetAt: 0, pct },
      cost:    { session: 0, period: 0 },
      models: models.length > 0 ? models : ['(no models loaded)'],
      activeModel: runningModel || models[0] || '',
      lastFetched: Date.now(),
      extra: { runningModel, vramUsed, vramTotal },
    };
  } catch (err) {
    return emptyResult(`Ollama not running: ${err.message}`);
  }
}

function emptyResult(error) {
  return {
    provider: 'ollama',
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
    baseUrl: { label: 'Base URL', type: 'text', placeholder: 'http://localhost:11434' },
  };
}

async function validateCredentials(creds) {
  const url = (creds && creds.baseUrl) || getBaseUrl();
  try {
    const res = await fetchWithTimeout(`${url.replace(/\/$/, '')}/api/tags`, {}, 4000);
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = {
  id: 'ollama',
  name: 'Ollama (Local)',
  color: '#F9A825',
  mascot: 'llami',
  models: [],
  modelCosts: {},
  fetchUsage,
  getCredentialFields,
  validateCredentials,
};
