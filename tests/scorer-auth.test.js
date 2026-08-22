const assert = require("assert");
const http = require("http");

async function withEnv(env, fn) {
  const keys = Object.keys(env);
  const old = {};
  for (const key of keys) {
    old[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  for (const modulePath of ["../src/config", "../src/scorer-auth", "../src/shadow-evaluator"]) {
    delete require.cache[require.resolve(modulePath)];
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    for (const modulePath of ["../src/config", "../src/scorer-auth", "../src/shadow-evaluator"]) {
      delete require.cache[require.resolve(modulePath)];
    }
  }
}

function listen(server) {
  return new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
}

async function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function testValidTokenHeader() {
  const expected = "token-".padEnd(40, "1");
  const server = http.createServer((req, res) => {
    assert.strictEqual(req.headers["x-marginlift-internal-token"], expected);
    assert.strictEqual(req.headers["x-marginlift-internal-key-id"], "v1");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      evaluation_id: "eval_1",
      scored_count: 0,
      waste_count: 0,
      waste_budget: 0,
      decisions: [],
      latency_ms: 1
    }));
  });
  await listen(server);
  const port = server.address().port;
  try {
    await withEnv({
      SHADOW_SCORER_URL: `http://127.0.0.1:${port}`,
      SCORER_INTERNAL_TOKEN: expected,
      SCORER_INTERNAL_TOKEN_ID: "v1"
    }, async () => {
      const { callScorer } = require("../src/shadow-evaluator");
      await callScorer({ organization_id: "org_1", audience: [{ customer_id_hash: "abc" }] });
    });
  } finally {
    await close(server);
  }
}

async function testMissingTokenCompatibility() {
  await withEnv({
    NODE_ENV: undefined,
    SCORER_INTERNAL_TOKEN: undefined,
    SCORER_INTERNAL_TOKEN_ID: undefined
  }, async () => {
    const { buildScorerAuthHeaders } = require("../src/scorer-auth");
    assert.deepStrictEqual(buildScorerAuthHeaders(), {});
  });
}

async function testProductionRequiresToken() {
  await withEnv({
    NODE_ENV: "production",
    APP_ORIGIN: "https://marginlift.ir",
    SESSION_SECRET: "1".repeat(32),
    DATABASE_URL: "postgresql://marginlift:test@postgres:5432/marginlift",
    ARTIFACT_ENCRYPTION_KEY: "22".repeat(32),
    SCORER_INTERNAL_TOKEN: undefined
  }, async () => {
    const { assertProductionConfig } = require("../src/config");
    assert.throws(() => assertProductionConfig(), /SCORER_INTERNAL_TOKEN/);
  });
}

async function run() {
  await testValidTokenHeader();
  await testMissingTokenCompatibility();
  await testProductionRequiresToken();
  console.log("scorer-auth.test.js passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
