const assert = require("assert");

const {
  analyzeRetentionOutcome,
  auditRetentionOutcome,
  buildRetentionExperimentAdmission,
  buildRetentionExperiment,
  normalizeRetentionOutcomeRows,
  retentionAssignmentCsv,
  verifyRetentionFinance
} = require("../src/retention-experiment");

const createdAt = "2025-01-01T00:00:00.000Z";
const experiment = buildRetentionExperiment({
  id: "rexp_test",
  organizationId: "org_test",
  seed: "a".repeat(64),
  createdAt,
  analysis: {
    id: "ret_test",
    decisionQueue: Array.from({ length: 40 }, (_, index) => ({ customerIdHash: `hash_${index + 1}` }))
  },
  metricContract: {
    id: "mct_test",
    version: 1,
    status: "locked",
    outcomeWindowDays: 30,
    minimumSamplePerPolicy: 20,
    primaryMetric: "incremental_contribution_profit_per_assigned_customer",
    primaryMetricFa: "سود مشارکتی افزایشی",
    decisionRules: {
      minIncrementalNetRevenuePerAssignedCustomer: 0,
      maxIncrementalIncentiveCostPerAssignedCustomer: 2000,
      maxOptOutRateDelta: 0.005,
      maxComplaintRateDelta: 0.002
    }
  },
  shadowRuns: [{ id: "shadow_1" }, { id: "shadow_2" }]
});

assert.strictEqual(experiment.status, "registered");
assert.strictEqual(experiment.assignments.length, 40);
assert.strictEqual(experiment.assignmentIntegrity.lockStatus, "locked");
assert.strictEqual(experiment.design.expectedAllocation.current_crm_policy, 20);
assert.strictEqual(experiment.design.expectedAllocation.marginlift_policy, 20);
assert.strictEqual(new Set(experiment.assignments.map(item => item.customerIdHash)).size, 40);
assert.match(retentionAssignmentCsv(experiment), /current_crm_policy|marginlift_policy/);

const admissionBase = {
  analysis: {
    id: "ret_live",
    source: "customer_upload",
    isDemoScenario: false,
    datasetHash: `sha256:${"a".repeat(64)}`,
    readiness: { status: "ready" },
    contactSafety: { contractReady: true },
    decisionQueue: Array.from({ length: 40 }, (_, index) => ({ customerIdHash: `live_${index}` }))
  },
  metricContract: { status: "locked", minimumSamplePerPolicy: 20 },
  shadowRuns: [{ status: "ready", stability: { passed: true } }, { status: "ready" }],
  configurationCurrent: true
};
assert.strictEqual(buildRetentionExperimentAdmission(admissionBase).ready, true);
const diagnosticAdmission = buildRetentionExperimentAdmission({
  ...admissionBase,
  analysis: { ...admissionBase.analysis, readiness: { status: "diagnostic_only" } }
});
assert.strictEqual(diagnosticAdmission.ready, false);
assert.ok(diagnosticAdmission.checks.some(item => item.key === "data_readiness" && !item.passed));

const rawRows = experiment.assignments.map((assignment, index) => ({
  customer_id_hash: assignment.customerIdHash,
  assigned_policy: assignment.assignedPolicy,
  actual_action: assignment.assignedPolicy === "marginlift_policy" ? "message_no_discount" : "no_action",
  assigned_at: assignment.assignedAt,
  delivered_at: "2025-01-02T00:00:00.000Z",
  exposed_at: "2025-01-02T00:00:00.000Z",
  outcome_at: "2025-01-31T00:00:00.000Z",
  repurchased: index % 2 === 0 ? "true" : "false",
  net_revenue: assignment.assignedPolicy === "marginlift_policy" ? "150000" : "100000",
  contribution_margin: assignment.assignedPolicy === "marginlift_policy" ? "60000" : "40000",
  incentive_cost: "0",
  channel_cost: assignment.assignedPolicy === "marginlift_policy" ? "1000" : "0",
  refund_amount: "0",
  opt_out: "false",
  complaint: "false",
  contaminated: "false"
}));
const rows = normalizeRetentionOutcomeRows(rawRows);
const integrity = auditRetentionOutcome(experiment, rows, { analyzedAt: "2025-03-01T00:00:00.000Z" });
assert.strictEqual(integrity.status, "pass");
assert.strictEqual(integrity.decisionEligible, true);

let outcome = analyzeRetentionOutcome(experiment, rows, integrity);
assert.strictEqual(outcome.evidenceLevel, "pilot_estimate");
assert.ok(outcome.summary.incrementalContributionProfitPerAssignedCustomer > 0);
assert.strictEqual(outcome.summary.financeVerificationStatus, "pending");

assert.throws(() => verifyRetentionFinance(outcome, {
  reviewerFa: "مدیر مالی",
  reasonFa: "نمونه با دفتر مالی و هزینه واقعی تطبیق داده شد.",
  reconciliation: { ...outcome.financeReconciliation.expected, totalNetRevenue: outcome.financeReconciliation.expected.totalNetRevenue + 1 },
  toleranceToman: 0
}), /تطبیق مالی ناموفق/);

outcome = verifyRetentionFinance(outcome, {
  reviewerFa: "مدیر مالی",
  reasonFa: "نمونه با دفتر مالی و هزینه واقعی تطبیق داده شد.",
  reconciliation: outcome.financeReconciliation.expected,
  toleranceToman: 0
});
assert.strictEqual(outcome.evidenceLevel, "verified_incremental");
assert.strictEqual(outcome.summary.financeVerificationStatus, "verified");
assert.strictEqual(outcome.summary.decision, "scale");
assert.strictEqual(outcome.financeReconciliation.status, "verified");

const mismatched = rows.map((row, index) => index === 0 ? { ...row, assignedPolicy: row.assignedPolicy === "marginlift_policy" ? "current_crm_policy" : "marginlift_policy" } : row);
assert.strictEqual(auditRetentionOutcome(experiment, mismatched, { analyzedAt: "2025-03-01T00:00:00.000Z" }).status, "rejected");

const lateOutcome = rows.map((row, index) => index === 0 ? { ...row, outcomeAt: "2025-02-01T00:00:00.001Z" } : row);
assert.strictEqual(auditRetentionOutcome(experiment, lateOutcome, { analyzedAt: "2025-03-01T00:00:00.000Z" }).status, "rejected");

const contaminatedOutcome = rows.map((row, index) => index === 0 ? { ...row, contaminated: true } : row);
const contaminationAudit = auditRetentionOutcome(experiment, contaminatedOutcome, { analyzedAt: "2025-03-01T00:00:00.000Z" });
assert.strictEqual(contaminationAudit.status, "needs_review");
assert.strictEqual(contaminationAudit.decisionEligible, false);

console.log("retention-experiment.test.js passed");
