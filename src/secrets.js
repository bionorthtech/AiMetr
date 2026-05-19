'use strict';

const { spawnSync } = require('child_process');

const KEYCHAIN_SERVICE = 'AIMetr';
const SECRET_PROVIDERS = new Set(['claude', 'openai', 'deepseek']);

let _store = null;

function store() {
  if (!_store) _store = require('./store').store;
  return _store;
}

function keychainSupported() {
  return process.platform === 'darwin';
}

function getFromKeychain(account) {
  const r = spawnSync('security', [
    'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w',
  ], { encoding: 'utf8', timeout: 5000 });
  if (r.status === 0 && r.stdout) return r.stdout.trim();
  return '';
}

function deleteFromKeychain(account) {
  spawnSync('security', [
    'delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account,
  ], { stdio: 'ignore', timeout: 5000 });
}

function setInKeychain(account, secret) {
  deleteFromKeychain(account);
  if (!secret) return true;
  const r = spawnSync('security', [
    'add-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w', secret, '-U',
  ], { encoding: 'utf8', timeout: 5000 });
  return r.status === 0;
}

function getApiKey(providerId) {
  if (!SECRET_PROVIDERS.has(providerId)) return '';

  if (keychainSupported()) {
    const kc = getFromKeychain(providerId);
    if (kc) return kc;
  }

  return store().get(`providers.${providerId}.apiKey`, '');
}

function setApiKey(providerId, apiKey) {
  if (!SECRET_PROVIDERS.has(providerId)) return;

  if (keychainSupported()) {
    if (apiKey) {
      setInKeychain(providerId, apiKey);
      store().set(`providers.${providerId}.apiKey`, '');
      store().set(`providers.${providerId}.keyStoredInKeychain`, true);
    } else {
      deleteFromKeychain(providerId);
      store().set(`providers.${providerId}.apiKey`, '');
      store().set(`providers.${providerId}.keyStoredInKeychain`, false);
    }
    return;
  }

  store().set(`providers.${providerId}.apiKey`, apiKey || '');
  store().set(`providers.${providerId}.keyStoredInKeychain`, false);
}

function hasStoredKey(providerId) {
  if (!SECRET_PROVIDERS.has(providerId)) return false;
  if (store().get(`providers.${providerId}.keyStoredInKeychain`, false)) return true;
  const key = getApiKey(providerId);
  return !!(key && key.length > 10);
}

function migratePlaintextKeys() {
  if (!keychainSupported()) return;
  SECRET_PROVIDERS.forEach(id => {
    const key = store().get(`providers.${id}.apiKey`, '');
    if (key && key.length > 10) {
      setApiKey(id, key);
    } else {
      store().set(`providers.${id}.apiKey`, '');
    }
  });
}

module.exports = {
  KEYCHAIN_SERVICE,
  SECRET_PROVIDERS,
  keychainSupported,
  getApiKey,
  setApiKey,
  hasStoredKey,
  migratePlaintextKeys,
};
