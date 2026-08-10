const assert = require("assert");

const { buildChannelRetentionDataset, classifyState } = require("../src/channel-retention-dataset");

const rows = [
  transaction("h1", "t2", "2025-02-02T00:00:00Z", "completed"),
  transaction("h1", "t1", "2025-01-01T00:00:00Z", "completed"),
  transaction("h1", "t2", "2025-02-02T00:00:00Z", "completed"),
  transaction("h1", "t3", "2025-03-01T00:00:00Z", "failed"),
  transaction("h1", "t4", "2026-03-01T00:00:00Z", "completed"),
  transaction("h2", "t5", "2025-01-10T00:00:00Z", "completed"),
  transaction("h2", "t6", "2025-04-15T00:00:00Z", "completed")
];

const dataset = buildChannelRetentionDataset(rows, {
  cutoff: "2026-02-01T00:00:00Z",
  contract: { minimumCustomers: 1, minimumRepeatCustomers: 1, minimumHistoryDays: 1 }
});

assert.strictEqual(dataset.reconciliation.rawRows, 7);
assert.strictEqual(dataset.reconciliation.cleanRows, 4);
assert.strictEqual(dataset.reconciliation.duplicateRows, 1);
assert.strictEqual(dataset.reconciliation.unsuccessfulRows, 1);
assert.strictEqual(dataset.reconciliation.afterCutoffRows, 1);
assert.strictEqual(dataset.reconciliation.reconciled, true);
assert.strictEqual(dataset.summary.units, 2);
assert.strictEqual(dataset.summary.episodes, 4);
assert.strictEqual(dataset.summary.observedEvents, 2);
assert.strictEqual(dataset.summary.censoredEpisodes, 2);
assert.strictEqual(dataset.summary.eligibleSnapshots, 2);
assert.ok(dataset.episodes.every(item => item.durationDays >= 0));
assert.ok(dataset.episodes.every(item => item.features.purchaseCountToDate >= 1));
assert.strictEqual(dataset.episodes.find(item => item.originTransactionId === "t1").features.previousGapDays, null);
assert.strictEqual(dataset.episodes.find(item => item.originTransactionId === "t2").features.previousGapDays, 32);
assert.ok(dataset.snapshots.every(item => item.indexDate === "2026-02-01T00:00:00.000Z"));
assert.ok(dataset.snapshots.every(item => item.purchaseCount === 2));
assert.ok(dataset.caveatsFa.some(item => item.includes("رقیب")));
assert.strictEqual(dataset.snapshots.find(item => item.customerIdHash === "h2").previouslyReactivated, true);

const rerun = buildChannelRetentionDataset(rows, {
  cutoff: "2026-02-01T00:00:00Z",
  contract: { minimumCustomers: 1, minimumRepeatCustomers: 1, minimumHistoryDays: 1 }
});
assert.strictEqual(dataset.datasetVersion, rerun.datasetVersion);

assert.strictEqual(classifyState(-8), "active");
assert.strictEqual(classifyState(-7), "due");
assert.strictEqual(classifyState(29), "due");
assert.strictEqual(classifyState(30), "lapsed");
assert.strictEqual(classifyState(90), "dormant");
assert.strictEqual(classifyState(180), "long_term_lost");

assert.throws(() => buildChannelRetentionDataset(rows), /cutoff/);

function transaction(customerIdHash, transactionId, purchasedAt, status) {
  return {
    customer_id_hash: customerIdHash,
    transaction_id: transactionId,
    purchased_at: purchasedAt,
    transaction_status: status,
    operator: "operator_a",
    package_id: "monthly_10gb",
    package_category: "monthly",
    validity_days: "30",
    paid_amount: "500000",
    net_revenue: "25000",
    discount_amount: "0",
    cashback_amount: "0"
  };
}

console.log("channel-retention-dataset.test.js passed");
