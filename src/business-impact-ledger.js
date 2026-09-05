const crypto = require("crypto");

const LIFECYCLE_STATUSES = Object.freeze(["draft", "submitted", "verified", "rejected"]);
const ALLOWED_TRANSITIONS = Object.freeze({
  draft: ["submitted"],
  submitted: ["verified", "rejected"]
});

function normalizeBusinessImpactLedger(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const impactModel = normalizeImpactModel(source.impactModel, base.impactModel);
  const forecast = normalizeForecast(source.forecast, base.forecast);
  const realizedImpact = normalizeRealizedImpact(source.realizedImpact, base.realizedImpact);
  const roi = calculateROI(source.roi || base.roi || {});
  const lifecycleStatus = normalizeLifecycleStatus(source.lifecycleStatus || base.lifecycleStatus || "draft");
  const financeValidation = normalizeFinanceValidation(source.financeValidation, base.financeValidation, lifecycleStatus);

  return {
    id: normalizeString(source.id, base.id || ""),
    organizationId: normalizeString(source.organizationId, base.organizationId || ""),
    pilotContractId: normalizeNullableString(source.pilotContractId ?? base.pilotContractId ?? null),
    financialObjective: normalizeString(source.financialObjective, base.financialObjective || ""),
    impactModel,
    forecast,
    realizedImpact,
    roi,
    financeValidation,
    lifecycleStatus,
    auditEvents: Array.isArray(source.auditEvents)
      ? source.auditEvents.map(normalizeAuditEvent).filter(Boolean)
      : Array.isArray(base.auditEvents) ? base.auditEvents.map(normalizeAuditEvent).filter(Boolean) : [],
    audit: normalizeAudit(source.audit || base.audit)
  };
}

function calculateROI(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const investmentCost = normalizeNumber(source.investmentCost, null);
  const grossValue = normalizeNumber(source.grossValue, null);
  const netValue = Number.isFinite(investmentCost) && Number.isFinite(grossValue)
    ? grossValue - investmentCost
    : null;
  const roiPercentage = Number.isFinite(netValue) && Number.isFinite(investmentCost) && investmentCost > 0
    ? (netValue / investmentCost) * 100
    : null;
  return {
    investmentCost,
    grossValue,
    netValue,
    roiPercentage
  };
}

function validateFinanceVerification(ledger) {
  if (ledger.lifecycleStatus !== "verified" && ledger.financeValidation.status !== "verified") return;
  if (!ledger.realizedImpact.evidenceSource) {
    throw domainError(400, "FINANCE_EVIDENCE_SOURCE_REQUIRED", "Verified financial impact requires an evidence source.");
  }
  if (!ledger.financeValidation.verifiedBy) {
    throw domainError(400, "FINANCE_VERIFIER_REQUIRED", "Verified financial impact requires verifier identity.");
  }
  if (!ledger.financeValidation.verifiedAt) {
    throw domainError(400, "FINANCE_VERIFIED_AT_REQUIRED", "Verified financial impact requires verification timestamp.");
  }
}

function createBusinessImpactLedger(db, context, input = {}) {
  const organizationId = requireOrganizationId(context);
  assertInputOrganization(input, organizationId);
  db.businessImpactLedgers = Array.isArray(db.businessImpactLedgers) ? db.businessImpactLedgers : [];

  const now = timestamp(context);
  const ledger = normalizeBusinessImpactLedger({
    ...input,
    id: input.id || createId(),
    organizationId,
    lifecycleStatus: "draft",
    financeValidation: {
      ...(input.financeValidation || {}),
      status: "not_verified",
      verifiedBy: null,
      verifiedAt: null
    },
    auditEvents: [],
    audit: {
      createdAt: now,
      createdBy: context.actorId || null,
      updatedAt: now,
      updatedBy: context.actorId || null
    }
  });

  validateDraftLedger(ledger);
  appendAuditEvent(ledger, context, "business_impact_created", null, "draft", {
    source: "business_impact_ledger"
  });
  db.businessImpactLedgers.push(ledger);
  return toPublicLedger(ledger);
}

function getBusinessImpactLedger(db, context) {
  const organizationId = requireOrganizationId(context);
  const ledger = findLatestLedger(db, organizationId);
  if (!ledger) return fallbackLedger(context);
  assertTenantAccess(ledger, organizationId);
  return toPublicLedger(ledger);
}

function updateBusinessImpactLifecycle(db, context, input = {}) {
  const organizationId = requireOrganizationId(context);
  assertInputOrganization(input, organizationId);
  db.businessImpactLedgers = Array.isArray(db.businessImpactLedgers) ? db.businessImpactLedgers : [];
  const existing = findLatestLedger(db, organizationId);
  if (!existing) {
    throw domainError(404, "BUSINESS_IMPACT_LEDGER_NOT_FOUND", "No business impact ledger exists for this organization.");
  }
  assertTenantAccess(existing, organizationId);
  if (input.id && input.id !== existing.id) {
    throw domainError(404, "BUSINESS_IMPACT_LEDGER_NOT_FOUND", "No business impact ledger matched this organization.");
  }

  const target = resolveLifecycleTarget(input);
  if (!target) return updateDraftFields(existing, context, input);
  assertAllowedTransition(existing.lifecycleStatus, target);
  const canUpdateDraftFields = existing.lifecycleStatus === "draft";

  const next = normalizeBusinessImpactLedger({
    ...existing,
    ...(canUpdateDraftFields ? pickDraftFields(existing, input) : {}),
    impactModel: canUpdateDraftFields && input.impactModel ? normalizeImpactModel(input.impactModel, existing.impactModel) : existing.impactModel,
    forecast: canUpdateDraftFields && input.forecast ? normalizeForecast(input.forecast, existing.forecast) : existing.forecast,
    realizedImpact: input.realizedImpact ? normalizeRealizedImpact(input.realizedImpact, existing.realizedImpact) : existing.realizedImpact,
    roi: input.roi ? calculateROI(input.roi) : existing.roi,
    lifecycleStatus: target,
    financeValidation: mergeFinanceValidation(existing.financeValidation, input.financeValidation, target),
    auditEvents: Array.isArray(existing.auditEvents) ? [...existing.auditEvents] : [],
    audit: {
      ...(existing.audit || {}),
      updatedAt: timestamp(context),
      updatedBy: context.actorId || null
    }
  });

  validateDraftLedger(next);
  validateFinanceVerification(next);
  appendAuditEvent(next, context, "finance_validation_transition", existing.lifecycleStatus, target, input.metadata || {});
  Object.assign(existing, next);
  return toPublicLedger(existing);
}

function appendAuditEvent(ledger, context, action, from, to, metadata = {}) {
  const event = {
    action,
    from,
    to,
    userId: context.actorId || null,
    timestamp: timestamp(context),
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {}
  };
  ledger.auditEvents = Array.isArray(ledger.auditEvents) ? ledger.auditEvents : [];
  ledger.auditEvents.push(event);
  return event;
}

function summarizeBusinessImpactLedger(ledger) {
  if (!ledger || ledger.persisted !== true) {
    return {
      persisted: false,
      forecastValue: null,
      realizedValue: null,
      roiStatus: "not_available",
      financeVerification: "not_verified"
    };
  }
  return {
    persisted: true,
    id: ledger.id,
    pilotContractId: ledger.pilotContractId || null,
    forecastValue: ledger.forecast.predictedImpact,
    realizedValue: ledger.realizedImpact.measuredImpact,
    roiStatus: roiStatus(ledger.roi),
    financeVerification: ledger.financeValidation.status
  };
}

function updateDraftFields(existing, context, input) {
  if (existing.lifecycleStatus !== "draft") {
    throw domainError(409, "BUSINESS_IMPACT_LOCKED", "Only draft business impact ledgers can update financial fields.");
  }
  const next = normalizeBusinessImpactLedger({
    ...existing,
    ...pickDraftFields(existing, input),
    impactModel: input.impactModel ? normalizeImpactModel(input.impactModel, existing.impactModel) : existing.impactModel,
    forecast: input.forecast ? normalizeForecast(input.forecast, existing.forecast) : existing.forecast,
    realizedImpact: input.realizedImpact ? normalizeRealizedImpact(input.realizedImpact, existing.realizedImpact) : existing.realizedImpact,
    roi: input.roi ? calculateROI(input.roi) : existing.roi,
    auditEvents: Array.isArray(existing.auditEvents) ? [...existing.auditEvents] : [],
    audit: {
      ...(existing.audit || {}),
      updatedAt: timestamp(context),
      updatedBy: context.actorId || null
    }
  });
  validateDraftLedger(next);
  appendAuditEvent(next, context, "business_impact_draft_updated", "draft", "draft", input.metadata || {});
  Object.assign(existing, next);
  return toPublicLedger(existing);
}

function pickDraftFields(existing, input) {
  const picked = {};
  if (Object.prototype.hasOwnProperty.call(input, "pilotContractId")) {
    picked.pilotContractId = normalizeNullableString(input.pilotContractId);
  }
  if (Object.prototype.hasOwnProperty.call(input, "financialObjective")) {
    picked.financialObjective = normalizeString(input.financialObjective, existing.financialObjective);
  }
  return picked;
}

function resolveLifecycleTarget(input = {}) {
  if (input.action) {
    const action = normalizeString(input.action);
    if (action === "submit") return "submitted";
    if (action === "verify") return "verified";
    if (action === "reject") return "rejected";
    if (action === "update") return null;
    throw domainError(400, "UNKNOWN_BUSINESS_IMPACT_ACTION", "Business impact action is invalid.");
  }
  if (input.lifecycleStatus) return normalizeLifecycleStatus(input.lifecycleStatus);
  if (input.financeValidation?.status) {
    const status = normalizeFinanceValidationStatus(input.financeValidation.status);
    if (status === "not_verified") return null;
    return status;
  }
  return null;
}

function assertAllowedTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw domainError(409, "INVALID_BUSINESS_IMPACT_TRANSITION", `Invalid business impact lifecycle transition from ${from} to ${to}.`);
  }
}

function mergeFinanceValidation(existing = {}, patch = {}, lifecycleStatus) {
  const targetStatus = lifecycleStatus === "draft" ? "not_verified" : lifecycleStatus;
  return normalizeFinanceValidation({
    ...existing,
    ...(patch || {}),
    status: targetStatus
  }, {}, lifecycleStatus);
}

function normalizeImpactModel(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const baselineValue = normalizeNumber(source.baselineValue, base.baselineValue ?? null);
  const observedValue = normalizeNumber(source.observedValue, base.observedValue ?? null);
  const incrementalValue = normalizeNumber(
    source.incrementalValue,
    Number.isFinite(baselineValue) && Number.isFinite(observedValue) ? observedValue - baselineValue : base.incrementalValue ?? null
  );
  return {
    metric: normalizeString(source.metric, base.metric || "incremental_profit"),
    baselineValue,
    observedValue,
    incrementalValue,
    unit: normalizeString(source.unit, base.unit || "toman"),
    calculationMethod: normalizeString(source.calculationMethod, base.calculationMethod || "observed_minus_baseline")
  };
}

function normalizeForecast(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    predictedImpact: normalizeNumber(source.predictedImpact, base.predictedImpact ?? null),
    confidenceLevel: normalizeString(source.confidenceLevel, base.confidenceLevel || "unknown"),
    assumptions: normalizeStringArray(source.assumptions, base.assumptions)
  };
}

function normalizeRealizedImpact(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    measuredImpact: normalizeNumber(source.measuredImpact, base.measuredImpact ?? null),
    measurementWindow: normalizeMeasurementWindow(source.measurementWindow ?? base.measurementWindow ?? null),
    evidenceSource: normalizeNullableString(source.evidenceSource ?? base.evidenceSource ?? null)
  };
}

function normalizeMeasurementWindow(input) {
  if (!input) return null;
  if (typeof input === "string") return input.trim() || null;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return {
      type: normalizeString(input.type, "days_after_assignment"),
      days: normalizePositiveInteger(input.days, 30),
      startsAt: normalizeString(input.startsAt, "assignment"),
      endsAt: normalizeString(input.endsAt, "outcome_window_close")
    };
  }
  return null;
}

function normalizeFinanceValidation(input = {}, fallback = {}, lifecycleStatus = "draft") {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const defaultStatus = lifecycleStatus === "draft" ? "not_verified" : lifecycleStatus;
  return {
    status: normalizeFinanceValidationStatus(source.status || base.status || defaultStatus),
    verifiedBy: normalizeNullableString(source.verifiedBy ?? base.verifiedBy ?? null),
    verifiedAt: normalizeNullableString(source.verifiedAt ?? base.verifiedAt ?? null),
    notes: normalizeNullableString(source.notes ?? base.notes ?? null)
  };
}

function validateDraftLedger(ledger) {
  if (!ledger.organizationId) {
    throw domainError(400, "BUSINESS_IMPACT_ORGANIZATION_REQUIRED", "Business impact organization is required.");
  }
  if (!ledger.financialObjective) {
    throw domainError(400, "FINANCIAL_OBJECTIVE_REQUIRED", "Business impact financial objective is required.");
  }
}

function findLatestLedger(db, organizationId) {
  const ledgers = Array.isArray(db?.businessImpactLedgers) ? db.businessImpactLedgers : [];
  return ledgers
    .filter(item => item && item.organizationId === organizationId)
    .sort(sortNewest)[0] || null;
}

function fallbackLedger(context) {
  return {
    id: null,
    organizationId: requireOrganizationId(context),
    pilotContractId: null,
    persisted: false,
    financialObjective: "",
    impactModel: normalizeImpactModel({}),
    forecast: normalizeForecast({}),
    realizedImpact: normalizeRealizedImpact({}),
    roi: calculateROI({}),
    financeValidation: {
      status: "not_verified",
      verifiedBy: null,
      verifiedAt: null,
      notes: null
    },
    lifecycleStatus: "draft",
    auditEvents: [],
    audit: {
      createdAt: null,
      createdBy: null,
      updatedAt: null,
      updatedBy: null
    }
  };
}

function toPublicLedger(ledger) {
  return {
    ...normalizeBusinessImpactLedger(ledger),
    persisted: true
  };
}

function normalizeAudit(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    createdAt: normalizeNullableString(source.createdAt),
    createdBy: normalizeNullableString(source.createdBy),
    updatedAt: normalizeNullableString(source.updatedAt),
    updatedBy: normalizeNullableString(source.updatedBy)
  };
}

function normalizeAuditEvent(input = {}) {
  if (!input || typeof input !== "object") return null;
  return {
    action: normalizeString(input.action),
    from: input.from ?? null,
    to: input.to ?? null,
    userId: normalizeNullableString(input.userId),
    timestamp: normalizeNullableString(input.timestamp),
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? { ...input.metadata } : {}
  };
}

function assertInputOrganization(input, organizationId) {
  if (input.organizationId && input.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_BUSINESS_IMPACT_ACCESS", "Business impact organization does not match the authenticated organization.");
  }
}

function assertTenantAccess(ledger, organizationId) {
  if (!ledger || ledger.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_BUSINESS_IMPACT_ACCESS", "Business impact organization does not match the authenticated organization.");
  }
}

function requireOrganizationId(context = {}) {
  if (!context.organizationId) {
    throw domainError(401, "AUTH_REQUIRED", "Authenticated organization is required.");
  }
  return context.organizationId;
}

function normalizeLifecycleStatus(value) {
  const normalized = normalizeString(value, "draft");
  if (!LIFECYCLE_STATUSES.includes(normalized)) {
    throw domainError(400, "INVALID_BUSINESS_IMPACT_STATUS", "Business impact lifecycle status is invalid.");
  }
  return normalized;
}

function normalizeFinanceValidationStatus(value) {
  const normalized = normalizeString(value, "not_verified");
  if (!["not_verified", "submitted", "verified", "rejected"].includes(normalized)) {
    throw domainError(400, "INVALID_FINANCE_VALIDATION_STATUS", "Finance validation status is invalid.");
  }
  return normalized;
}

function normalizeString(value, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value, "");
  return normalized || null;
}

function normalizeNumber(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeStringArray(value, fallback = []) {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return source.map(item => normalizeString(item)).filter(Boolean);
}

function sortNewest(a, b) {
  return new Date(b.audit?.updatedAt || b.audit?.createdAt || 0) - new Date(a.audit?.updatedAt || a.audit?.createdAt || 0);
}

function roiStatus(roi) {
  if (!roi || !Number.isFinite(roi.roiPercentage)) return "not_available";
  if (roi.roiPercentage > 0) return "positive";
  if (roi.roiPercentage < 0) return "negative";
  return "neutral";
}

function timestamp(context = {}) {
  return context.now || new Date().toISOString();
}

function createId() {
  return `bil_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function domainError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  ALLOWED_TRANSITIONS,
  LIFECYCLE_STATUSES,
  appendAuditEvent,
  calculateROI,
  createBusinessImpactLedger,
  getBusinessImpactLedger,
  normalizeBusinessImpactLedger,
  summarizeBusinessImpactLedger,
  updateBusinessImpactLifecycle,
  validateFinanceVerification
};
