const assert = require("assert");
const { assertNoRawPii, looksLikeRawPii } = require("../src/pii-guard");

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

console.log("pii-guard");

test("sha256 hex hash is allowed", () => {
  assert.strictEqual(looksLikeRawPii("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"), false);
});

test("base64 hash is allowed", () => {
  assert.strictEqual(looksLikeRawPii("n4bQgYhMfWWaL+qgxVrQFaO"), false);
});

test("raw email is flagged", () => {
  assert.strictEqual(looksLikeRawPii("user@example.com"), true);
});

test("raw phone number is flagged", () => {
  assert.strictEqual(looksLikeRawPii("+989121234567"), true);
  assert.strictEqual(looksLikeRawPii("09121234567"), true);
});

test("assertNoRawPii passes a clean audience", () => {
  assert.doesNotThrow(() => assertNoRawPii([{ customer_id_hash: "9f86d081884c7d659a2feaa0c55ad015" }]));
});

test("assertNoRawPii throws 400 PII_DETECTED on raw email", () => {
  try {
    assertNoRawPii([{ customer_id_hash: "ok_hash_1234abcd" }, { customer_id_hash: "leak@corp.com" }]);
    assert.fail("should have thrown");
  } catch (e) {
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.code, "PII_DETECTED");
  }
});

test("empty or non-array audience is a no-op", () => {
  assert.doesNotThrow(() => assertNoRawPii(null));
  assert.doesNotThrow(() => assertNoRawPii([]));
});

console.log("  pii-guard tests passed.");
