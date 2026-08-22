const assert = require("assert");

function loadConfig(overrides = {}) {
  const keys = ["NODE_ENV", "APP_ORIGIN", "SESSION_SECRET", "DATABASE_URL", "ARTIFACT_ENCRYPTION_KEY", "MARGINLIFT_PUBLIC_SIGNUP", "SCORER_INTERNAL_TOKEN", "SCORER_INTERNAL_TOKEN_ID"];
  keys.forEach(key => delete process.env[key]);
  Object.assign(process.env, overrides);
  delete require.cache[require.resolve("../src/config")];
  return require("../src/config");
}

const base = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://marginlift.ir",
  SESSION_SECRET: "1".repeat(32),
  DATABASE_URL: "postgresql://marginlift:test@postgres:5432/marginlift",
  ARTIFACT_ENCRYPTION_KEY: "22".repeat(32),
  SCORER_INTERNAL_TOKEN: "3".repeat(32)
};

assert.doesNotThrow(() => loadConfig(base).assertProductionConfig());
assert.strictEqual(loadConfig(base).publicSignupEnabled, false);
assert.strictEqual(loadConfig({ ...base, MARGINLIFT_PUBLIC_SIGNUP: "true" }).publicSignupEnabled, true);
assert.throws(
  () => loadConfig({ ...base, DATABASE_URL: "" }).assertProductionConfig(),
  /DATABASE_URL/
);
assert.throws(
  () => loadConfig({ ...base, ARTIFACT_ENCRYPTION_KEY: "short" }).assertProductionConfig(),
  /ARTIFACT_ENCRYPTION_KEY/
);

console.log("config.test.js passed");
