const assert = require("assert");
const { evaluateCircuitBreaker } = require("../src/orchestrator");

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

console.log("orchestrator");

test("healthy drift does not halt", () => {
  const b = evaluateCircuitBreaker({ latchOpen: false, causalDrift: 0.1, driftThreshold: 0.2 });
  assert.strictEqual(b.halted, false);
  assert.strictEqual(b.tripped, false);
});

test("drift exactly at threshold does not halt", () => {
  const b = evaluateCircuitBreaker({ latchOpen: false, causalDrift: 0.2, driftThreshold: 0.2 });
  assert.strictEqual(b.halted, false);
});

test("drift above threshold halts and trips a latch", () => {
  const b = evaluateCircuitBreaker({ latchOpen: false, causalDrift: 0.35, driftThreshold: 0.2 });
  assert.strictEqual(b.halted, true);
  assert.strictEqual(b.tripped, true);
  assert.strictEqual(b.reason, "causal_drift_exceeded");
});

test("open latch keeps halting even when drift is healthy", () => {
  const b = evaluateCircuitBreaker({ latchOpen: true, causalDrift: 0, driftThreshold: 0.2 });
  assert.strictEqual(b.halted, true);
  assert.strictEqual(b.tripped, false);
  assert.strictEqual(b.reason, "latched");
});

test("defaults are safe when inputs omitted", () => {
  const b = evaluateCircuitBreaker({});
  assert.strictEqual(b.halted, false);
});

console.log("  orchestrator tests passed.");
