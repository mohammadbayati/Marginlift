const { initializeStorage, storageDriver, storageHealth } = require("../src/storage");

async function run() {
  await initializeStorage();
  const health = await storageHealth();
  if (health.status !== "ok") throw new Error("Storage migration health check failed.");
  console.log(`MarginLift storage is ready on ${storageDriver}.`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
