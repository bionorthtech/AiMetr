'use strict';

const fetch = require('node-fetch');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getProviderConfig } = require('../store');

const MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-2.1',
  'claude-2.0',
];

const MODEL_COSTS = {
  'claude-opus-4-7':             { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':           { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':            { input: 0.80,  output: 4.00  },
  'claude-3-5-sonnet-20241022':  { input: 3.00,  output: 15.00 },
  'claude-3-5-haiku-20241022':   { input: 0.80,  output: 4.00  },
  'claude-3-opus-20240229':      { input: 15.00, output: 75.00 },
  'claude-3-sonnet-20240229':    { input: 3.00,  output: 15.00 },
  'claude-3-haiku-20240307':     { input: 0.25,  output: 1.25  },
  'claude-2.1':                  { input: 8.00,  output: 24.00 },
  'claude-2.0':                  { input: 8.00,  output: 24.00 },
};

function getApiKey() {
  // 1. Check stored config
  const cfg = getProviderConfig('claude');
  if (cfg.apiKey && cfg.apiKey.length > 10) return cfg.apiKey;

  // 2. Check ~/.claude/.credentials.json
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  if (fs.existsSync(credPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      const key = raw.claudeAiOauth?.accessToken || raw.apiKey || raw.api_key;
      if (key) return key;
    } catch (_) {}
  }

  // 3. macOS Keychain
  if (process.platform === 'darwin') {
    try {
      const key = execSync('security find-generic-password -s "claude.ai" -w 2>/dev/null', {
        timeout: 3000,
        encoding: 'utf8',
      }).trim();
      if (key) return key;
    } catch (_) {}
  }

  // 4. Environment variable
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  return null;
}

let _sessionTokensUsed = 0;
let _sessionCost = 0;

async function fetchUsage() {
  const apiKey = getApiKey();
  if (!apiKey) {
    return emptyResult('No Claude API key found. Add it in Settings or run Claude Code first.');
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      timeout: 8000,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    const remaining = parseInt(res.headers.get('anthropic-ratelimit-tokens-remaining') || '0', 10);
    const limit     = parseInt(res.headers.get('anthropic-ratelimit-tokens-limit')     || '0', 10);
    const resetStr  = res.headers.get('anthropic-ratelimit-tokens-reset');
    const resetAt   = resetStr ? new Date(resetStr).getTime() : Date.now() + 60000;

    const used = limit > 0 ? Math.max(0, limit - remaining) : _sessionTokensUsed;
    const pct  = limit > 0 ? Math.round((used / limit) * 100) : 0;

    return {
      provider: 'claude',
      connected: true,
      error: null,
      session: { used, limit, resetAt, pct },
      period:  { used, limit, resetAt, pct },
      cost:    { session: _sessionCost, period: _sessionCost },
      models: MODELS,
      activeModel: MODELS[0],
      lastFetched: Date.now(),
    };
  } catch (err) {
    return emptyResult(`Claude API error: ${err.message}`);
  }
}

function emptyResult(error) {
  return {
    provider: 'claude',
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
    apiKey: { label: 'API Key', type: 'password', placeholder: 'sk-ant-api03-...' },
  };
}

async function validateCredentials(creds) {
  const key = creds.apiKey || '';
  if (!key) return false;
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = {
  id: 'claude',
  name: 'Claude (Anthropic)',
  color: '#CC785C',
  mascot: 'clawd',
  models: MODELS,
  modelCosts: MODEL_COSTS,
  fetchUsage,
  getCredentialFields,
  validateCredentials,
};
