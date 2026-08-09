const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const testRoot = path.join(os.tmpdir(), `marginlift-platform-${Date.now()}`);
process.env.MARGINLIFT_DB = path.join(testRoot, "db.json");
process.env.ARTIFACT_STORAGE_PATH = path.join(testRoot, "artifacts");
process.env.ARTIFACT_ENCRYPTION_KEY = "11".repeat(32);
process.env.MARGINLIFT_LOG_LEVEL = "silent";

const { requireRole } = require("../src/access-control");
const { appendAudit, verifyAuditLog } = require("../src/audit-log");
const { persistArtifact, readArtifact } = require("../src/artifact-store");
const { claimJob, enqueueJob, finishJob, listJobs, readDb, transact } = require("../src/storage");

async function run() {
  const organizationId = "org_platform";
  await transact(db => {
    appendAudit(db, {
      id: "aud_one",
      organizationId,
      actorId: "usr_owner",
      actorRole: "owner",
      action: "test_started"
    });
    appendAudit(db, {
      id: "aud_two",
      organizationId,
      actorId: "usr_owner",
      actorRole: "owner",
      action: "test_completed"
    });
  });

  const db = await readDb();
  assert.strictEqual(verifyAuditLog(db.auditLog, organizationId).valid, true);
  const tampered = structuredClone(db.auditLog);
  tampered[0].action = "tampered";
  assert.strictEqual(verifyAuditLog(tampered, organizationId).valid, false);

  assert.doesNotThrow(() => requireRole({ membership: { role: "analyst" } }, "analyst"));
  assert.throws(
    () => requireRole({ membership: { role: "viewer" } }, "analyst"),
    error => error.code === "INSUFFICIENT_ROLE"
  );

  const csv = "customer_id,revenue\ncus_1,120000\n";
  const artifact = await persistArtifact({
    id: "art_platform",
    organizationId,
    type: "customer_csv",
    name: "platform-test.csv",
    content: csv,
    createdBy: "usr_owner"
  });
  const encryptedPath = path.join(process.env.ARTIFACT_STORAGE_PATH, artifact.storageKey);
  assert.strictEqual(fs.readFileSync(encryptedPath).includes(Buffer.from("cus_1")), false);
  assert.strictEqual((await readArtifact(artifact)).toString("utf8"), csv);

  const firstJob = await enqueueJob({
    organizationId,
    type: "evidence_integrity_check",
    dedupeKey: "integrity:platform"
  });
  const duplicateJob = await enqueueJob({
    organizationId,
    type: "evidence_integrity_check",
    dedupeKey: "integrity:platform"
  });
  assert.ok(firstJob);
  assert.strictEqual(duplicateJob, null);
  const claimed = await claimJob();
  assert.strictEqual(claimed.id, firstJob.id);
  assert.strictEqual(claimed.status, "processing");
  await finishJob(claimed.id);
  assert.strictEqual((await listJobs(organizationId))[0].status, "completed");

  console.log("platform.test.js passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});
