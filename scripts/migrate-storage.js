const { closeStorage, initializeStorage, storageDriver, storageHealth } = require("../src/storage");

async function run() {
  try {
    await initializeStorage();
    const health = await storageHealth();
    if (health.status !== "ok") throw new Error("Storage migration health check failed.");
    console.log(`MarginLift storage is ready on ${storageDriver}.`);
  } finally {
    await closeStorage();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
