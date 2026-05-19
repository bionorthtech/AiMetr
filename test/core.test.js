'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const BACKOFF_INTERVALS = [0, 10000, 30000, 60000, 120000, 300000];

function nextBackoffMs(failures) {
  const idx = Math.min(failures, BACKOFF_INTERVALS.length - 1);
  return BACKOFF_INTERVALS[idx];
}

describe('poller backoff', () => {
  it('uses escalating intervals capped at max', () => {
    assert.equal(nextBackoffMs(0), 0);
    assert.equal(nextBackoffMs(1), 10000);
    assert.equal(nextBackoffMs(3), 60000);
    assert.equal(nextBackoffMs(99), 300000);
  });
});

describe('secrets', () => {
  const secrets = require('../src/secrets');

  it('reports keychain support on darwin only', () => {
    const supported = process.platform === 'darwin';
    assert.equal(secrets.keychainSupported(), supported);
  });

  it('tracks secret provider ids', () => {
    assert.ok(secrets.SECRET_PROVIDERS.has('claude'));
    assert.ok(secrets.SECRET_PROVIDERS.has('openai'));
    assert.ok(!secrets.SECRET_PROVIDERS.has('ollama'));
  });
});

describe('ble payload', () => {
  const { buildPayload } = require('../src/ble');

  it('builds v2 multi-provider JSON', () => {
    const state = {
      claude: {
        connected: true,
        session: { pct: 42, used: 42000, limit: 100000, resetAt: Date.now() + 3600000 },
        period: { pct: 20 },
        cost: { session: 1.25 },
        activeModel: 'claude-sonnet-4-6',
      },
    };
    const payload = JSON.parse(buildPayload(state, []));
    assert.equal(payload.v, 2);
    assert.equal(payload.providers.claude.pct, 42);
    assert.equal(payload.providers.claude.model, 'claude-sonnet-4-6');
    assert.ok(Array.isArray(payload.tasks));
  });
});
