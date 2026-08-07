const fs = require("fs");
const path = require("path");
const { resolveDbPath } = require("./config");

const dbPath = resolveDbPath();
const dataDir = path.dirname(dbPath);

const initialDb = {
  meta: {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  users: [],
  organizations: [],
  memberships: [],
  sessions: [],
  campaigns: [],
  customerAnalyses: [],
  outcomes: [],
  events: []
};

function ensureDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(initialDb, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  return normalizeDb(db);
}

function normalizeDb(db) {
  db.meta = db.meta || {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.users = Array.isArray(db.users) ? db.users : [];
  db.organizations = Array.isArray(db.organizations) ? db.organizations : [];
  db.memberships = Array.isArray(db.memberships) ? db.memberships : [];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.campaigns = Array.isArray(db.campaigns) ? db.campaigns : [];
  db.customerAnalyses = Array.isArray(db.customerAnalyses) ? db.customerAnalyses : [];
  db.outcomes = Array.isArray(db.outcomes) ? db.outcomes : [];
  db.events = Array.isArray(db.events) ? db.events : [];
  return db;
}

function writeDb(db) {
  ensureDb();
  db.meta.updatedAt = new Date().toISOString();
  const tmpPath = `${dbPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmpPath, dbPath);
}

function transact(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

module.exports = {
  readDb,
  transact,
  writeDb
};
