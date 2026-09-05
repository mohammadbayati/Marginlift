const assert = require("assert");
const { generateBudgetWasteReport } = require("../src/shadow-evaluator");

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

console.log("shadow-evaluator");

test("empty logs return zero report", () => {
  const report = generateBudgetWasteReport([]);
  assert.strictEqual(report.totalEvaluations, 0);
  assert.strictEqual(report.totalWasteBudget, 0);
  assert.strictEqual(report.wasteRate, 0);
  assert.deepStrictEqual(report.recommendations, []);
});

test("null logs return zero report", () => {
  const report = generateBudgetWasteReport(null);
  assert.strictEqual(report.totalEvaluations, 0);
});

test("counts sure_thing waste correctly", () => {
  const logs = [{
    scoredCount: 4,
    decisions: [
      { segment: "sure_thing", expected_incremental_profit: 5000 },
      { segment: "sure_thing", expected_incremental_profit: 3000 },
      { segment: "persuadable", expected_incremental_profit: 10000 },
      { segment: "lost_cause", expected_incremental_profit: 0 },
    ],
  }];
  const report = generateBudgetWasteReport(logs);
  assert.strictEqual(report.sureThingCount, 2);
  assert.strictEqual(report.sureThingWaste, 8000);
  assert.strictEqual(report.sleepingDogCount, 0);
  assert.strictEqual(report.totalWasteCustomers, 2);
  assert.strictEqual(report.wasteRate, 50);
});

test("counts sleeping_dog waste correctly", () => {
  const logs = [{
    scoredCount: 3,
    decisions: [
      { segment: "sleeping_dog", expected_incremental_profit: -2000 },
      { segment: "persuadable", expected_incremental_profit: 7000 },
      { segment: "sleeping_dog", expected_incremental_profit: -1500 },
    ],
  }];
  const report = generateBudgetWasteReport(logs);
  assert.strictEqual(report.sleepingDogCount, 2);
  assert.strictEqual(report.sleepingDogWaste, 3500);
  assert.strictEqual(report.sureThingCount, 0);
});

test("aggregates across multiple log entries", () => {
  const logs = [
    { scoredCount: 2, decisions: [{ segment: "sure_thing", expected_incremental_profit: 1000 }, { segment: "persuadable", expected_incremental_profit: 5000 }] },
    { scoredCount: 1, decisions: [{ segment: "sleeping_dog", expected_incremental_profit: -500 }] },
  ];
  const report = generateBudgetWasteReport(logs);
  assert.strictEqual(report.totalEvaluations, 2);
  assert.strictEqual(report.totalCustomersScored, 3);
  assert.strictEqual(report.totalWasteBudget, 1500);
  assert.strictEqual(report.recommendations.length, 2);
});

test("generates recommendations with counts and waste", () => {
  const logs = [{
    scoredCount: 2,
    decisions: [
      { segment: "sure_thing", expected_incremental_profit: 4000 },
      { segment: "sleeping_dog", expected_incremental_profit: -2000 },
    ],
  }];
  const report = generateBudgetWasteReport(logs);
  assert.strictEqual(report.recommendations.length, 2);
  const st = report.recommendations.find(r => r.type === "sure_thing");
  assert.strictEqual(st.count, 1);
  assert.strictEqual(st.waste, 4000);
  const sd = report.recommendations.find(r => r.type === "sleeping_dog");
  assert.strictEqual(sd.count, 1);
  assert.strictEqual(sd.waste, 2000);
});

console.log("  shadow-evaluator tests passed.");
