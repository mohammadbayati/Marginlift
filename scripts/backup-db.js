const fs = require("fs");
const path = require("path");
const { readDb } = require("../src/storage");

async function run() {
  const backupDir = process.env.MARGINLIFT_BACKUP_DIR || path.join(__dirname, "..", "data", "backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetPath = path.join(backupDir, `logical-state-${stamp}.json`);
  const db = await readDb();
  await fs.promises.mkdir(backupDir, { recursive: true });
  await fs.promises.writeFile(targetPath, JSON.stringify(db), { encoding: "utf8", mode: 0o600 });
  console.log(`MarginLift logical backup created at ${targetPath}`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
