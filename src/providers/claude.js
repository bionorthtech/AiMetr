'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchWithTimeout } = require('../fetch');
const { getProviderApiKey } = require('../store');
const tracker = require('../tracker');
const { estimateTokenCost, sumUsageCosts, roundCost } = require('../cost');

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
  const stored = getProviderApiKey('claude');
  if (stored && stored.length > 10) return stored;

  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  if (fs.existsSync(credPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      const key = raw.claudeAiOauth?.accessToken || raw.apiKey || raw.api_key
        || raw.claudeAiOauthToken || raw.oauth_token;
      if (key) return key;
    } catch (_) {}
  }

  if (process.platform === 'darwin') {
    try {
      const key = execSync('security find-generic-password -s "claude.ai" -w 2>/dev/null', {
        timeout: 3000,
        encoding: 'utf8',
      }).trim();
      if (key) return key;
    } catch (_) {}
    try {
      const key = execSync('security find-generic-password -s "Claude API Key" -w 2>/dev/null', {
        timeout: 3000,
        encoding: 'utf8',
      }).trim();
      if (key) return key;
    } catch (_) {}
  }

  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  return null;
}

async function fetchUsage() {
  const apiKey = getApiKey();
  if (!apiKey) {
    return emptyResult('No Claude API key found. Add it in Settings or run Claude Code first.');
  }

  try {
    // Minimal messages request — same approach as the Python daemon (rate-limit headers)
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    }, 15000);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return emptyResult(`Claude API error: ${body.error?.message || res.status}`);
    }

    const remaining = parseInt(res.headers.get('anthropic-ratelimit-tokens-remaining') || '0', 10);
    const limit     = parseInt(res.headers.get('anthropic-ratelimit-tokens-limit')     || '0', 10);
    const resetStr  = res.headers.get('anthropic-ratelimit-tokens-reset');
    const resetAt   = resetStr ? new Date(resetStr).getTime() : Date.now() + 60000;

    const used = limit > 0 ? Math.max(0, limit - remaining) : 0;
    const pct  = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    let activeModel = MODELS[0];
    try {
      const body = await res.json();
      if (body.model) activeModel = body.model;
    } catch (_) {}

    const usage = tracker.getClaudeUsageSummary();
    const sessionCost = roundCost(
      estimateTokenCost(
        usage.session.tokensIn, usage.session.tokensOut,
        usage.session.model || activeModel, MODEL_COSTS
      )
    );
    const periodCost = roundCost(sumUsageCosts(usage.period.entries, MODEL_COSTS));

    return {
      provider: 'claude',
      connected: true,
      error: null,
      session: { used, limit, resetAt, pct },
      period:  { used, limit, resetAt, pct },
      cost:    { session: sessionCost, period: periodCost },
      models: MODELS,
      activeModel,
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
  const key = (creds && creds.apiKey) || getApiKey();
  if (!key) return false;
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    }, 8000);
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
