const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dbFile = path.join(os.tmpdir(), `marginlift-qa-bootstrap-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.json`);
process.env.MARGINLIFT_DB = dbFile;
process.env.MARGINLIFT_LOG_LEVEL = "silent";

const { closeStorage } = require("../src/storage");
const { provisionQaWorkspace, provisionSinglePilotUser } = require("../scripts/manage-pilot-workspace");

function secret() {
  return `MLQA-${crypto.randomBytes(18).toString("base64url")}`;
}

function qaEnv(overrides = {}) {
  return {
    MARGINLIFT_QA_OWNER_EMAIL: `qa-owner-${Date.now()}@example.com`,
    MARGINLIFT_QA_OWNER_PASSWORD: secret(),
    MARGINLIFT_QA_ADMIN_EMAIL: `qa-admin-${Date.now()}@example.com`,
    MARGINLIFT_QA_ADMIN_PASSWORD: secret(),
    MARGINLIFT_QA_ANALYST_EMAIL: `qa-analyst-${Date.now()}@example.com`,
    MARGINLIFT_QA_ANALYST_PASSWORD: secret(),
    MARGINLIFT_QA_VIEWER_EMAIL: `qa-viewer-${Date.now()}@example.com`,
    MARGINLIFT_QA_VIEWER_PASSWORD: secret(),
    ...overrides
  };
}

async function capture(fn, args, envPatch) {
  const originalArgv = process.argv;
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const originalEnv = {};
  for (const key of Object.keys(envPatch)) {
    originalEnv[key] = process.env[key];
    process.env[key] = envPatch[key];
  }

  let stdout = "";
  let stderr = "";
  process.argv = [process.execPath, "manage-pilot-workspace.js", ...args];
  process.stdout.write = chunk => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = chunk => {
    stderr += String(chunk);
    return true;
  };

  try {
    await fn();
    return { ok: true, stdout, stderr };
  } catch (error) {
    stderr += `${error.message}\n`;
    return { ok: false, stdout, stderr, error };
  } finally {
    process.argv = originalArgv;
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
    for (const key of Object.keys(envPatch)) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
}

function assertNoSecretLeak(output, env) {
  const text = `${output.stdout}\n${output.stderr}`;
  for (const key of Object.keys(env).filter(item => item.startsWith("MARGINLIFT_QA_") && item.endsWith("_PASSWORD"))) {
    assert(!text.includes(env[key]), `${key} leaked in command output`);
  }
}

function readDb() {
  return JSON.parse(fs.readFileSync(dbFile, "utf8"));
}

async function run() {
  const env = qaEnv();
  const args = ["--qa-bootstrap", "--organization=MarginLift RC2 QA"];

  const first = await capture(provisionQaWorkspace, args, env);
  assert.strictEqual(first.ok, true, first.stderr);
  assertNoSecretLeak(first, env);
  const firstPayload = JSON.parse(first.stdout);
  assert.strictEqual(firstPayload.mode, "secure_qa_bootstrap");
  assert.strictEqual(firstPayload.organization.status, "CREATED");
  assert.deepStrictEqual(firstPayload.members.map(item => item.role).sort(), ["admin", "analyst", "owner", "viewer"]);
  assert(firstPayload.members.every(item => item.credential === "PRESENT"));
  assert(firstPayload.members.every(item => !Object.prototype.hasOwnProperty.call(item, "password")));

  let db = readDb();
  const organization = db.organizations.find(item => item.name === "MarginLift RC2 QA");
  assert(organization);
  assert.strictEqual(db.users.length, 4);
  assert.strictEqual(db.memberships.filter(item => item.organizationId === organization.id).length, 4);
  assert.deepStrictEqual(db.memberships.map(item => item.role).sort(), ["admin", "analyst", "owner", "viewer"]);
  assert(db.auditLog.some(item => item.action === "qa_workspace_provisioned"));
  assert(db.auditLog.some(item => item.action === "qa_member_provisioned"));
  let rawDb = fs.readFileSync(dbFile, "utf8");
  for (const key of Object.keys(env).filter(item => item.startsWith("MARGINLIFT_QA_") && item.endsWith("_PASSWORD"))) {
    assert(!rawDb.includes(env[key]), `${key} leaked in persisted state`);
  }

  const second = await capture(provisionQaWorkspace, args, env);
  assert.strictEqual(second.ok, true, second.stderr);
  assertNoSecretLeak(second, env);
  const secondPayload = JSON.parse(second.stdout);
  assert.strictEqual(secondPayload.organization.status, "PRESENT");
  assert(secondPayload.members.every(item => item.account === "PRESENT"));
  db = readDb();
  assert.strictEqual(db.users.length, 4);
  assert.strictEqual(db.memberships.length, 4);

  const rotatedEnv = {
    ...env,
    MARGINLIFT_QA_OWNER_PASSWORD: secret(),
    MARGINLIFT_QA_ADMIN_PASSWORD: secret(),
    MARGINLIFT_QA_ANALYST_PASSWORD: secret(),
    MARGINLIFT_QA_VIEWER_PASSWORD: secret()
  };
  const rotated = await capture(provisionQaWorkspace, [...args, "--rotate"], rotatedEnv);
  assert.strictEqual(rotated.ok, true, rotated.stderr);
  assertNoSecretLeak(rotated, rotatedEnv);
  assert(JSON.parse(rotated.stdout).members.every(item => item.account === "ROTATED"));
  db = readDb();
  assert(db.auditLog.some(item => item.action === "qa_credential_rotated"));
  rawDb = fs.readFileSync(dbFile, "utf8");
  for (const key of Object.keys(rotatedEnv).filter(item => item.startsWith("MARGINLIFT_QA_") && item.endsWith("_PASSWORD"))) {
    assert(!rawDb.includes(rotatedEnv[key]), `${key} leaked in persisted state`);
  }

  const disabled = await capture(provisionQaWorkspace, [...args, "--disable"], rotatedEnv);
  assert.strictEqual(disabled.ok, true, disabled.stderr);
  assert(JSON.parse(disabled.stdout).members.every(item => item.account === "DISABLED"));
  db = readDb();
  assert(db.users.every(item => item.accessExpiresAt));
  assert(db.auditLog.some(item => item.action === "qa_member_disabled"));

  const beforeMissing = {
    users: db.users.length,
    memberships: db.memberships.length,
    auditLog: db.auditLog.length
  };
  const missingEnv = { ...env };
  delete missingEnv.MARGINLIFT_QA_VIEWER_PASSWORD;
  const missing = await capture(provisionQaWorkspace, args, missingEnv);
  assert.strictEqual(missing.ok, false);
  assert.match(missing.stderr, /MARGINLIFT_QA_VIEWER_PASSWORD=MISSING/);
  db = readDb();
  assert.strictEqual(db.users.length, beforeMissing.users);
  assert.strictEqual(db.memberships.length, beforeMissing.memberships);
  assert.strictEqual(db.auditLog.length, beforeMissing.auditLog);

  const invalidRole = await capture(provisionSinglePilotUser, [
    "--organization=MarginLift RC2 QA",
    "--email=invalid-role@example.com",
    `--password=${secret()}`,
    "--role=operator"
  ], {});
  assert.strictEqual(invalidRole.ok, false);
  assert.match(invalidRole.stderr, /invalid|معتبر/i);

  const deployScript = fs.readFileSync(path.join(__dirname, "..", "ops", "windows", "deploy.ps1"), "utf8");
  assert.match(deployScript, /\[string\]\$ServerHost = "91\.107\.190\.221"/);
  assert.match(deployScript, /\[string\]\$ServerUser = "root"/);

  console.log("qa-bootstrap.test.js passed");
}

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeStorage()
      .catch(() => undefined)
      .finally(() => {
        if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
      });
  });
