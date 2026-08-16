const assert = require("assert");
const { generateMonthlyReport } = require("../src/billing-report");

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

console.log("billing-report");

test("empty logs produce a zeroed statement", () => {
  const r = generateMonthlyReport([], [], { year: 2026, month: 8 });
  assert.strictEqual(r.orchestration.savedBudget, 0);
  assert.strictEqual(r.billing.revenueShareAmount, 0);
  assert.strictEqual(r.billing.revenueShareRate, 0.2);
});

test("revenue share is 20% of realized saved budget", () => {
  const orchestration = [
    { timestamp: "2026-08-05T10:00:00Z", savedBudget: 1000000, netIncrementalProfit: 300000, dropCount: 4, sendCount: 2, halted: false },
    { timestamp: "2026-08-20T10:00:00Z", savedBudget: 500000, netIncrementalProfit: 100000, dropCount: 3, sendCount: 1, halted: false },
  ];
  const r = generateMonthlyReport([], orchestration, { year: 2026, month: 8 });
  assert.strictEqual(r.orchestration.savedBudget, 1500000);
  assert.strictEqual(r.orchestration.blockedSends, 7);
  assert.strictEqual(r.orchestration.allowedSends, 3);
  assert.strictEqual(r.billing.revenueShareAmount, 300000); // 20% of 1.5M
});

test("only the target month is counted", () => {
  const orchestration = [
    { timestamp: "2026-08-05T10:00:00Z", savedBudget: 1000000, dropCount: 1, sendCount: 0 },
    { timestamp: "2026-07-30T10:00:00Z", savedBudget: 9999999, dropCount: 1, sendCount: 0 },
  ];
  const r = generateMonthlyReport([], orchestration, { year: 2026, month: 8 });
  assert.strictEqual(r.orchestration.savedBudget, 1000000);
  assert.strictEqual(r.period, "2026-08");
});

test("halted runs are counted and shadow advisory is separate", () => {
  const shadow = [{ timestamp: "2026-08-01T00:00:00Z", scoredCount: 2, decisions: [
    { segment: "sure_thing", expected_incremental_profit: 5000 },
  ] }];
  const orchestration = [{ timestamp: "2026-08-02T00:00:00Z", savedBudget: 0, dropCount: 2, sendCount: 0, halted: true }];
  const r = generateMonthlyReport(shadow, orchestration, { year: 2026, month: 8 });
  assert.strictEqual(r.orchestration.haltedRuns, 1);
  assert.strictEqual(r.shadowAdvisory.evaluations, 1);
  assert.strictEqual(r.shadowAdvisory.potentialWasteBudget, 5000);
});

test("custom revenue share rate is honored", () => {
  const orchestration = [{ timestamp: "2026-08-05T10:00:00Z", savedBudget: 1000000, dropCount: 1, sendCount: 0 }];
  const r = generateMonthlyReport([], orchestration, { year: 2026, month: 8, revenueShareRate: 0.15 });
  assert.strictEqual(r.billing.revenueShareAmount, 150000);
});

console.log("  billing-report tests passed.");
