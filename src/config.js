const path = require("path");

const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "development-only-session-secret");
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : "development-only-jwt-secret");
const shadowScorerUrl = process.env.SHADOW_SCORER_URL || "http://localhost:8100";
const parsedDriftThreshold = Number(process.env.ORCHESTRATION_DRIFT_THRESHOLD || 0.2);
const orchestrationDriftThreshold = Number.isFinite(parsedDriftThreshold) && parsedDriftThreshold > 0 ? parsedDriftThreshold : 0.2;
const maxBodyBytes = Number(process.env.MARGINLIFT_MAX_BODY_BYTES || 2 * 1024 * 1024);
const publicSignupEnabled = process.env.MARGINLIFT_PUBLIC_SIGNUP === "true" || !isProduction;

function assertProductionConfig() {
  if (!isProduction) return;
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }
  if (!/^https:\/\//.test(process.env.APP_ORIGIN || "")) {
    throw new Error("APP_ORIGIN must be an HTTPS origin in production.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must point to PostgreSQL in production.");
  }
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL)) {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
  }
  if (!isValidEncryptionKey(process.env.ARTIFACT_ENCRYPTION_KEY || "")) {
    throw new Error("ARTIFACT_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64). ");
  }
}

function isValidEncryptionKey(value) {
  if (/^[a-f0-9]{64}$/i.test(value)) return true;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch (error) {
    return false;
  }
}

function resolveDbPath() {
  return process.env.MARGINLIFT_DB_PATH || process.env.MARGINLIFT_DB || path.join(__dirname, "..", "data", "db.json");
}

module.exports = {
  appOrigin: process.env.APP_ORIGIN || "",
  isProduction,
  jwtSecret,
  maxBodyBytes: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : 2 * 1024 * 1024,
  orchestrationDriftThreshold,
  port: Number(process.env.PORT || 3000),
  publicSignupEnabled,
  resolveDbPath,
  sessionSecret,
  shadowScorerUrl,
  trustProxy: process.env.TRUST_PROXY === "true",
  assertProductionConfig
};
