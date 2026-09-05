const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDbPath } = require("./config");
const { buildPostgresMigrations, runPostgresMigrations, validatePostgresMigrations } = require("./storage-migrations");

const CURRENT_SCHEMA_VERSION = 7;
const databaseUrl = process.env.DATABASE_URL || "";
const storageDriver = databaseUrl ? "postgres" : "json";
const dbPath = resolveDbPath();
const dataDir = path.dirname(dbPath);
const productionMode = process.env.NODE_ENV === "production";

let pool = null;
let initialization = null;
let jsonWriteQueue = Promise.resolve();

function createInitialDb() {
  const now = new Date().toISOString();
  return {
    meta: {
      version: CURRENT_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    },
    users: [],
    organizations: [],
    memberships: [],
    sessions: [],
    campaigns: [],
    customerAnalyses: [],
    retentionAnalyses: [],
    retentionShadowRuns: [],
    retentionMetricContracts: [],
    experiments: [],
    outcomes: [],
    pilotContracts: [],
    businessImpactLedgers: [],
    pilotWorkflows: [],
    pilotAcceptances: [],
    decisionLedger: [],
    auditLog: [],
    artifacts: [],
    jobs: [],
    events: []
  };
}

function normalizeDb(input) {
  const db = input && typeof input === "object" ? input : createInitialDb();
  const now = new Date().toISOString();
  db.meta = db.meta || { createdAt: now, updatedAt: now };
  db.meta.version = Math.max(CURRENT_SCHEMA_VERSION, Number(db.meta.version || 1));
  db.meta.createdAt = db.meta.createdAt || now;
  db.meta.updatedAt = db.meta.updatedAt || now;

  for (const key of [
    "users",
    "organizations",
    "memberships",
    "sessions",
    "campaigns",
    "customerAnalyses",
    "retentionAnalyses",
    "retentionShadowRuns",
    "retentionMetricContracts",
    "experiments",
    "outcomes",
    "pilotContracts",
    "businessImpactLedgers",
    "pilotWorkflows",
    "pilotAcceptances",
    "decisionLedger",
    "auditLog",
    "artifacts",
    "jobs",
    "events"
  ]) {
    db[key] = Array.isArray(db[key]) ? db[key] : [];
  }
  return db;
}

async function initializeStorage() {
  if (!initialization) {
    initialization = storageDriver === "postgres" ? initializePostgres() : initializeJson();
  }
  return initialization;
}

async function initializeJson() {
  await fs.promises.mkdir(dataDir, { recursive: true });
  try {
    await fs.promises.access(dbPath, fs.constants.F_OK);
  } catch (error) {
    await writeJsonFile(createInitialDb());
  }
}

async function initializePostgres() {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false
  });

  const client = await pool.connect();
  try {
    const seed = await readLegacyJsonForMigration();
    const migrations = buildPostgresMigrations(seed);
    if (!productionMode) {
      await runPostgresMigrations(client, migrations);
    }
    await validatePostgresMigrations(client, migrations);
  } finally {
    client.release();
  }
}

async function readLegacyJsonForMigration() {
  try {
    const raw = await fs.promises.readFile(dbPath, "utf8");
    return normalizeDb(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return createInitialDb();
  }
}

async function readDb() {
  await initializeStorage();
  if (storageDriver === "postgres") {
    const result = await pool.query("SELECT payload FROM marginlift_state WHERE id = 1");
    if (result.rowCount !== 1) throw new Error("MarginLift PostgreSQL state is missing.");
    return normalizeDb(result.rows[0].payload);
  }

  const raw = await fs.promises.readFile(dbPath, "utf8");
  return normalizeDb(JSON.parse(raw));
}

async function transact(mutator) {
  await initializeStorage();
  if (storageDriver === "postgres") return transactPostgres(mutator);

  const operation = jsonWriteQueue.then(async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeJsonFile(db);
    return result;
  });
  jsonWriteQueue = operation.catch(() => undefined);
  return operation;
}

async function transactPostgres(mutator) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const state = await client.query("SELECT payload FROM marginlift_state WHERE id = 1 FOR UPDATE");
    if (state.rowCount !== 1) throw new Error("MarginLift PostgreSQL state is missing.");
    const db = normalizeDb(state.rows[0].payload);
    const result = await mutator(db);
    db.meta.updatedAt = new Date().toISOString();
    await client.query(
      "UPDATE marginlift_state SET payload = $1::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = 1",
      [JSON.stringify(db)]
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function writeDb(db) {
  await initializeStorage();
  const normalized = normalizeDb(db);
  normalized.meta.updatedAt = new Date().toISOString();
  if (storageDriver === "postgres") {
    await pool.query(
      "UPDATE marginlift_state SET payload = $1::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = 1",
      [JSON.stringify(normalized)]
    );
    return;
  }
  await writeJsonFile(normalized);
}

async function writeJsonFile(db) {
  await fs.promises.mkdir(dataDir, { recursive: true });
  db.meta.updatedAt = new Date().toISOString();
  const tmpPath = `${dbPath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(db, null, 2), "utf8");
  await fs.promises.rename(tmpPath, dbPath);
}

async function storageHealth() {
  const startedAt = Date.now();
  try {
    await initializeStorage();
    if (storageDriver === "postgres") await pool.query("SELECT 1");
    else await fs.promises.access(dbPath, fs.constants.R_OK | fs.constants.W_OK);
    return { status: "ok", driver: storageDriver, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { status: "error", driver: storageDriver, latencyMs: Date.now() - startedAt };
  }
}

async function queueHealth() {
  const startedAt = Date.now();
  try {
    await initializeStorage();
    let rows;
    if (storageDriver === "postgres") {
      const result = await pool.query(`
        SELECT status, COUNT(*)::int AS count, MIN(created_at) AS oldest_created_at
        FROM marginlift_jobs
        GROUP BY status
      `);
      rows = result.rows.map(row => ({
        status: row.status,
        count: Number(row.count || 0),
        oldestCreatedAt: row.oldest_created_at || null
      }));
    } else {
      const db = await readDb();
      const grouped = new Map();
      for (const job of db.jobs || []) {
        const current = grouped.get(job.status) || { status: job.status, count: 0, oldestCreatedAt: null };
        current.count += 1;
        if (!current.oldestCreatedAt || new Date(job.createdAt) < new Date(current.oldestCreatedAt)) {
          current.oldestCreatedAt = job.createdAt || null;
        }
        grouped.set(job.status, current);
      }
      rows = Array.from(grouped.values());
    }
    const counts = rows.reduce((result, row) => {
      result[row.status || "unknown"] = row.count;
      return result;
    }, {});
    const oldestPending = rows
      .filter(row => row.status === "pending" && row.oldestCreatedAt)
      .map(row => new Date(row.oldestCreatedAt).getTime())
      .sort((a, b) => a - b)[0];
    return {
      status: counts.failed ? "degraded" : "ok",
      counts,
      oldestPendingAgeSeconds: oldestPending ? Math.max(0, Math.floor((Date.now() - oldestPending) / 1000)) : null,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: "error",
      counts: {},
      oldestPendingAgeSeconds: null,
      latencyMs: Date.now() - startedAt
    };
  }
}

async function enqueueJob(input) {
  await initializeStorage();
  const job = {
    id: input.id || `job_${crypto.randomUUID().replace(/-/g, "")}`,
    organizationId: input.organizationId || null,
    type: input.type,
    payload: input.payload || {},
    status: "pending",
    attempts: 0,
    maxAttempts: Number(input.maxAttempts || 3),
    dedupeKey: input.dedupeKey || null,
    availableAt: input.availableAt || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (storageDriver === "postgres") {
    const result = await pool.query(`
      INSERT INTO marginlift_jobs (
        id, organization_id, type, payload, status, attempts, max_attempts, dedupe_key, available_at, created_at, updated_at
      )
      SELECT $1, $2, $3, $4::jsonb, 'pending', 0, $5, $6, $7, NOW(), NOW()
      WHERE $6::text IS NULL OR NOT EXISTS (
        SELECT 1 FROM marginlift_jobs WHERE dedupe_key = $6 AND status IN ('pending', 'processing')
      )
      RETURNING *
    `, [job.id, job.organizationId, job.type, JSON.stringify(job.payload), job.maxAttempts, job.dedupeKey, job.availableAt]);
    return result.rowCount ? mapJob(result.rows[0]) : null;
  }

  return transact(db => {
    if (job.dedupeKey && db.jobs.some(item => item.dedupeKey === job.dedupeKey && ["pending", "processing"].includes(item.status))) {
      return null;
    }
    db.jobs.push(job);
    return job;
  });
}

async function claimJob() {
  await initializeStorage();
  if (storageDriver === "postgres") {
    const result = await pool.query(`
      WITH candidate AS (
        SELECT id FROM marginlift_jobs
        WHERE status = 'pending' AND available_at <= NOW()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE marginlift_jobs job
      SET status = 'processing', attempts = attempts + 1, locked_at = NOW(), updated_at = NOW()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*
    `);
    return result.rowCount ? mapJob(result.rows[0]) : null;
  }

  return transact(db => {
    const job = db.jobs
      .filter(item => item.status === "pending" && new Date(item.availableAt).getTime() <= Date.now())
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    if (!job) return null;
    job.status = "processing";
    job.attempts += 1;
    job.lockedAt = new Date().toISOString();
    job.updatedAt = job.lockedAt;
    return { ...job };
  });
}

async function finishJob(id, error = null) {
  await initializeStorage();
  if (storageDriver === "postgres") {
    const result = await pool.query(`
      UPDATE marginlift_jobs
      SET status = CASE WHEN $2::text IS NULL THEN 'completed' WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
          completed_at = CASE WHEN $2::text IS NULL OR attempts >= max_attempts THEN NOW() ELSE NULL END,
          available_at = CASE WHEN $2::text IS NOT NULL AND attempts < max_attempts THEN NOW() + (attempts * INTERVAL '30 seconds') ELSE available_at END,
          last_error = LEFT($2, 500), locked_at = NULL, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, error ? String(error) : null]);
    return result.rowCount ? mapJob(result.rows[0]) : null;
  }

  return transact(db => {
    const job = db.jobs.find(item => item.id === id);
    if (!job) return null;
    const terminal = !error || job.attempts >= job.maxAttempts;
    job.status = error ? (terminal ? "failed" : "pending") : "completed";
    job.lastError = error ? String(error).slice(0, 500) : null;
    job.lockedAt = null;
    job.completedAt = terminal ? new Date().toISOString() : null;
    if (error && !terminal) job.availableAt = new Date(Date.now() + job.attempts * 30000).toISOString();
    job.updatedAt = new Date().toISOString();
    return { ...job };
  });
}

async function listJobs(organizationId, limit = 50) {
  await initializeStorage();
  if (storageDriver === "postgres") {
    const result = await pool.query(
      "SELECT * FROM marginlift_jobs WHERE organization_id = $1 OR organization_id IS NULL ORDER BY created_at DESC LIMIT $2",
      [organizationId, Math.min(100, Number(limit || 50))]
    );
    return result.rows.map(mapJob);
  }
  const db = await readDb();
  return db.jobs
    .filter(item => item.organizationId === organizationId || item.organizationId === null)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, Math.min(100, Number(limit || 50)));
}

function mapJob(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    type: row.type,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    dedupeKey: row.dedupe_key,
    availableAt: row.available_at,
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function closeStorage() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  initialization = null;
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  claimJob,
  closeStorage,
  enqueueJob,
  finishJob,
  initializeStorage,
  listJobs,
  normalizeDb,
  queueHealth,
  readLegacyJsonForMigration,
  readDb,
  storageDriver,
  storageHealth,
  transact,
  writeDb
};
