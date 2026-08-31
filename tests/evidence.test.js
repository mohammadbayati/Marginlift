const assert = require("assert");

const {
  evidenceMeta,
  normalizeEvidenceLevel,
  resolveRetentionEvidence
} = require("../src/evidence");

assert.strictEqual(normalizeEvidenceLevel("observational_baseline"), "observational_estimate");
assert.strictEqual(evidenceMeta("shadow_result").labelFa, "نتیجه Shadow");
assert.strictEqual(resolveRetentionEvidence(), "none");
assert.strictEqual(resolveRetentionEvidence({ analysis: {} }), "observational_estimate");
assert.strictEqual(resolveRetentionEvidence({ analysis: {}, shadowRun: {} }), "shadow_result");
assert.strictEqual(resolveRetentionEvidence({ outcome: { integrity: { decisionEligible: true }, summary: { financeVerificationStatus: "pending" } } }), "pilot_estimate");
assert.strictEqual(resolveRetentionEvidence({ outcome: { integrity: { decisionEligible: true }, summary: { financeVerificationStatus: "verified" } } }), "verified_incremental");

console.log("evidence.test.js passed");
