'use strict';

/**
 * Resolve per-million-token pricing for a model id.
 */
function resolveModelCosts(model, modelCosts) {
  if (!model || !modelCosts) return null;
  if (modelCosts[model]) return modelCosts[model];
  const key = Object.keys(modelCosts).find(k => model.startsWith(k) || model.includes(k));
  return key ? modelCosts[key] : null;
}

function estimateTokenCost(tokensIn, tokensOut, model, modelCosts) {
  const costs = resolveModelCosts(model, modelCosts);
  if (!costs) return 0;
  return (tokensIn / 1e6) * costs.input + (tokensOut / 1e6) * costs.output;
}

function sumUsageCosts(entries, modelCosts) {
  return entries.reduce(
    (sum, e) => sum + estimateTokenCost(e.tokensIn || 0, e.tokensOut || 0, e.model, modelCosts),
    0
  );
}

function roundCost(usd) {
  return Math.round(usd * 10000) / 10000;
}

module.exports = {
  resolveModelCosts,
  estimateTokenCost,
  sumUsageCosts,
  roundCost,
};
