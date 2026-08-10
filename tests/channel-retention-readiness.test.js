const assert = require("assert");

const { auditChannelRetentionData } = require("../src/channel-retention-readiness");

function buildReadyTransactions() {
  const rows = [];
  for (let index = 0; index < 1100; index += 1) {
    rows.push(transaction(index, 1, "2025-01-01T10:00:00Z"));
    rows.push(transaction(index, 2, "2025-07-01T10:00:00Z"));
    rows.push(transaction(index, 3, "2026-01-05T10:00:00Z"));
  }
  return rows;
}

function transaction(customerIndex, purchaseIndex, purchasedAt) {
  return {
    customer_id_hash: `hash_${customerIndex}`,
    transaction_id: `txn_${customerIndex}_${purchaseIndex}`,
    purchased_at: purchasedAt,
    transaction_status: "completed",
    operator: customerIndex % 2 ? "operator_a" : "operator_b",
    package_id: purchaseIndex % 2 ? "monthly_10gb" : "monthly_20gb",
    validity_days: "30",
    paid_amount: "500000",
    net_revenue: "25000",
    discount_amount: "0",
    cashback_amount: "0"
  };
}

function buildInterventions() {
  return Array.from({ length: 100 }, (_, index) => ({
    campaign_id: "campaign_001",
    customer_id_hash: `hash_${index}`,
    assigned_group: index % 2 ? "treatment" : "control",
    assigned_at: "2026-01-10T08:00:00Z",
    exposed_at: "2026-01-10T09:00:00Z",
    action_type: "push",
    incentive_amount: "0"
  }));
}

const ready = auditChannelRetentionData(buildReadyTransactions(), buildInterventions());
assert.strictEqual(ready.status, "ready");
assert.strictEqual(ready.readiness.survivalModel, true);
assert.strictEqual(ready.readiness.profitDecisioning, true);
assert.strictEqual(ready.readiness.pilotDesign, true);
assert.strictEqual(ready.readiness.causalClaim, false);
assert.strictEqual(ready.contract.competitorPurchaseObservable, false);

const diagnostic = auditChannelRetentionData(buildReadyTransactions().slice(0, 20));
assert.strictEqual(diagnostic.status, "diagnostic_only");
assert.strictEqual(diagnostic.readiness.survivalModel, false);

const missingSchema = auditChannelRetentionData([{ customer_id_hash: "hash_1" }]);
assert.strictEqual(missingSchema.status, "needs_data_fix");

const emptyRequiredMoney = buildReadyTransactions();
emptyRequiredMoney[0] = { ...emptyRequiredMoney[0], paid_amount: "" };
assert.strictEqual(auditChannelRetentionData(emptyRequiredMoney).status, "needs_data_fix");

const negativeContribution = buildReadyTransactions();
negativeContribution[0] = { ...negativeContribution[0], net_revenue: "-2500" };
assert.strictEqual(auditChannelRetentionData(negativeContribution).status, "ready");

const piiHeader = auditChannelRetentionData(buildReadyTransactions().map(row => ({ ...row, mobile: "09120000000" })));
assert.strictEqual(piiHeader.status, "needs_data_fix");
assert.ok(piiHeader.checks.some(item => item.key === "privacy_headers" && !item.passed));

const exposedPhone = auditChannelRetentionData(buildReadyTransactions().map((row, index) => ({
  ...row,
  customer_id_hash: index === 0 ? "09121234567" : row.customer_id_hash
})));
assert.strictEqual(exposedPhone.status, "needs_data_fix");
assert.ok(exposedPhone.cleaningPlan.issues.some(item => item.action === "reject_direct_identifier"));

const assignmentAfterExposure = buildInterventions();
assignmentAfterExposure[0] = {
  ...assignmentAfterExposure[0],
  assigned_at: "2026-01-10T10:00:00Z",
  exposed_at: "2026-01-10T09:00:00Z"
};
const invalidExperiment = auditChannelRetentionData(buildReadyTransactions(), assignmentAfterExposure);
assert.strictEqual(invalidExperiment.readiness.pilotDesign, false);
assert.strictEqual(invalidExperiment.interventionAudit.assignmentAfterExposure, 1);

const invalidExposure = buildInterventions();
invalidExposure[0] = { ...invalidExposure[0], exposed_at: "" };
assert.strictEqual(auditChannelRetentionData(buildReadyTransactions(), invalidExposure).readiness.pilotDesign, false);

const duplicateRows = buildReadyTransactions();
duplicateRows.push({ ...duplicateRows[0] });
const duplicateAudit = auditChannelRetentionData(duplicateRows);
assert.ok(duplicateAudit.summary.duplicateTransactionIds >= 1);
assert.ok(duplicateAudit.cleaningPlan.issues.some(item => item.action === "deduplicate_transaction_id"));

console.log("channel-retention-readiness.test.js passed");
