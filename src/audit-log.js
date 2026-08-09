const crypto = require("crypto");

function appendAudit(db, input) {
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
  const previous = db.auditLog.filter(item => item.organizationId === input.organizationId).slice(-1)[0];
  const record = {
    id: input.id,
    organizationId: input.organizationId,
    actorId: input.actorId || "system",
    actorRole: input.actorRole || "system",
    action: input.action,
    targetType: input.targetType || "workspace",
    targetId: input.targetId || input.organizationId,
    status: input.status || "succeeded",
    requestId: input.requestId || null,
    metadata: sanitizeMetadata(input.metadata),
    createdAt: input.createdAt || new Date().toISOString(),
    previousHash: previous?.hash || null
  };
  record.hash = hashRecord(record);
  db.auditLog.push(record);
  return record;
}

function verifyAuditLog(records, organizationId) {
  const items = (records || []).filter(item => item.organizationId === organizationId);
  let previousHash = null;
  for (const item of items) {
    if (item.previousHash !== previousHash || item.hash !== hashRecord(item)) {
      return { valid: false, checked: items.length, failedId: item.id };
    }
    previousHash = item.hash;
  }
  return { valid: true, checked: items.length, latestHash: previousHash };
}

function hashRecord(record) {
  const copy = { ...record };
  delete copy.hash;
  return `sha256:${crypto.createHash("sha256").update(stableStringify(copy)).digest("hex")}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, raw]) => {
    if (typeof raw === "string") return [key, raw.slice(0, 160)];
    if (typeof raw === "number" && Number.isFinite(raw)) return [key, raw];
    if (typeof raw === "boolean" || raw === null) return [key, raw];
    return [key, String(raw).slice(0, 160)];
  }));
}

module.exports = { appendAudit, verifyAuditLog };
