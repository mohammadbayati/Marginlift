const {
  closeStorage,
  initializeStorage,
  readLegacyJsonForMigration,
  storageDriver,
  storageHealth
} = require("../src/storage");
const {
  buildPostgresMigrations,
  createMigrationSnapshot,
  runPostgresMigrations,
  validatePostgresMigrations
} = require("../src/storage-migrations");

function createPool() {
  const { Pool } = require("pg");
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false
  });
}

async function run() {
  if (storageDriver !== "postgres") {
    await initializeStorage();
    const health = await storageHealth();
    if (health.status !== "ok") throw new Error("Storage migration health check failed.");
    console.log(`MarginLift storage is ready on ${storageDriver}.`);
    await closeStorage();
    return;
  }

  const pool = createPool();
  const client = await pool.connect();
  try {
    const seed = await readLegacyJsonForMigration();
    const migrations = buildPostgresMigrations(seed);

    const snapshot = await createMigrationSnapshot(client, "pre-migration");
    console.log(`Migration snapshot created: ${snapshot.id}`);

    const dryRun = await runPostgresMigrations(client, migrations, {
      dryRun: true,
      logger: message => console.log(message)
    });
    console.log(`Migration dry run passed: ${dryRun.pending.length ? dryRun.pending.join(", ") : "no pending migrations"}`);

    const migrated = await runPostgresMigrations(client, migrations, {
      logger: message => console.log(message)
    });
    console.log(`Migrations applied: ${migrated.applied.length ? migrated.applied.join(", ") : "none"}`);

    await validatePostgresMigrations(client, migrations);
    const health = await storageHealth();
    if (health.status !== "ok") throw new Error("Storage migration health check failed.");
    console.log(`MarginLift storage is ready on ${storageDriver}.`);
  } finally {
    client.release();
    await pool.end();
    await closeStorage();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
