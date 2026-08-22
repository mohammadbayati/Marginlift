const fs = require("fs");
const path = require("path");
const { artifactHealth } = require("./artifact-store");
const { getRegistry } = require("./model-registry");
const { getMetrics } = require("./observability");
const { queueHealth, storageHealth } = require("./storage");

const DEFAULT_TIMEOUT_MS = 1500;

function publicLiveness() {
  return {
    status: "ok",
    service: "marginlift",
    uptimeSeconds: getMetrics().uptimeSeconds
  };
}

async function buildOperationalHealth(options = {}) {
  const checks = {
    database: await safeCheck("database", options.storageHealth || storageHealth, options),
    artifacts: await safeCheck("artifacts", options.artifactHealth || artifactHealth, options),
    queue: await safeCheck("queue", options.queueHealth || queueHealth, options),
    backup: await safeCheck("backup", () => backupHealth(options), options),
    scorer: await safeCheck("scorer", () => scorerHealth(options), options)
  };

  const statuses = Object.values(checks).map(check => check.status);
  const status = statuses.includes("error") ? "error" : statuses.includes("degraded") ? "degraded" : "ok";
  return {
    status,
    service: "marginlift",
    checkedAt: new Date().toISOString(),
    checks,
    metrics: {
      uptimeSeconds: getMetrics().uptimeSeconds,
      requests: getMetrics().requests,
      errors: getMetrics().errors,
      errorRate: getMetrics().errorRate
    }
  };
}

async function safeCheck(name, fn, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.MARGINLIFT_HEALTH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  try {
    return await withTimeout(Promise.resolve().then(fn), timeoutMs, name);
  } catch (error) {
    return {
      status: error.code === "HEALTH_CHECK_TIMEOUT" ? "degraded" : "error",
      message: error.code === "HEALTH_CHECK_TIMEOUT" ? "check timed out" : "check failed"
    };
  }
}

function withTimeout(promise, timeoutMs, name) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${name} health check timed out`);
      error.code = "HEALTH_CHECK_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function scorerHealth(options = {}) {
  const startedAt = Date.now();
  const registryClient = options.getRegistry || getRegistry;
  try {
    const registry = await registryClient();
    const sanitized = sanitizeRegistry(registry);
    return {
      status: sanitized.production ? "ok" : "degraded",
      latencyMs: Date.now() - startedAt,
      registry: sanitized
    };
  } catch (error) {
    return {
      status: "degraded",
      latencyMs: Date.now() - startedAt,
      registry: null
    };
  }
}

async function backupHealth(options = {}) {
  const statusPath = options.backupStatusPath || resolveBackupStatusPath();
  const maxAgeHours = Number(options.backupMaxAgeHours || process.env.MARGINLIFT_BACKUP_MAX_AGE_HOURS || 30);
  try {
    const raw = await fs.promises.readFile(statusPath, "utf8");
    const status = JSON.parse(raw);
    const lastBackupCreatedAt = status.lastBackupCreatedAt || status.lastBackupAt || null;
    const lastRestoreVerifiedAt = status.lastRestoreVerifiedAt || null;
    const backupAgeHours = lastBackupCreatedAt ? (Date.now() - new Date(lastBackupCreatedAt).getTime()) / (60 * 60 * 1000) : Infinity;
    const verificationAgeHours = lastRestoreVerifiedAt ? (Date.now() - new Date(lastRestoreVerifiedAt).getTime()) / (60 * 60 * 1000) : Infinity;
    const backupStatus = status.backupStatus || status.status || (lastBackupCreatedAt ? "ok" : "missing");
    const verificationStatus = status.verificationStatus || (lastRestoreVerifiedAt ? status.status || "ok" : "not_verified");
    const ready = backupStatus === "ok" &&
      verificationStatus === "ok" &&
      backupAgeHours <= maxAgeHours &&
      verificationAgeHours <= maxAgeHours;
    return {
      status: ready ? "ok" : "degraded",
      backupStatus,
      verificationStatus,
      lastBackupCreatedAt,
      lastRestoreVerifiedAt,
      latestDatabaseBackup: status.latestDatabaseBackup || null,
      latestArtifactBackup: status.latestArtifactBackup || null,
      backupAgeHours: Number.isFinite(backupAgeHours) ? Math.round(backupAgeHours * 10) / 10 : null,
      verificationAgeHours: Number.isFinite(verificationAgeHours) ? Math.round(verificationAgeHours * 10) / 10 : null
    };
  } catch (error) {
    return {
      status: "degraded",
      backupStatus: "unknown",
      verificationStatus: "unknown",
      lastBackupCreatedAt: null,
      lastRestoreVerifiedAt: null,
      latestDatabaseBackup: null,
      latestArtifactBackup: null,
      backupAgeHours: null,
      verificationAgeHours: null
    };
  }
}

function sanitizeRegistry(registry = {}) {
  const versions = Array.isArray(registry.versions) ? registry.versions : [];
  const history = Array.isArray(registry.promotion_history) ? registry.promotion_history : [];
  const latestEvent = history[history.length - 1] || null;
  return {
    production: registry.production || null,
    previousProduction: registry.previous_production || null,
    versionCount: Number.isFinite(Number(registry.version_count)) ? Number(registry.version_count) : versions.length,
    historyCount: Number.isFinite(Number(registry.history_count)) ? Number(registry.history_count) : history.length,
    historyRetention: registry.history_retention || registry.promotion_history_retention || null,
    latestEvent: latestEvent ? {
      event: latestEvent.event || null,
      fromVersion: latestEvent.from_version || null,
      toVersion: latestEvent.to_version || null,
      createdAt: latestEvent.created_at || null,
      actor: latestEvent.actor || null,
      reason: latestEvent.reason || null
    } : registry.latest_event ? {
      event: registry.latest_event.event || null,
      fromVersion: registry.latest_event.from_version || null,
      toVersion: registry.latest_event.to_version || null,
      createdAt: registry.latest_event.created_at || null,
      actor: registry.latest_event.actor || null,
      reason: registry.latest_event.reason || null
    } : null
  };
}

function resolveBackupStatusPath() {
  if (process.env.MARGINLIFT_BACKUP_STATUS_PATH) return process.env.MARGINLIFT_BACKUP_STATUS_PATH;
  const backupDir = process.env.MARGINLIFT_BACKUP_DIR || path.join(__dirname, "..", "data", "backups");
  return path.join(backupDir, "status.json");
}

module.exports = {
  backupHealth,
  buildOperationalHealth,
  publicLiveness,
  sanitizeRegistry,
  safeCheck,
  withTimeout
};
