const crypto = require("crypto");

function requestFingerprint(payload) {
  return crypto.createHash("sha256").update(canonical(payload), "utf8").digest("hex");
}
function checkIdempotency(db, key, payload) {
  if (!key) return { status: "UNKEYED", fingerprint: requestFingerprint(payload) };
  db.pilotIdempotency = Array.isArray(db.pilotIdempotency) ? db.pilotIdempotency : [];
  const fingerprint = requestFingerprint(payload);
  const existing = db.pilotIdempotency.find(item => item.key === key);
  if (!existing) { const record = { key, fingerprint, createdAt: new Date().toISOString() }; db.pilotIdempotency.push(record); return { status: "NEW", fingerprint, record }; }
  if (existing.fingerprint !== fingerprint) return { status: "CONFLICT", fingerprint, existing };
  return { status: "REPLAY", fingerprint, existing };
}
function createPilotRequestFingerprint(payload) { return requestFingerprint(payload); }
function beginPilotRequest(db, { idempotencyKey, requestPayload = {}, scope = "default", now = new Date().toISOString() } = {}) {
  if (!idempotencyKey) return { allowed: false, replay: false, blocking_reasons: ["PILOT_IDEMPOTENCY_KEY_MISSING"] };
  db.pilotIdempotency = Array.isArray(db.pilotIdempotency) ? db.pilotIdempotency : [];
  const fingerprint = requestFingerprint(requestPayload);
  const existing = db.pilotIdempotency.find(item => item.key === idempotencyKey && item.scope === scope);
  if (!existing) { const record = { key: idempotencyKey, scope, fingerprint, createdAt: now, result: null }; db.pilotIdempotency.push(record); return { allowed: true, replay: false, record, fingerprint }; }
  if (existing.fingerprint !== fingerprint) return { allowed: false, replay: false, blocking_reasons: ["PILOT_IDEMPOTENCY_CONFLICT"], record: existing };
  return { allowed: true, replay: true, result: existing.result, record: existing, fingerprint };
}
function completePilotRequest(db, request, result, now = new Date().toISOString()) {
  const record = request?.record || (db.pilotIdempotency || []).find(item => item.fingerprint === request?.fingerprint);
  if (!record) return null;
  record.result = result && typeof result === "object" ? { ...result } : result;
  record.completedAt = now;
  return record;
}
function getPilotIdempotencyRecord(db, scope, key) { return (db.pilotIdempotency || []).find(item => item.scope === scope && item.key === key) || null; }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
module.exports = { beginPilotRequest, checkIdempotency, completePilotRequest, createPilotRequestFingerprint, getPilotIdempotencyRecord, requestFingerprint };
