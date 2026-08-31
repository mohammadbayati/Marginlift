const assert = require("assert");

const {
  analyzeRetentionOutcome,
  auditRetentionOutcome,
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
    primaryMetric: "incremental_contribution_profit_per_assigned_customer",
    primaryMetricFa: "سود مشارکتی افزایشی"
  },
  shadowRuns: [{ id: "shadow_1" }, { id: "shadow_2" }]
});

assert.strictEqual(experiment.status, "registered");
assert.strictEqual(experiment.assignments.length, 40);
assert.strictEqual(new Set(experiment.assignments.map(item => item.customerIdHash)).size, 40);
assert.match(retentionAssignmentCsv(experiment), /current_crm_policy|marginlift_policy/);

const rawRows = experiment.assignments.map((assignment, index) => ({
  customer_id_hash: assignment.customerIdHash,
  assigned_policy: assignment.assignedPolicy,
  actual_action: assignment.assignedPolicy === "marginlift_policy" ? "message_no_discount" : "no_action",
  assigned_at: assignment.assignedAt,
  delivered_at: "2025-01-02T00:00:00.000Z",
  exposed_at: "2025-01-02T00:00:00.000Z",
  outcome_at: "2025-02-02T00:00:00.000Z",
  repurchased: index % 2 === 0 ? "true" : "false",
  net_revenue: assignment.assignedPolicy === "marginlift_policy" ? "150000" : "100000",
  contribution_margin: assignment.assignedPolicy === "marginlift_policy" ? "60000" : "40000",
  incentive_cost: "0",
  channel_cost: assignment.assignedPolicy === "marginlift_policy" ? "1000" : "0",
  refund_amount: "0",
  opt_out: "false",
  complaint: "false"
}));
const rows = normalizeRetentionOutcomeRows(rawRows);
const integrity = auditRetentionOutcome(experiment, rows, { analyzedAt: "2025-03-01T00:00:00.000Z" });
assert.strictEqual(integrity.status, "pass");
assert.strictEqual(integrity.decisionEligible, true);

let outcome = analyzeRetentionOutcome(experiment, rows, integrity);
assert.strictEqual(outcome.evidenceLevel, "pilot_estimate");
assert.ok(outcome.summary.incrementalContributionProfitPerAssignedCustomer > 0);
assert.strictEqual(outcome.summary.financeVerificationStatus, "pending");

outcome = verifyRetentionFinance(outcome, { reviewerFa: "مدیر مالی", reasonFa: "نمونه با دفتر مالی و هزینه واقعی تطبیق داده شد." });
assert.strictEqual(outcome.evidenceLevel, "verified_incremental");
assert.strictEqual(outcome.summary.financeVerificationStatus, "verified");

const mismatched = rows.map((row, index) => index === 0 ? { ...row, assignedPolicy: row.assignedPolicy === "marginlift_policy" ? "current_crm_policy" : "marginlift_policy" } : row);
assert.strictEqual(auditRetentionOutcome(experiment, mismatched, { analyzedAt: "2025-03-01T00:00:00.000Z" }).status, "rejected");

console.log("retention-experiment.test.js passed");
