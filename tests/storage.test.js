const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dbPath = path.join(os.tmpdir(), `marginlift-storage-${Date.now()}.json`);
process.env.MARGINLIFT_DB = dbPath;

const legacyDb = {
  meta: { version: 1, createdAt: "2026-01-01T00:00:00.000Z" },
  users: [{ id: "usr_legacy" }],
  organizations: [],
  memberships: [],
  sessions: [],
  campaigns: [],
  customerAnalyses: [{ id: "customer_legacy", organizationId: "org_legacy" }],
  outcomes: [{ id: "outcome_legacy", organizationId: "org_legacy" }]
};

fs.writeFileSync(dbPath, JSON.stringify(legacyDb), "utf8");

async function run() {
  const { readDb, transact } = require("../src/storage");
  const normalized = await readDb();

  assert.strictEqual(normalized.meta.version, 4);
  assert.deepStrictEqual(normalized.experiments, []);
  assert.strictEqual(normalized.customerAnalyses[0].id, "customer_legacy");
  assert.strictEqual(normalized.outcomes[0].id, "outcome_legacy");
  assert.deepStrictEqual(normalized.events, []);
  assert.deepStrictEqual(normalized.decisionLedger, []);

  await transact(db => {
    db.experiments.push({ id: "exp_migrated", organizationId: "org_legacy" });
  });
  assert.strictEqual((await readDb()).experiments[0].id, "exp_migrated");

  console.log("storage.test.js passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});
