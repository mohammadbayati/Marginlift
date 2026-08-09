const crypto = require("crypto");

const startedAt = Date.now();
const metrics = {
  requests: 0,
  errors: 0,
  durationMsTotal: 0,
  durationMsMax: 0,
  byStatus: {},
  byRoute: {}
};

function beginRequest(req, res) {
  const requestId = cleanRequestId(req.headers["x-request-id"]) || crypto.randomUUID();
  const started = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  return () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const status = String(res.statusCode || 500);
    const route = normalizeRoute(req.url);
    metrics.requests += 1;
    metrics.durationMsTotal += durationMs;
    metrics.durationMsMax = Math.max(metrics.durationMsMax, durationMs);
    metrics.byStatus[status] = (metrics.byStatus[status] || 0) + 1;
    metrics.byRoute[route] = (metrics.byRoute[route] || 0) + 1;
    if (res.statusCode >= 500) metrics.errors += 1;
    log("info", "http_request", {
      requestId,
      method: req.method,
      route,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10
    });
  };
}

function getMetrics() {
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    requests: metrics.requests,
    errors: metrics.errors,
    errorRate: metrics.requests ? metrics.errors / metrics.requests : 0,
    averageDurationMs: metrics.requests ? metrics.durationMsTotal / metrics.requests : 0,
    maxDurationMs: metrics.durationMsMax,
    byStatus: { ...metrics.byStatus },
    byRoute: { ...metrics.byRoute },
    memory: process.memoryUsage()
  };
}

function log(level, event, fields = {}) {
  if (process.env.MARGINLIFT_LOG_LEVEL === "silent") return;
  const record = { timestamp: new Date().toISOString(), level, event, ...fields };
  const writer = level === "error" ? console.error : console.log;
  writer(JSON.stringify(record));
}

function cleanRequestId(value) {
  const text = String(value || "");
  return /^[a-zA-Z0-9_-]{8,80}$/.test(text) ? text : null;
}

function normalizeRoute(rawUrl) {
  try {
    return new URL(rawUrl, "http://localhost").pathname.replace(/\/(usr|org|mem|cmp|cus|exp|out|art|job)_[a-zA-Z0-9_-]+/g, "/:id");
  } catch (error) {
    return "/invalid";
  }
}

module.exports = { beginRequest, getMetrics, log };
