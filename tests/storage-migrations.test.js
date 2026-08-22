const assert = require("assert");

const {
  buildPostgresMigrations,
  createMigrationSnapshot,
  planMigrations,
  runPostgresMigrations,
  validatePostgresMigrations
} = require("../src/storage-migrations");

function createFakeClient() {
  const state = {
    applied: new Map(),
    relations: new Set(["marginlift_schema_migrations", "marginlift_migration_snapshots"]),
    canonicalState: null,
    snapshots: [],
    tx: null
  };

  function begin() {
    state.tx = {
      applied: new Map(state.applied),
      relations: new Set(state.relations),
      canonicalState: state.canonicalState
    };
  }

  function rollback() {
    state.applied = state.tx.applied;
    state.relations = state.tx.relations;
    state.canonicalState = state.tx.canonicalState;
    state.tx = null;
  }

  function commit() {
    state.tx = null;
  }

  async function query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized === "BEGIN") {
      begin();
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "COMMIT") {
      commit();
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "ROLLBACK") {
      rollback();
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("CREATE TABLE IF NOT EXISTS marginlift_state")) {
      state.relations.add("marginlift_state");
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("CREATE TABLE IF NOT EXISTS marginlift_jobs")) {
      state.relations.add("marginlift_jobs");
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("CREATE TABLE IF NOT EXISTS marginlift_schema_migrations")) {
      state.relations.add("marginlift_schema_migrations");
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("CREATE TABLE IF NOT EXISTS marginlift_migration_snapshots")) {
      state.relations.add("marginlift_migration_snapshots");
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("CREATE INDEX IF NOT EXISTS marginlift_jobs_claim_idx")) {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT version, name, checksum, applied_at FROM marginlift_schema_migrations")) {
      return {
        rows: Array.from(state.applied.values()).sort((a, b) => a.version.localeCompare(b.version)),
        rowCount: state.applied.size
      };
    }
    if (normalized.startsWith("INSERT INTO marginlift_schema_migrations")) {
      state.applied.set(params[0], {
        version: params[0],
        name: params[1],
        checksum: params[2],
        applied_at: "2026-01-01T00:00:00.000Z"
      });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO marginlift_migration_snapshots")) {
      const snapshot = { id: state.snapshots.length + 1, created_at: "2026-01-01T00:00:00.000Z" };
      state.snapshots.push({ reason: params[0], payload: JSON.parse(params[1]) });
      return { rows: [snapshot], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT to_regclass")) {
      const relation = String(params[0]).replace(/^public\./, "");
      return { rows: [{ name: state.relations.has(relation) ? params[0] : null }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO marginlift_state")) {
      if (!state.canonicalState) state.canonicalState = JSON.parse(params[0]);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT COUNT(*)::int AS count FROM marginlift_state")) {
      return { rows: [{ count: state.canonicalState ? 1 : 0 }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT revision, payload, updated_at FROM marginlift_state")) {
      if (!state.canonicalState) return { rows: [], rowCount: 0 };
      return { rows: [{ revision: 0, payload: state.canonicalState, updated_at: "2026-01-01T00:00:00.000Z" }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT status, COUNT(*)::int AS count FROM marginlift_jobs")) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected query: ${normalized}`);
  }

  return { query, state };
}

async function run() {
  const seed = { meta: { version: 6 }, users: [] };
  const migrations = buildPostgresMigrations(seed);
  const client = createFakeClient();

  const snapshot = await createMigrationSnapshot(client, "test-snapshot");
  assert.strictEqual(snapshot.id, 1);
  assert.strictEqual(client.state.snapshots[0].reason, "test-snapshot");
  assert.strictEqual(snapshot.payload.state, null);

  const dryRun = await runPostgresMigrations(client, migrations, { dryRun: true });
  assert.deepStrictEqual(dryRun.pending, ["001_core_state_and_jobs"]);
  assert.strictEqual(client.state.applied.size, 0);
  assert.strictEqual(client.state.canonicalState, null);

  const migrated = await runPostgresMigrations(client, migrations);
  assert.deepStrictEqual(migrated.applied, ["001_core_state_and_jobs"]);
  assert.strictEqual(client.state.applied.size, 1);
  assert.deepStrictEqual(client.state.canonicalState, seed);

  const validation = await validatePostgresMigrations(client, migrations);
  assert.deepStrictEqual(validation.applied, ["001_core_state_and_jobs"]);
  assert.deepStrictEqual(planMigrations(migrations, Array.from(client.state.applied.values())), []);

  console.log("storage-migrations.test.js passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
