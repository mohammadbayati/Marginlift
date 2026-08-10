const assert = require("assert");

const { auditChurnEventRows } = require("../src/churn-readiness");

const readyRows = [];
for (let index = 0; index < 240; index += 1) {
  readyRows.push({
    customer_id: `customer_${index}`,
    event_type: "purchase_completed",
    occurred_at: "2026-01-01T10:00:00Z",
    event_value_toman: "500000",
    gross_margin_rate: "0.30",
    discount_amount_toman: "20000",
    order_id: `order_old_${index}`
  });
  readyRows.push({
    customer_id: `customer_${index}`,
    event_type: index % 3 === 0 ? "app_open" : "purchase_completed",
    occurred_at: "2026-05-15T10:00:00Z",
    event_value_toman: "620000",
    gross_margin_rate: "0.32",
    discount_amount_toman: "0",
    order_id: `order_new_${index}`
  });
}

const ready = auditChurnEventRows(readyRows);
assert.strictEqual(ready.status, "ready");
assert.strictEqual(ready.readiness.riskModel, true);
assert.strictEqual(ready.readiness.profitDecisioning, true);
assert.strictEqual(ready.readiness.upliftModel, false);
assert.ok(ready.score >= 90);

const diagnostic = auditChurnEventRows(readyRows.slice(0, 40));
assert.strictEqual(diagnostic.status, "diagnostic_only");
assert.strictEqual(diagnostic.readiness.riskModel, false);

const pii = auditChurnEventRows(readyRows.map(row => ({ ...row, email: "person@example.com" })));
assert.strictEqual(pii.status, "needs_data_fix");
assert.ok(pii.checks.find(item => item.key === "privacy" && !item.passed));

const invalidDate = auditChurnEventRows([{ customer_id: "one", event_type: "purchase_completed", occurred_at: "not-a-date" }]);
assert.strictEqual(invalidDate.status, "needs_data_fix");

const suppliedLabel = auditChurnEventRows(readyRows.map(row => ({ ...row, churned: "false" })));
assert.ok(suppliedLabel.warnings.some(item => item.includes("feature محسوب نمی‌شود")));
assert.ok(suppliedLabel.cleaningPlan.issues.some(item => item.action === "derive_label"));

const invalidMoney = auditChurnEventRows(readyRows.map((row, index) => ({
  ...row,
  gross_margin_rate: index === 0 ? "1.4" : row.gross_margin_rate
})));
assert.strictEqual(invalidMoney.readiness.riskModel, true);
assert.strictEqual(invalidMoney.readiness.profitDecisioning, false);
assert.ok(invalidMoney.cleaningPlan.issues.some(item => item.action === "quarantine_financial"));

console.log("churn-readiness.test.js passed");
