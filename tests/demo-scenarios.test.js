const assert = require("assert");
const { parseCSV } = require("../src/csv");
const { DEMO_SCENARIOS, getDemoScenario } = require("../src/demo-scenarios");

for (const presetKey of Object.keys(DEMO_SCENARIOS)) {
  const first = getDemoScenario(presetKey);
  const second = getDemoScenario(presetKey);
  const rows = parseCSV(first.csvText);

  assert.strictEqual(first.presetKey, presetKey);
  assert.strictEqual(first.csvText, second.csvText, `${presetKey} must remain deterministic`);
  assert.ok(rows.length >= 100, `${presetKey} must contain a useful demo cohort`);
  assert.strictEqual(new Set(rows.map(row => row.customer_id_hash)).size, 36);
  assert.ok(rows.every(row => String(row.customer_id_hash).startsWith("hash_demo_")));
  assert.ok(rows.some(row => row.do_not_contact === "true"));
  assert.ok(rows.some(row => Number(row.contribution_margin) > 0));
}

console.log("demo-scenarios.test.js passed");
