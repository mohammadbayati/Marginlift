const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const testRoot = path.join(os.tmpdir(), `marginlift-observability-${Date.now()}`);
process.env.MARGINLIFT_DB = path.join(testRoot, "db.json");
process.env.ARTIFACT_STORAGE_PATH = path.join(testRoot, "artifacts");
process.env.ARTIFACT_ENCRYPTION_KEY = "44".repeat(32);
process.env.MARGINLIFT_BACKUP_STATUS_PATH = path.join(testRoot, "backups", "status.json");
process.env.MARGINLIFT_LOG_LEVEL = "silent";

const { buildRequestLogRecord, log } = require("../src/observability");
const { buildOperationalHealth, publicLiveness, sanitizeRegistry } = require("../src/operational-health");
const { start } = require("../src/server");

function waitForListening(server) {
  if (server.listening) return Promise.resolve();
  return new Promise(resolve => server.once("listening", resolve));
}

async function readResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function run() {
  fs.mkdirSync(path.dirname(process.env.MARGINLIFT_BACKUP_STATUS_PATH), { recursive: true });
  fs.writeFileSync(process.env.MARGINLIFT_BACKUP_STATUS_PATH, JSON.stringify({
    status: "ok",
    backupStatus: "ok",
    verificationStatus: "ok",
    lastBackupCreatedAt: new Date().toISOString(),
    lastRestoreVerifiedAt: new Date().toISOString(),
    latestDatabaseBackup: "postgres-test.dump",
    latestArtifactBackup: "artifacts-test.tar.gz",
    updatedAt: new Date().toISOString()
  }), "utf8");

  const logRecord = buildRequestLogRecord({
    requestId: "req_test_123",
    method: "GET",
    route: "/api/internal/health",
    status: 200,
    durationMs: 12.3,
    organizationId: "org_test",
    userId: "usr_test",
    role: "owner",
    authorization: "Bearer secret"
  });
  assert.deepStrictEqual(Object.keys(logRecord), [
    "requestId",
    "method",
    "route",
    "status",
    "durationMs",
    "organizationId",
    "userId",
    "role"
  ]);
  assert.strictEqual(logRecord.authorization, undefined);

  const oldLogLevel = process.env.MARGINLIFT_LOG_LEVEL;
  const oldConsoleLog = console.log;
  let emitted;
  process.env.MARGINLIFT_LOG_LEVEL = "info";
  console.log = line => { emitted = JSON.parse(line); };
  try {
    log("info", "schema_check", logRecord);
  } finally {
    console.log = oldConsoleLog;
    process.env.MARGINLIFT_LOG_LEVEL = oldLogLevel;
  }
  assert.deepStrictEqual(Object.keys(emitted).slice(0, 10), [
    "timestamp",
    "level",
    "requestId",
    "method",
    "route",
    "status",
    "durationMs",
    "organizationId",
    "userId",
    "role"
  ]);

  const sanitized = sanitizeRegistry({
    production: "model_b",
    previous_production: "model_a",
    versions: [{ version: "model_a", artifact: { model_sha256: "secret-ish" } }],
    promotion_history: [{ event: "rolled_back", from_version: "model_b", to_version: "model_a", reason: "canary", actor: "ops", created_at: "2026-01-01T00:00:00Z" }],
    promotion_history_retention: { max_entries: 100 }
  });
  assert.strictEqual(sanitized.versionCount, 1);
  assert.strictEqual(sanitized.latestEvent.reason, "canary");
  assert.strictEqual(JSON.stringify(sanitized).includes("model_sha256"), false);

  assert.strictEqual(publicLiveness().status, "ok");

  const degraded = await buildOperationalHealth({
    timeoutMs: 10,
    storageHealth: async () => ({ status: "ok", driver: "json" }),
    artifactHealth: async () => ({ status: "ok", enabled: true, writable: true }),
    queueHealth: async () => new Promise(resolve => setTimeout(() => resolve({ status: "ok" }), 100)),
    getRegistry: async () => ({ production: "model_a", version_count: 1 }),
    backupStatusPath: process.env.MARGINLIFT_BACKUP_STATUS_PATH
  });
  assert.strictEqual(degraded.checks.queue.status, "degraded");
  assert.ok(["ok", "degraded"].includes(degraded.status));

  const server = start(0);
  await waitForListening(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(route, options = {}) {
    const headers = {};
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.cookie) headers.Cookie = options.cookie;
    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    return { response, payload: await readResponse(response), cookie: response.headers.get("set-cookie") };
  }

  try {
    const publicHealth = await request("/api/health");
    assert.strictEqual(publicHealth.response.status, 200);
    assert.strictEqual(publicHealth.payload.data.status, "ok");
    assert.strictEqual(publicHealth.payload.data.service, "marginlift");
    assert.strictEqual(publicHealth.payload.data.release.service, "marginlift");
    assert.ok(publicHealth.payload.data.release.environment);
    assert.ok(publicHealth.payload.data.release.commitSha);
    assert.strictEqual(publicHealth.payload.data.storage, undefined);
    assert.strictEqual(publicHealth.payload.data.checks, undefined);

    const anonymousInternal = await request("/api/internal/health");
    assert.strictEqual(anonymousInternal.response.status, 401);

    const login = await request("/api/auth/login", {
      method: "POST",
      body: { email: "growth@example.com", password: "demo1234" }
    });
    assert.strictEqual(login.response.status, 200);
    const cookie = login.cookie.split(";")[0];

    const internalHealth = await request("/api/internal/health", { cookie });
    assert.strictEqual(internalHealth.response.status, 200);
    assert.strictEqual(internalHealth.payload.data.release.service, "marginlift");
    assert.ok(internalHealth.payload.data.release.commitSha);
    assert.strictEqual(internalHealth.payload.data.checks.database.driver, "json");
    assert.strictEqual(internalHealth.payload.data.checks.artifacts.enabled, true);
    assert.strictEqual(internalHealth.payload.data.checks.backup.backupStatus, "ok");
    assert.strictEqual(internalHealth.payload.data.checks.backup.verificationStatus, "ok");
    assert.ok(internalHealth.payload.data.checks.backup.lastBackupCreatedAt);
    assert.ok(internalHealth.payload.data.checks.backup.lastRestoreVerifiedAt);
    assert.strictEqual(internalHealth.payload.data.checks.backup.latestDatabaseBackup, "postgres-test.dump");
    assert.ok(["ok", "degraded", "error"].includes(internalHealth.payload.data.checks.scorer.status));
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  console.log("observability-health.test.js passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
