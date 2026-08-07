const path = require("path");

const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "development-only-session-secret");
const maxBodyBytes = Number(process.env.MARGINLIFT_MAX_BODY_BYTES || 2 * 1024 * 1024);

function assertProductionConfig() {
  if (!isProduction) return;
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }
  if (!/^https:\/\//.test(process.env.APP_ORIGIN || "")) {
    throw new Error("APP_ORIGIN must be an HTTPS origin in production.");
  }
  if (!process.env.MARGINLIFT_DB_PATH && !process.env.MARGINLIFT_DB) {
    throw new Error("MARGINLIFT_DB_PATH must point to persistent storage in production.");
  }
}

function resolveDbPath() {
  return process.env.MARGINLIFT_DB_PATH || process.env.MARGINLIFT_DB || path.join(__dirname, "..", "data", "db.json");
}

module.exports = {
  appOrigin: process.env.APP_ORIGIN || "",
  isProduction,
  maxBodyBytes: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : 2 * 1024 * 1024,
  port: Number(process.env.PORT || 3000),
  resolveDbPath,
  sessionSecret,
  trustProxy: process.env.TRUST_PROXY === "true",
  assertProductionConfig
};
