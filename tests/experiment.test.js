const assert = require("assert");

const { auditOutcomeRows, buildExperimentRecord, evaluateSrm, hashDataset } = require("../src/experiment");

const customerRows = [
  ...Array.from({ length: 100 }, (_, index) => assignmentRow(`C-${index + 1}`, "control", false)),
  ...Array.from({ length: 100 }, (_, index) => assignmentRow(`T-${index + 1}`, "small_discount", true))
];

const experiment = buildExperimentRecord({
  id: "exp_test",
  organizationId: "org_test",
  customerAnalysisId: "cus_test",
  name: "Experiment integrity test",
  rows: customerRows,
  csvText: "customer_id,treatment\nexample,control",
  assignmentMethod: "randomized",
  randomizationEvidence: { verified: true, source: "server_generated", algorithm: "test" },
  outcomeWindowDays: 30,
  createdAt: "2026-01-01T00:00:00.000Z"
});

assert.strictEqual(experiment.assignmentIntegrity.passed, true);
assert.strictEqual(experiment.design.expectedAllocation.control, 100);
assert.strictEqual(experiment.design.expectedAllocation.small_discount, 100);
assert.ok(experiment.dataset.hash.startsWith("sha256:"));
assert.strictEqual(hashDataset("a\r\nb\n"), hashDataset("a\nb"));

const completeOutcome = [
  ...Array.from({ length: 100 }, (_, index) => outcomeRow(`C-${index + 1}`, "control", "")),
  ...Array.from({ length: 100 }, (_, index) => outcomeRow(`T-${index + 1}`, "small_discount", "2026-01-01"))
];

const healthyAudit = auditOutcomeRows(experiment, completeOutcome, { analyzedAt: "2026-02-15T00:00:00.000Z" });
assert.strictEqual(healthyAudit.fatal, false);
assert.strictEqual(healthyAudit.decisionEligible, true);
assert.strictEqual(healthyAudit.status, "pass");
assert.strictEqual(healthyAudit.summary.coverage, 1);

const unverifiedExperiment = buildExperimentRecord({
  id: "exp_unverified",
  organizationId: "org_test",
  customerAnalysisId: "cus_test",
  name: "Unverified randomization claim",
  rows: customerRows,
  csvText: "customer_id,treatment\nexample,control",
  assignmentMethod: "randomized",
  outcomeWindowDays: 30,
  createdAt: "2026-01-01T00:00:00.000Z"
});
const unverifiedAudit = auditOutcomeRows(unverifiedExperiment, completeOutcome, { analyzedAt: "2026-02-15T00:00:00.000Z" });
assert.strictEqual(unverifiedAudit.decisionEligible, false);
assert.ok(unverifiedAudit.checks.some(item => item.key === "randomization" && !item.passed));

const duplicateAudit = auditOutcomeRows(experiment, [...completeOutcome, completeOutcome[0]], { analyzedAt: "2026-02-15T00:00:00.000Z" });
assert.strictEqual(duplicateAudit.fatal, true);
assert.ok(duplicateAudit.fatalIssues.some(item => item.key === "duplicate_outcome"));

const mismatchedOutcome = completeOutcome.map(row => ({ ...row }));
mismatchedOutcome[100].assignedGroup = "high_incentive";
const mismatchAudit = auditOutcomeRows(experiment, mismatchedOutcome, { analyzedAt: "2026-02-15T00:00:00.000Z" });
assert.strictEqual(mismatchAudit.fatal, true);
assert.ok(mismatchAudit.fatalIssues.some(item => item.key === "assignment_mismatch"));

const missingExposure = completeOutcome.map(row => ({ ...row }));
missingExposure[100].exposedAt = "";
const exposureAudit = auditOutcomeRows(experiment, missingExposure, { analyzedAt: "2026-02-15T00:00:00.000Z" });
assert.strictEqual(exposureAudit.fatal, true);
assert.ok(exposureAudit.fatalIssues.some(item => item.key === "missing_exposure_at"));

const openWindowAudit = auditOutcomeRows(experiment, completeOutcome, { analyzedAt: "2026-01-15T00:00:00.000Z" });
assert.strictEqual(openWindowAudit.fatal, false);
assert.strictEqual(openWindowAudit.decisionEligible, false);
assert.ok(openWindowAudit.checks.some(item => item.key === "outcome_window" && !item.passed));

const retrospectiveExperiment = buildExperimentRecord({
  id: "exp_retrospective",
  organizationId: "org_test",
  customerAnalysisId: "cus_test",
  name: "Retrospective registration",
  rows: customerRows,
  csvText: "customer_id,treatment\nexample,control",
  assignmentMethod: "randomized",
  randomizationEvidence: { verified: true, source: "server_generated", algorithm: "test" },
  outcomeWindowDays: 30,
  createdAt: "2026-01-02T00:00:00.000Z"
});
const retrospectiveAudit = auditOutcomeRows(retrospectiveExperiment, completeOutcome, { analyzedAt: "2026-02-15T00:00:00.000Z" });
assert.strictEqual(retrospectiveAudit.decisionEligible, false);
assert.ok(retrospectiveAudit.checks.some(item => item.key === "preregistration" && !item.passed));

const partialOutcome = [...completeOutcome.slice(0, 100), ...completeOutcome.slice(100, 120)];
const srmAudit = auditOutcomeRows(experiment, partialOutcome, { analyzedAt: "2026-02-15T00:00:00.000Z" });
assert.strictEqual(srmAudit.fatal, false);
assert.strictEqual(srmAudit.decisionEligible, false);
assert.ok(srmAudit.checks.some(item => item.key === "srm" && !item.passed));
assert.ok(srmAudit.summary.srmPValue < 0.01);

const directSrm = evaluateSrm({ control: 100, small_discount: 100 }, partialOutcome);
assert.strictEqual(directSrm.passed, false);

function assignmentRow(customerId, treatment, exposed) {
  return { customerId, treatment, exposed };
}

function outcomeRow(customerId, assignedGroup, exposedAt) {
  return {
    customerId,
    assignedGroup,
    exposedAt,
    converted: false,
    outcomeRevenue: 0,
    actualIncentiveCost: 0,
    actualChannelCost: 0,
    grossMarginRate: 0.35
  };
}

console.log("experiment.test.js passed");
