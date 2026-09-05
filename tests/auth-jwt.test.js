const assert = require("assert");
const { signJwt, verifyJwt } = require("../src/auth");

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

console.log("auth-jwt");

test("signJwt produces a valid three-part token", () => {
  const token = signJwt({ org: "test_org", sub: "user1" });
  assert.strictEqual(token.split(".").length, 3);
});

test("verifyJwt returns payload for valid token", () => {
  const token = signJwt({ org: "test_org", role: "analyst" }, 3600);
  const payload = verifyJwt(token);
  assert.ok(payload);
  assert.strictEqual(payload.org, "test_org");
  assert.strictEqual(payload.role, "analyst");
  assert.ok(payload.iat > 0);
  assert.ok(payload.exp > payload.iat);
});

test("verifyJwt rejects tampered token", () => {
  const token = signJwt({ org: "test_org" });
  const tampered = token.slice(0, -2) + "xx";
  assert.strictEqual(verifyJwt(tampered), null);
});

test("verifyJwt rejects empty or malformed input", () => {
  assert.strictEqual(verifyJwt(""), null);
  assert.strictEqual(verifyJwt(null), null);
  assert.strictEqual(verifyJwt("abc"), null);
  assert.strictEqual(verifyJwt("a.b"), null);
});

test("verifyJwt rejects expired token", () => {
  const token = signJwt({ org: "test_org" }, -10);
  assert.strictEqual(verifyJwt(token), null);
});

console.log("  auth-jwt tests passed.");
