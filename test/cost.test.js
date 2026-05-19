'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveModelCosts,
  estimateTokenCost,
  sumUsageCosts,
  roundCost,
} = require('../src/cost');

describe('cost', () => {
  const MODEL_COSTS = {
    'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
    'gpt-4o': { input: 5.0, output: 15.0 },
  };

  it('resolves exact and prefix model ids', () => {
    assert.deepEqual(resolveModelCosts('claude-sonnet-4-6', MODEL_COSTS), MODEL_COSTS['claude-sonnet-4-6']);
    assert.deepEqual(resolveModelCosts('claude-sonnet-4-6-20251001', MODEL_COSTS), MODEL_COSTS['claude-sonnet-4-6']);
    assert.equal(resolveModelCosts('unknown-model', MODEL_COSTS), null);
  });

  it('estimates token cost per million', () => {
    const cost = estimateTokenCost(1_000_000, 500_000, 'gpt-4o', MODEL_COSTS);
    assert.equal(cost, 5.0 + 7.5);
  });

  it('sums usage entries with mixed models', () => {
    const total = sumUsageCosts([
      { tokensIn: 1000, tokensOut: 500, model: 'gpt-4o' },
      { tokensIn: 2000, tokensOut: 1000, model: 'claude-sonnet-4-6' },
    ], MODEL_COSTS);
    assert.ok(total > 0);
  });

  it('rounds to four decimal places', () => {
    assert.equal(roundCost(0.123456), 0.1235);
  });
});
