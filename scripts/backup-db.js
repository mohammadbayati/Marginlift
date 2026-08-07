const fs = require("fs");
const path = require("path");
const { resolveDbPath } = require("../src/config");

const dbPath = resolveDbPath();
const backupDir = process.env.MARGINLIFT_BACKUP_DIR || path.join(path.dirname(dbPath), "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetPath = path.join(backupDir, `db-${stamp}.json`);

if (!fs.existsSync(dbPath)) {
  throw new Error(`Database file not found: ${dbPath}`);
}

fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(dbPath, targetPath);
console.log(`MarginLift database backup created at ${targetPath}`);
