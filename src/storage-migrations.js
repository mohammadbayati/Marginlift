const crypto = require("crypto");

const CORE_STATE_SQL = `
  CREATE TABLE IF NOT EXISTS marginlift_state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    revision BIGINT NOT NULL DEFAULT 0,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const JOBS_SQL = `
  CREATE TABLE IF NOT EXISTS marginlift_jobs (
    id TEXT PRIMARY KEY,
    organization_id TEXT,
    type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    dedupe_key TEXT,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const JOBS_CLAIM_INDEX_SQL = "CREATE INDEX IF NOT EXISTS marginlift_jobs_claim_idx ON marginlift_jobs (status, available_at, created_at)";

function checksumFor(parts) {
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
}

function buildPostgresMigrations(seedPayload) {
  const version = "001_core_state_and_jobs";
  const name = "Create core state and durable job tables";
  const checksum = checksumFor([version, name, CORE_STATE_SQL, JOBS_SQL, JOBS_CLAIM_INDEX_SQL]);

  return [{
    version,
    name,
    checksum,
    up: async client => {
      await client.query(CORE_STATE_SQL);
      await client.query(JOBS_SQL);
      await client.query(JOBS_CLAIM_INDEX_SQL);
      await client.query(
        "INSERT INTO marginlift_state (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",
        [JSON.stringify(seedPayload)]
      );
    },
    validate: async client => {
      await assertRelationExists(client, "marginlift_state");
      await assertRelationExists(client, "marginlift_jobs");
      const state = await client.query("SELECT COUNT(*)::int AS count FROM marginlift_state WHERE id = 1");
      const count = Number(state.rows[0] && state.rows[0].count);
      if (count !== 1) throw new Error("marginlift_state must contain exactly one canonical state row.");
    }
  }];
}

async function ensureMigrationControlTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS marginlift_schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS marginlift_migration_snapshots (
      id BIGSERIAL PRIMARY KEY,
      reason TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listAppliedMigrations(client) {
  const result = await client.query("SELECT version, name, checksum, applied_at FROM marginlift_schema_migrations ORDER BY version");
  return result.rows;
}

function planMigrations(migrations, applied) {
  const appliedByVersion = new Map(applied.map(row => [row.version, row]));
  const pending = [];
  for (const migration of migrations) {
    const recorded = appliedByVersion.get(migration.version);
    if (!recorded) {
      pending.push(migration);
      continue;
    }
    if (recorded.checksum !== migration.checksum) {
      throw new Error(`Migration checksum mismatch for ${migration.version}.`);
    }
  }
  return pending;
}

async function createMigrationSnapshot(client, reason = "pre-migration") {
  await ensureMigrationControlTables(client);
  const applied = await listAppliedMigrations(client);
  const snapshot = {
    schemaMigrations: applied.map(row => ({
      version: row.version,
      name: row.name,
      checksum: row.checksum,
      appliedAt: row.applied_at
    })),
    state: await readStateSnapshot(client),
    jobs: await readJobSnapshot(client)
  };
  const result = await client.query(
    "INSERT INTO marginlift_migration_snapshots (reason, payload) VALUES ($1, $2::jsonb) RETURNING id, created_at",
    [reason, JSON.stringify(snapshot)]
  );
  return {
    id: result.rows[0].id,
    createdAt: result.rows[0].created_at,
    payload: snapshot
  };
}

async function runPostgresMigrations(client, migrations, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const logger = typeof options.logger === "function" ? options.logger : () => undefined;
  await client.query("BEGIN");
  try {
    await ensureMigrationControlTables(client);
    const applied = await listAppliedMigrations(client);
    const pending = planMigrations(migrations, applied);

    for (const migration of pending) {
      logger(`${dryRun ? "Dry-running" : "Applying"} migration ${migration.version}: ${migration.name}`);
      await migration.up(client);
      await migration.validate(client);
      if (!dryRun) {
        await client.query(
          "INSERT INTO marginlift_schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [migration.version, migration.name, migration.checksum]
        );
      }
    }

    if (dryRun) await client.query("ROLLBACK");
    else await client.query("COMMIT");
    return { pending: pending.map(item => item.version), applied: dryRun ? [] : pending.map(item => item.version) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function validatePostgresMigrations(client, migrations) {
  await ensureMigrationControlTables(client);
  const applied = await listAppliedMigrations(client);
  const pending = planMigrations(migrations, applied);
  if (pending.length) throw new Error(`Pending migrations remain: ${pending.map(item => item.version).join(", ")}`);
  for (const migration of migrations) await migration.validate(client);
  return { applied: applied.map(item => item.version) };
}

async function assertRelationExists(client, relationName) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${relationName}`]);
  if (!result.rows[0] || !result.rows[0].name) throw new Error(`Missing required relation: ${relationName}`);
}

async function relationExists(client, relationName) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${relationName}`]);
  return Boolean(result.rows[0] && result.rows[0].name);
}

async function readStateSnapshot(client) {
  if (!(await relationExists(client, "marginlift_state"))) return null;
  const result = await client.query("SELECT revision, payload, updated_at FROM marginlift_state WHERE id = 1");
  if (result.rowCount !== 1) return null;
  return {
    revision: result.rows[0].revision,
    updatedAt: result.rows[0].updated_at,
    payload: result.rows[0].payload
  };
}

async function readJobSnapshot(client) {
  if (!(await relationExists(client, "marginlift_jobs"))) return null;
  const counts = await client.query("SELECT status, COUNT(*)::int AS count FROM marginlift_jobs GROUP BY status ORDER BY status");
  return {
    byStatus: counts.rows.map(row => ({ status: row.status, count: Number(row.count) }))
  };
}

module.exports = {
  buildPostgresMigrations,
  createMigrationSnapshot,
  ensureMigrationControlTables,
  planMigrations,
  runPostgresMigrations,
  validatePostgresMigrations
};
