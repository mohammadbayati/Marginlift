const assert = require("assert");

const {
  analyzeRetentionRows,
  getRetentionPreset,
  listRetentionPresets,
  mapRetentionRows,
  normalizeRetentionConfig,
  previewRetentionRows
} = require("../src/retention-product");

const apConfig = normalizeRetentionConfig({
  ...getRetentionPreset("super_app_packages"),
  readiness: { minimumHistoryDays: 30, minimumCustomers: 10, minimumRepeatCustomers: 5 }
});

assert.ok(listRetentionPresets().some(item => item.key === "generic_ecommerce"));
assert.ok(listRetentionPresets().some(item => item.key === "super_app_packages"));
assert.ok(listRetentionPresets().some(item => item.key === "subscription_services"));
assert.strictEqual(apConfig.evidencePolicy.riskAloneAllowsIncentive, false);

const rows = [];
for (let customer = 1; customer <= 10; customer += 1) {
  rows.push(apTransaction(customer, 1, "2025-01-01T00:00:00Z"));
  if (customer <= 6) rows.push(apTransaction(customer, 2, "2025-02-05T00:00:00Z"));
}

const analysis = analyzeRetentionRows(rows, apConfig, { cutoff: "2025-04-15T00:00:00Z" });
assert.strictEqual(analysis.readiness.status, "ready");
assert.strictEqual(analysis.workspace.evidenceLevel, "observational_estimate");
assert.strictEqual(analysis.workspace.metrics.units, 10);
assert.ok(analysis.workspace.queue.length >= 1);
assert.ok(analysis.workspace.queue.every(item => item.incentiveAllowed === false));
assert.ok(analysis.workspace.queue.every(item => ["medium", "high", "very_high"].includes(item.riskBand)));
assert.ok(analysis.workspace.queue.every(item => ["no_discount", "experiment_only", "no_action"].includes(item.incentivePolicy)));
assert.ok(analysis.workspace.queue.every(item => item.riskLabelFa && item.incentivePolicyFa));
assert.ok(analysis.workspace.queue.every(item => item.evidenceLabelFa.includes("اپلیکیشن")));
assert.ok(analysis.workspace.policyVersion);
assert.strictEqual(analysis.decisionQueue.length, analysis.workspace.metrics.queueSize);
assert.ok(analysis.decisionQueue.every(item => item.policyVersion === analysis.workspace.policyVersion));
assert.ok(analysis.decisionQueue.every(item => item.riskProbability === null));
assert.ok(analysis.decisionQueue.every(item => item.saveabilityByAction === null));
assert.ok(analysis.decisionQueue.every(item => item.expectedIncrementalProfit === null));
assert.ok(analysis.decisionQueue.every(item => item.decisionId && item.evidenceLevel === "observational_estimate"));

const ecommerce = getRetentionPreset("generic_ecommerce");
const mapped = mapRetentionRows([{
  customer_id_hash: "hash_1",
  order_id: "order_1",
  purchased_at: "2025-01-01T00:00:00Z",
  order_status: "completed",
  paid_amount: "100000",
  product_id: "sku_1",
  product_category: "beauty"
}], ecommerce)[0];
assert.strictEqual(mapped.transaction_id, "order_1");
assert.strictEqual(mapped.operator, "primary_store");
assert.strictEqual(mapped.discount_amount, 0);

const aliasedRows = [{
  user_id_hash: "hash_1",
  payment_id: "payment_1",
  created_at: "2025-01-01T00:00:00Z",
  amount: "100000",
  status: "completed"
}];
const aliasedPreview = previewRetentionRows(aliasedRows, ecommerce);
assert.strictEqual(aliasedPreview.readyForImport, true);
assert.strictEqual(aliasedPreview.mapping.customerId, "user_id_hash");
assert.strictEqual(aliasedPreview.mapping.transactionId, "payment_id");
assert.strictEqual(aliasedPreview.mapping.occurredAt, "created_at");
assert.strictEqual(aliasedPreview.mapping.paidAmount, "amount");

const incompletePreview = previewRetentionRows([{ customer_key: "hash_1" }], ecommerce);
assert.strictEqual(incompletePreview.readyForImport, false);
assert.ok(incompletePreview.missingRequired.includes("customerId"));

const piiPreview = previewRetentionRows([{
  customer_id_hash: "hash_1",
  order_id: "order_1",
  purchased_at: "2025-01-01T00:00:00Z",
  paid_amount: "100000",
  email: "person@example.com"
}], ecommerce);
assert.strictEqual(piiPreview.readyForImport, false);
assert.deepStrictEqual(piiPreview.privacy.piiHeaders, ["email"]);

const persianMapping = normalizeRetentionConfig({
  presetKey: "generic_ecommerce",
  mapping: { customerId: "شناسه_مشتری" }
});
assert.strictEqual(persianMapping.mapping.customerId, "شناسه_مشتری");

assert.throws(() => normalizeRetentionConfig({
  presetKey: "generic_ecommerce",
  lifecycle: { lapsedAfterDays: 100, dormantAfterDays: 90, lostAfterDays: 180 }
}), /صعودی/);

function apTransaction(customer, purchase, purchasedAt) {
  return {
    customer_id_hash: `hash_${customer}`,
    transaction_id: `txn_${customer}_${purchase}`,
    purchased_at: purchasedAt,
    transaction_status: "completed",
    operator: "operator_a",
    package_id: "monthly_10gb",
    package_category: "monthly",
    validity_days: "30",
    paid_amount: "500000",
    contribution_margin: "25000",
    discount_amount: "0",
    cashback_amount: "0"
  };
}

console.log("retention-product.test.js passed");
