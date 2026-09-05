const assert = require("assert");
const { computeCausalDrift, assessOutcomeDrift, latestOutcomeForOrg } = require("../src/drift-monitor");

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

console.log("drift-monitor");

test("perfect calibration is zero drift", () => {
  assert.strictEqual(computeCausalDrift(1000, 1000), 0);
});

test("half-magnitude miss is 0.5 drift", () => {
  assert.strictEqual(computeCausalDrift(1000, 500), 0.5);
});

test("both near zero is zero drift (no divide blow-up)", () => {
  assert.strictEqual(computeCausalDrift(0, 0), 0);
});

test("sign flip yields large drift", () => {
  assert.ok(computeCausalDrift(1000, -1000) >= 1);
});

test("no outcome record yields no signal", () => {
  const r = assessOutcomeDrift(null);
  assert.strictEqual(r.drift, 0);
  assert.strictEqual(r.hasSignal, false);
});

test("outcome summary drives drift with signal", () => {
  const r = assessOutcomeDrift({ summary: { predictedIncrementalProfit: 2000000, observedIncrementalProfit: 1000000 } });
  assert.strictEqual(r.hasSignal, true);
  assert.strictEqual(r.drift, 0.5);
});

test("latestOutcomeForOrg picks most recent for the org", () => {
  const db = { outcomes: [
    { organizationId: "a", createdAt: "2026-01-01T00:00:00Z", summary: { s: 1 } },
    { organizationId: "a", createdAt: "2026-03-01T00:00:00Z", summary: { s: 3 } },
    { organizationId: "b", createdAt: "2026-05-01T00:00:00Z", summary: { s: 9 } },
  ] };
  assert.strictEqual(latestOutcomeForOrg(db, "a").summary.s, 3);
  assert.strictEqual(latestOutcomeForOrg(db, "z"), null);
});

console.log("  drift-monitor tests passed.");
