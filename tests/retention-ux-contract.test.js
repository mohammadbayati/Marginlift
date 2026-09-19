const assert = require("assert");

const { EVIDENCE_LEVELS } = require("../src/truth-contract");
const {
  QUALITY_SEVERITIES,
  TODAY_STATES,
  buildRetentionDecisionReceipt,
  buildRetentionPreviewContract,
  buildRetentionReadout,
  buildRetentionToday,
  createRetentionDecisionId,
  enrichRetentionWorkspace,
  matchesExpectedDatasetHash
} = require("../src/retention-ux");

const decision = {
  customerIdHash: "hash_1",
  channel: "primary_store",
  productType: "general",
  state: "lapsed",
  recommendedAction: "channel_nudge_test",
  recommendedActionFa: "پیام بازگشت بدون تخفیف",
  decisionReasonFa: "Observed cadence suggests a shadow test.",
  incentiveAllowed: false,
  actionAllowed: false,
  policyVersion: "policy_v1"
};
decision.id = createRetentionDecisionId(decision, { analysisId: "ret_1" });

const readyRecord = {
  id: "ret_1",
  organizationId: "org_1",
  name: "Retention analysis",
  source: "customer_upload",
  rowCount: 12,
  datasetHash: "sha256:dataset",
  cutoffAt: "2026-01-31T00:00:00.000Z",
  createdAt: "2026-02-01T00:00:00.000Z",
  configurationHash: "config_v1",
  readiness: {
    status: "ready",
    score: 90,
    summary: { transactionRows: 12, uniqueCustomers: 6, repeatCustomers: 4, coverageDays: 200 },
    checks: [],
    warnings: []
  },
  baseline: {
    baselineVersion: "baseline_v1",
    overall: { medianTimeToRepurchaseDays: null },
    modelCard: { datasetVersion: "dataset_v1", modelVersion: "model_v1" }
  },
  decisionQueue: [decision],
  workspace: {
    status: "baseline_ready",
    policyVersion: "policy_v1",
    metrics: { medianRepurchaseDays: null },
    states: [{ key: "lapsed", labelFa: "عبور از چرخه", count: 1, share: 1 }],
    queue: [decision],
    contactSafety: { contractReady: false, summary: { actionAllowed: 0 } }
  }
};

const preview = buildRetentionPreviewContract({
  rowCount: 1,
  readyForImport: true,
  missingRequired: [],
  privacy: { blocked: true, piiHeaders: ["email"], exposedIdentifiers: 0 },
  readiness: {
    checks: [{ key: "history", passed: false, blocking: false, detailFa: "history is short" }],
    warnings: []
  }
}, { csvText: "customer_id_hash,email\nhash_1,person@example.com" });

assert.match(preview.datasetHash, /^sha256:[a-f0-9]{64}$/);
assert.strictEqual(preview.canImport, false);
assert.deepStrictEqual(QUALITY_SEVERITIES, ["error", "warning", "info"]);
assert.deepStrictEqual(Object.keys(preview.quality.severityCounts), QUALITY_SEVERITIES);
assert.deepStrictEqual(new Set(preview.qualityIssues.map(item => item.severity)), new Set(QUALITY_SEVERITIES));
assert.strictEqual(preview.claimBoundary.evidenceLevel, EVIDENCE_LEVELS.OBSERVED);
assert.strictEqual(preview.claimBoundary.canClaimCausality, false);
assert.strictEqual(matchesExpectedDatasetHash(preview.datasetHash, preview.datasetHash), true);
assert.strictEqual(matchesExpectedDatasetHash("sha256:old", preview.datasetHash), false);

assert.deepStrictEqual(TODAY_STATES, [
  "awaiting_data",
  "needs_data_fix",
  "observational_ready",
  "shadow_ready",
  "pilot_registered",
  "needs_review",
  "verified"
]);
assert.strictEqual(buildRetentionToday({}).state, "awaiting_data");
assert.strictEqual(buildRetentionToday({ record: { ...readyRecord, readiness: { status: "needs_data_fix" } } }).state, "needs_data_fix");

const observational = buildRetentionToday({ record: readyRecord, workspace: readyRecord.workspace });
assert.strictEqual(observational.state, "observational_ready");
assert.strictEqual(observational.primaryMetric.value, null);
assert.strictEqual(observational.primaryMetric.available, false);

const shadowRun = { id: "shadow_1", status: "ready", createdAt: "2026-02-02T00:00:00.000Z" };
assert.strictEqual(buildRetentionToday({ record: readyRecord, workspace: readyRecord.workspace, shadowRun }).state, "shadow_ready");
const experiment = { id: "exp_1", status: "registered" };
assert.strictEqual(buildRetentionToday({ record: readyRecord, workspace: readyRecord.workspace, shadowRun, experiment }).state, "pilot_registered");
const needsReviewOutcome = { summary: { decisionStatus: "needs_review", primaryEstimatePerCustomer: null } };
assert.strictEqual(buildRetentionToday({ record: readyRecord, workspace: readyRecord.workspace, experiment, outcome: needsReviewOutcome }).state, "needs_review");
const verifiedOutcome = {
  summary: { decisionStatus: "scale", primaryEstimatePerCustomer: 1250 },
  evidenceMetadata: { evidence_level: EVIDENCE_LEVELS.VERIFIED_INCREMENTAL }
};
assert.strictEqual(buildRetentionToday({ record: readyRecord, workspace: readyRecord.workspace, experiment, outcome: verifiedOutcome }).state, "verified");

const contract = enrichRetentionWorkspace({
  configuration: { presetKey: "generic_ecommerce" },
  analysis: { id: readyRecord.id },
  stale: false,
  workspace: readyRecord.workspace
}, { record: readyRecord, organizationId: "org_1" });
assert.deepStrictEqual(Object.keys(contract.visualizations), [
  "profitWaterfall",
  "treatmentControl",
  "retentionCohort",
  "evidenceLadder"
]);
assert.strictEqual(contract.visualizations.profitWaterfall.available, false);
assert.strictEqual(contract.visualizations.profitWaterfall.data, null);
assert.strictEqual(contract.visualizations.treatmentControl.available, false);
assert.strictEqual(contract.visualizations.retentionCohort.available, true);

for (const role of ["executive", "crm", "finance", "data"]) {
  const readout = buildRetentionReadout({ contract, record: readyRecord, organization: { id: "org_1", name: "Test" } }, role);
  assert.strictEqual(readout.role, role);
  assert.strictEqual(readout.structured, true);
  assert.deepStrictEqual(readout.content, readout[role]);
}

const receipt = buildRetentionDecisionReceipt({
  record: readyRecord,
  contract,
  decisionId: decision.id,
  shadowRun
});
assert.ok(receipt);
assert.deepStrictEqual(Object.keys(receipt), [
  "schemaVersion",
  "id",
  "available",
  "decision",
  "evidence",
  "unknowns",
  "alternatives",
  "guardrails",
  "versions",
  "override"
]);
assert.strictEqual(receipt.decision.claimBoundary.canClaimCausality, false);
assert.ok(receipt.evidence.every(item => Object.values(EVIDENCE_LEVELS).includes(item.level)));
assert.strictEqual(receipt.override.applied, false);

console.log("retention-ux-contract.test.js passed");
