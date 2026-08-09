const crypto = require("crypto");

function appendDecision(db, input) {
  db.decisionLedger = Array.isArray(db.decisionLedger) ? db.decisionLedger : [];
  const previous = [...db.decisionLedger].reverse().find(item => item.organizationId === input.organizationId);
  const record = {
    id: input.id,
    organizationId: input.organizationId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    decision: input.decision,
    decisionFa: input.decisionFa,
    rationaleFa: input.rationaleFa,
    evidence: sanitizeEvidence(input.evidence),
    previousHash: previous?.hash || null,
    createdAt: input.createdAt || new Date().toISOString()
  };
  record.hash = hashRecord(record);
  db.decisionLedger.push(record);
  return record;
}

function verifyDecisionLedger(records, organizationId) {
  const entries = records.filter(item => item.organizationId === organizationId);
  let previousHash = null;
  for (const entry of entries) {
    if (entry.previousHash !== previousHash || hashRecord({ ...entry, hash: undefined }) !== entry.hash) {
      return { valid: false, checked: entries.length, brokenAt: entry.id };
    }
    previousHash = entry.hash;
  }
  return { valid: true, checked: entries.length, brokenAt: null, latestHash: previousHash };
}

function toPublicDecision(record) {
  return {
    id: record.id,
    eventType: record.eventType,
    entityType: record.entityType,
    entityId: record.entityId,
    decision: record.decision,
    decisionFa: record.decisionFa,
    rationaleFa: record.rationaleFa,
    evidence: record.evidence,
    previousHash: record.previousHash,
    hash: record.hash,
    createdAt: record.createdAt
  };
}

function hashRecord(record) {
  const payload = { ...record };
  delete payload.hash;
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sanitizeEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, raw]) => {
    if (typeof raw === "number" || typeof raw === "boolean" || raw === null) return [key, raw];
    return [key, String(raw).slice(0, 240)];
  }));
}

module.exports = {
  appendDecision,
  hashRecord,
  toPublicDecision,
  verifyDecisionLedger
};
