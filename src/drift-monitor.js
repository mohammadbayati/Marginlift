// Causal drift monitor.
//
// "Causal drift" measures how far the model's *predicted* incremental profit
// has drifted from the *actual* incremental profit verified against a holdout
// (control) group. It feeds the Phase 3 orchestration circuit breaker: when
// drift crosses the configured threshold the model is treated as degraded and
// SEND commands are auto-halted until an owner resets.
//
// The predicted vs. observed figures come from the existing outcome analysis
// (src/pilot.js -> analyzeOutcomeRows -> summary.{predicted,observed}IncrementalProfit),
// so this closes the loop on data the platform already produces — no new model.

const EPSILON = 1; // guards divide-by-zero when both figures are ~0

// Pure: relative deviation between predicted and observed incremental profit.
// 0 = perfect calibration, 1 = off by 100% of the larger magnitude, >1 = worse.
function computeCausalDrift(predicted, observed) {
  const p = Number(predicted) || 0;
  const o = Number(observed) || 0;
  const denom = Math.max(Math.abs(p), Math.abs(o), EPSILON);
  return Math.round((Math.abs(o - p) / denom) * 10000) / 10000;
}

// Derive drift from an org's latest outcome record. Returns { drift: 0,
// hasSignal: false } when there is no measurable outcome yet — so an org
// without verification data is never auto-halted.
function assessOutcomeDrift(outcomeRecord) {
  const summary = outcomeRecord && outcomeRecord.summary;
  if (!summary) return { drift: 0, hasSignal: false };
  const { predictedIncrementalProfit: predicted, observedIncrementalProfit: observed } = summary;
  if (predicted == null || observed == null) return { drift: 0, hasSignal: false };
  return { drift: computeCausalDrift(predicted, observed), hasSignal: true };
}

// Latest outcome record for an org from a db snapshot (most recent first).
function latestOutcomeForOrg(db, organizationId) {
  return (db.outcomes || [])
    .filter(o => o.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

module.exports = { computeCausalDrift, assessOutcomeDrift, latestOutcomeForOrg };
