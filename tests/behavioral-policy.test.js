const assert = require("assert");

const { buildBehavioralWorkspace } = require("../src/behavioral-policy");

function overview({ control = false, margin = false } = {}) {
  return {
    summary: { atRiskAudience: 240 },
    evidence: [
      { labelFa: "کنترل معتبر", status: control ? "pass" : "warn" },
      { labelFa: "مدل هزینه", status: margin ? "pass" : "warn" }
    ]
  };
}

function retentionState({ baseline = false, coverageDays = 0 } = {}) {
  return {
    workspace: {
      status: baseline ? "baseline_ready" : "awaiting_data",
      evidenceLevel: baseline ? "observational_baseline" : "no_evidence",
      metrics: { coverageDays },
      states: [
        { key: "due", count: 30 },
        { key: "lapsed", count: 18 },
        { key: "dormant", count: 12 },
        { key: "long_term_lost", count: 7 }
      ]
    }
  };
}

const empty = buildBehavioralWorkspace({ retentionState: retentionState(), overview: overview() });
assert.strictEqual(empty.status, "needs_baseline");
assert.strictEqual(empty.individualPsychologyInference, false);
assert.ok(empty.candidates.every(item => item.individualDiagnosis === false));
assert.ok(empty.candidates.every(item => item.targetLevel === "segment_or_policy"));
assert.ok(empty.candidates.every(item => item.evidenceLevel === "hypothesis_only"));

const shadow = buildBehavioralWorkspace({
  retentionState: retentionState({ baseline: true, coverageDays: 180 }),
  overview: overview({ control: false, margin: true })
});
assert.strictEqual(shadow.status, "ready_for_shadow");
assert.strictEqual(shadow.candidates.find(item => item.id === "incentive_eligibility_test").status, "blocked");
assert.strictEqual(shadow.ethicalContract.find(item => item.key === "holdout_required").status, "blocked");

const controlled = buildBehavioralWorkspace({
  retentionState: retentionState({ baseline: true, coverageDays: 180 }),
  overview: overview({ control: true, margin: true }),
  behavioralExperiment: {
    id: "behavioral_experiment_1",
    registeredAt: "2026-08-11T08:00:00.000Z",
    holdoutRate: 0.2,
    outcomeClosedAt: "2026-09-11T08:00:00.000Z"
  }
});
assert.strictEqual(controlled.status, "ready_for_controlled_test");
assert.strictEqual(controlled.candidates.find(item => item.id === "incentive_eligibility_test").status, "experiment_ready");
assert.strictEqual(controlled.safeguards.find(item => item.key === "outcome_bias").status, "pass");
assert.ok(controlled.ethicalContract.some(item => item.key === "frequency_cap" && item.status === "blocked"));
assert.ok(controlled.ethicalContract.some(item => item.key === "opt_out" && item.status === "blocked"));

const safetyReady = buildBehavioralWorkspace({
  retentionState: retentionState({ baseline: true, coverageDays: 180 }),
  overview: overview({ control: true, margin: true }),
  contactSafety: {
    summary: { blockedByFrequencyCap: 2, blockedByOptOut: 1 },
    checks: [
      { key: "consent", status: "pass" },
      { key: "opt_out", status: "pass" },
      { key: "preferred_channel", status: "pass" },
      { key: "frequency_cap", status: "pass" }
    ]
  }
});
assert.strictEqual(safetyReady.ethicalContract.find(item => item.key === "frequency_cap").status, "pass");
assert.strictEqual(safetyReady.ethicalContract.find(item => item.key === "opt_out").status, "pass");

const unrelatedCampaignEvidence = buildBehavioralWorkspace({
  retentionState: retentionState({ baseline: true, coverageDays: 180 }),
  overview: overview({ control: true, margin: true })
});
assert.strictEqual(unrelatedCampaignEvidence.status, "ready_for_shadow");
assert.strictEqual(unrelatedCampaignEvidence.ethicalContract.find(item => item.key === "holdout_required").status, "blocked");

const staleBaseline = retentionState({ baseline: true, coverageDays: 180 });
staleBaseline.stale = true;
staleBaseline.workspace.status = "configuration_changed";
assert.strictEqual(buildBehavioralWorkspace({ retentionState: staleBaseline, overview: overview() }).status, "needs_baseline");

console.log("behavioral-policy.test.js passed");
