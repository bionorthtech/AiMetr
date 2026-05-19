'use strict';

const Store = require('electron-store');
const secrets = require('./secrets');

const schema = {
  providers: {
    type: 'object',
    default: {},
    properties: {
      claude:    { type: 'object', default: { enabled: true,  apiKey: '', keyStoredInKeychain: false } },
      openai:    { type: 'object', default: { enabled: false, apiKey: '', keyStoredInKeychain: false } },
      deepseek:  { type: 'object', default: { enabled: false, apiKey: '', keyStoredInKeychain: false } },
      ollama:    { type: 'object', default: { enabled: true,  baseUrl: 'http://localhost:11434' } },
      lmstudio:  { type: 'object', default: { enabled: false, baseUrl: 'http://localhost:1234' } },
    },
  },
  pet: {
    type: 'object',
    default: {},
    properties: {
      enabled:  { type: 'boolean', default: true },
      position: { type: 'object',  default: { x: 100, y: 100 } },
      scale:    { type: 'number',  default: 1 },
    },
  },
  ui: {
    type: 'object',
    default: {},
    properties: {
      theme:             { type: 'string',  default: 'dark' },
      pollInterval:      { type: 'number',  default: 30 },
      dashboardBounds:   { type: 'object', default: {} },
      hasCompletedSetup: { type: 'boolean', default: false },
    },
  },
  history: {
    type: 'object',
    default: { snapshots: [] },
  },
};

const store = new Store({ schema });

function getProviderConfig(id) {
  return store.get(`providers.${id}`, {});
}

function setProviderConfig(id, data) {
  const existing = getProviderConfig(id);
  const merged = { ...existing, ...data };

  if (Object.prototype.hasOwnProperty.call(data, 'apiKey')) {
    secrets.setApiKey(id, data.apiKey || '');
    merged.keyStoredInKeychain = secrets.hasStoredKey(id);
  }

  // Never persist API keys in electron-store for cloud providers (Keychain or memory only)
  if (secrets.SECRET_PROVIDERS.has(id)) {
    delete merged.apiKey;
  }

  store.set(`providers.${id}`, merged);
}

function getProviderApiKey(id) {
  return secrets.getApiKey(id);
}

function addSnapshot(snapshot) {
  const snapshots = store.get('history.snapshots', []);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const pruned = snapshots.filter(s => s.ts > cutoff);
  if (pruned.length >= 8640) pruned.shift();
  pruned.push(snapshot);
  store.set('history.snapshots', pruned);
}

function getHistory(providerId, hoursBack = 24) {
  const snapshots = store.get('history.snapshots', []);
  const cutoff = Date.now() - hoursBack * 3600 * 1000;
  const filtered = snapshots.filter(s => s.ts > cutoff && s.providers && s.providers[providerId]);
  return {
    timestamps: filtered.map(s => s.ts),
    values: filtered.map(s => s.providers[providerId]),
  };
}

module.exports = {
  store,
  getProviderConfig,
  setProviderConfig,
  getProviderApiKey,
  addSnapshot,
  getHistory,
};
