const assert = require("assert");
const { buildTrainingExamples, appendExamples, toJsonl } = require("../src/training-store");

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

console.log("training-store");

test("maps treated/converted to w/y and fills feature defaults", () => {
  const ex = buildTrainingExamples("org1", "c1", [
    { customer_id_hash: "h1", treated: true, converted: false, features: { recency_days: 10, frequency: 3 } },
    { customer_id_hash: "h2", treated: false, converted: true, features: { monetary_value: 500000 } },
  ]);
  assert.strictEqual(ex.length, 2);
  assert.strictEqual(ex[0].w, 1);
  assert.strictEqual(ex[0].y, 0);
  assert.strictEqual(ex[0].features.recency_days, 10);
  assert.strictEqual(ex[0].features.channel_engagement_score, 0.5); // default
  assert.strictEqual(ex[1].w, 0);
  assert.strictEqual(ex[1].y, 1);
  assert.strictEqual(ex[1].features.monetary_value, 500000);
});

test("empty results is rejected", () => {
  try { buildTrainingExamples("org1", null, []); assert.fail("should throw"); }
  catch (e) { assert.strictEqual(e.status, 400); assert.strictEqual(e.code, "INVALID_RESULTS"); }
});

test("toJsonl emits one {features,w,y} object per line", () => {
  const ex = buildTrainingExamples("o", null, [
    { customer_id_hash: "h", treated: 1, converted: 1, features: { frequency: 2 } },
  ]);
  const lines = toJsonl(ex).split("\n");
  assert.strictEqual(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.strictEqual(row.w, 1);
  assert.strictEqual(row.y, 1);
  assert.ok(row.features && typeof row.features.frequency === "number");
  assert.strictEqual(row.cidHash, undefined); // customer id not exported to the trainer
});

test("appendExamples accumulates onto the db", () => {
  const db = {};
  assert.strictEqual(appendExamples(db, buildTrainingExamples("o", null, [{ customer_id_hash: "h", treated: 1, converted: 0 }])), 1);
  assert.strictEqual(appendExamples(db, buildTrainingExamples("o", null, [{ customer_id_hash: "h", treated: 0, converted: 1 }])), 2);
});

console.log("  training-store tests passed.");
