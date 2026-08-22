const crypto = require("crypto");

const LIFECYCLE_STATUSES = Object.freeze([
  "draft",
  "approved",
  "locked",
  "experiment_running",
  "outcome_review",
  "closed"
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  draft: "approved",
  approved: "locked",
  locked: "experiment_running",
  experiment_running: "outcome_review",
  outcome_review: "closed"
});

const LOCKED_STATUSES = new Set(["locked", "experiment_running", "outcome_review", "closed"]);

function getCurrentPilotContract(db, context) {
  const organizationId = requireOrganizationId(context);
  const contract = findCurrentContract(db, organizationId);
  if (!contract) return derivedPilotContract(context);
  assertTenantAccess(contract, organizationId);
  return toPublicContract(contract);
}

function createPilotContract(db, context, input = {}) {
  const organizationId = requireOrganizationId(context);
  if (input.organizationId && input.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_CONTRACT_ACCESS", "Pilot contract organization does not match the authenticated organization.");
  }
  db.pilotContracts = Array.isArray(db.pilotContracts) ? db.pilotContracts : [];
  const active = findActiveContract(db, organizationId);
  if (active) {
    throw domainError(409, "ACTIVE_PILOT_CONTRACT_EXISTS", "Close the active pilot contract before creating a new one.");
  }

  const now = timestamp(context);
  const contract = normalizeContract({
    ...input,
    id: input.id || createId(),
    organizationId,
    lifecycleStatus: "draft",
    approval: {
      ...(input.approval || {}),
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      approvalHistory: []
    },
    auditEvents: [],
    audit: {
      createdAt: now,
      createdBy: context.actorId || null,
      updatedAt: now,
      updatedBy: context.actorId || null
    }
  });

  validateMeasurableContract(contract);
  appendAuditEvent(contract, context, "contract_created", null, "draft", {
    source: "pilot_contract"
  });
  db.pilotContracts.push(contract);
  return toPublicContract(contract);
}

function updatePilotContract(db, context, input = {}) {
  const organizationId = requireOrganizationId(context);
  db.pilotContracts = Array.isArray(db.pilotContracts) ? db.pilotContracts : [];
  const existing = findActiveContract(db, organizationId);
  if (!existing) {
    throw domainError(404, "PILOT_CONTRACT_NOT_FOUND", "No active pilot decision contract exists.");
  }
  assertTenantAccess(existing, organizationId);
  if (input.organizationId && input.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_CONTRACT_ACCESS", "Pilot contract organization does not match the authenticated organization.");
  }
  if (input.id && input.id !== existing.id) {
    throw domainError(404, "PILOT_CONTRACT_NOT_FOUND", "No pilot decision contract matched this organization.");
  }

  const lifecycleTarget = resolveLifecycleTarget(existing, input);
  if (lifecycleTarget && lifecycleTarget !== existing.lifecycleStatus) {
    assertAllowedTransition(existing.lifecycleStatus, lifecycleTarget);
  }

  const next = normalizeContract({
    ...existing,
    ...pickMutableFields(existing, input),
    primaryKpi: input.primaryKpi ? normalizePrimaryKpi(input.primaryKpi, existing.primaryKpi) : existing.primaryKpi,
    guardrails: input.guardrails ? normalizeGuardrails(input.guardrails, existing.guardrails) : existing.guardrails,
    ownership: input.ownership ? normalizeOwnership(input.ownership, existing.ownership) : existing.ownership,
    lifecycleStatus: lifecycleTarget || existing.lifecycleStatus,
    approval: normalizeApproval(existing.approval, input.approval),
    auditEvents: Array.isArray(existing.auditEvents) ? [...existing.auditEvents] : [],
    audit: {
      ...(existing.audit || {}),
      updatedAt: timestamp(context),
      updatedBy: context.actorId || null
    }
  });

  assertLockedFieldsUnchanged(existing, next, input);
  validateMeasurableContract(next);

  if (next.lifecycleStatus !== existing.lifecycleStatus) {
    applyLifecycleTransition(next, context, existing.lifecycleStatus, next.lifecycleStatus, input.metadata || input.transitionMetadata || {});
  }

  Object.assign(existing, next);
  return toPublicContract(existing);
}

function summarizePilotContract(contract) {
  const publicContract = contract && contract.businessObjective ? contract : null;
  if (!publicContract) return null;
  return {
    id: publicContract.id,
    organizationId: publicContract.organizationId,
    persisted: publicContract.persisted === true,
    businessObjective: publicContract.businessObjective,
    primaryKpi: publicContract.primaryKpi,
    approvalStatus: publicContract.approval?.status || "draft",
    lifecycleStatus: publicContract.lifecycleStatus || "draft",
    decisionDeadline: publicContract.decisionDeadline || null
  };
}

function resolveLifecycleTarget(existing, input) {
  const direct = input.lifecycleStatus;
  const approvalStatus = input.approval && input.approval.status;
  if (direct && approvalStatus && direct !== approvalStatus && ["approved", "locked"].includes(approvalStatus)) {
    throw domainError(409, "CONTRACT_STATE_MISMATCH", "Approval status and lifecycle target must describe the same transition.");
  }
  if (direct) return normalizeLifecycleStatus(direct);
  if (approvalStatus === "approved" || approvalStatus === "locked") return approvalStatus;
  return null;
}

function applyLifecycleTransition(contract, context, from, to, metadata) {
  const now = timestamp(context);
  appendAuditEvent(contract, context, "lifecycle_transition", from, to, metadata);
  if (to === "approved") {
    contract.approval.status = "approved";
    contract.approval.approvedBy = context.actorId || null;
    contract.approval.approvedAt = now;
    appendApprovalHistory(contract, context, "approval_status_changed", fromApprovalStatus(from), "approved", metadata);
  } else if (to === "locked") {
    contract.approval.status = "locked";
    appendApprovalHistory(contract, context, "approval_status_changed", "approved", "locked", metadata);
  }
}

function pickMutableFields(existing, input) {
  const picked = {};
  if (Object.prototype.hasOwnProperty.call(input, "businessObjective")) {
    picked.businessObjective = normalizeString(input.businessObjective, existing.businessObjective);
  }
  if (Object.prototype.hasOwnProperty.call(input, "decisionDeadline")) {
    picked.decisionDeadline = normalizeNullableString(input.decisionDeadline);
  }
  return picked;
}

function normalizeContract(input) {
  return {
    id: normalizeString(input.id),
    organizationId: normalizeString(input.organizationId),
    businessObjective: normalizeString(input.businessObjective),
    primaryKpi: normalizePrimaryKpi(input.primaryKpi),
    guardrails: normalizeGuardrails(input.guardrails),
    ownership: normalizeOwnership(input.ownership),
    approval: normalizeApproval(input.approval),
    lifecycleStatus: normalizeLifecycleStatus(input.lifecycleStatus || "draft"),
    decisionDeadline: normalizeNullableString(input.decisionDeadline),
    audit: normalizeAudit(input.audit),
    auditEvents: Array.isArray(input.auditEvents) ? input.auditEvents.map(normalizeAuditEvent).filter(Boolean) : []
  };
}

function normalizePrimaryKpi(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    key: normalizeString(source.key, base.key || "incremental_profit_per_customer"),
    label: normalizeString(source.label, base.label || "Incremental profit per assigned customer"),
    baselineValue: normalizeNumber(source.baselineValue, base.baselineValue ?? null),
    targetValue: normalizeNumber(source.targetValue, base.targetValue ?? null),
    unit: normalizeString(source.unit, base.unit || "toman"),
    direction: normalizeDirection(source.direction || base.direction || "increase"),
    measurementMethod: normalizeString(source.measurementMethod, base.measurementMethod || "intention_to_treat"),
    dataSource: normalizeString(source.dataSource, base.dataSource || "outcome_csv"),
    measurementWindow: normalizeMeasurementWindow(source.measurementWindow || base.measurementWindow)
  };
}

function normalizeMeasurementWindow(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return {
      type: normalizeString(input.type, "days_after_exposure"),
      days: normalizePositiveInteger(input.days, 30),
      startsAt: normalizeString(input.startsAt, "assignment"),
      endsAt: normalizeString(input.endsAt, "outcome_window_close")
    };
  }
  return {
    type: "days_after_exposure",
    days: 30,
    startsAt: "assignment",
    endsAt: "outcome_window_close"
  };
}

function normalizeGuardrails(input, fallback = []) {
  const source = Array.isArray(input) ? input : fallback;
  return source
    .filter(item => item && typeof item === "object")
    .map(item => ({
      metric: normalizeString(item.metric),
      threshold: normalizeString(item.threshold),
      status: normalizeString(item.status, "draft")
    }))
    .filter(item => item.metric && item.threshold);
}

function normalizeOwnership(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    sponsor: normalizeString(source.sponsor, base.sponsor || ""),
    businessOwner: normalizeString(source.businessOwner, base.businessOwner || ""),
    dataOwner: normalizeString(source.dataOwner, base.dataOwner || ""),
    financeOwner: normalizeString(source.financeOwner, base.financeOwner || ""),
    marginliftOwner: normalizeString(source.marginliftOwner, base.marginliftOwner || "")
  };
}

function normalizeApproval(input = {}, patch = {}) {
  const source = input && typeof input === "object" ? input : {};
  const update = patch && typeof patch === "object" ? patch : {};
  const status = normalizeApprovalStatus(update.status || source.status || "draft");
  return {
    status,
    approvedBy: normalizeNullableString(update.approvedBy ?? source.approvedBy ?? null),
    approvedAt: normalizeNullableString(update.approvedAt ?? source.approvedAt ?? null),
    approvalHistory: Array.isArray(source.approvalHistory)
      ? source.approvalHistory.map(normalizeAuditEvent).filter(Boolean)
      : []
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

function validateMeasurableContract(contract) {
  if (!contract.organizationId) throw domainError(400, "CONTRACT_ORGANIZATION_REQUIRED", "Pilot contract organization is required.");
  if (!contract.businessObjective) throw domainError(400, "BUSINESS_OBJECTIVE_REQUIRED", "Pilot contract business objective is required.");
  if (!Number.isFinite(contract.primaryKpi.baselineValue)) {
    throw domainError(400, "KPI_BASELINE_REQUIRED", "Pilot contract KPI baselineValue must be a number.");
  }
  if (!Number.isFinite(contract.primaryKpi.targetValue)) {
    throw domainError(400, "KPI_TARGET_REQUIRED", "Pilot contract KPI targetValue must be a number.");
  }
}

function assertAllowedTransition(from, to) {
  if (!LIFECYCLE_STATUSES.includes(to) || ALLOWED_TRANSITIONS[from] !== to) {
    throw domainError(409, "INVALID_LIFECYCLE_TRANSITION", `Invalid pilot contract lifecycle transition from ${from} to ${to}.`);
  }
}

function assertLockedFieldsUnchanged(existing, next, input) {
  if (!LOCKED_STATUSES.has(existing.lifecycleStatus)) return;
  if (Object.prototype.hasOwnProperty.call(input, "businessObjective") && existing.businessObjective !== next.businessObjective) {
    throw domainError(409, "PILOT_CONTRACT_LOCKED", "Locked pilot contracts cannot change business objective.");
  }
  if (Object.prototype.hasOwnProperty.call(input, "primaryKpi") && JSON.stringify(existing.primaryKpi) !== JSON.stringify(next.primaryKpi)) {
    throw domainError(409, "PILOT_CONTRACT_LOCKED", "Locked pilot contracts cannot change KPI.");
  }
  if (Object.prototype.hasOwnProperty.call(input, "guardrails") && JSON.stringify(existing.guardrails) !== JSON.stringify(next.guardrails)) {
    throw domainError(409, "PILOT_CONTRACT_LOCKED", "Locked pilot contracts cannot change guardrails.");
  }
}

function appendAuditEvent(contract, context, action, from, to, metadata = {}) {
  const event = {
    action,
    from,
    to,
    userId: context.actorId || null,
    timestamp: timestamp(context),
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {}
  };
  contract.auditEvents = Array.isArray(contract.auditEvents) ? contract.auditEvents : [];
  contract.auditEvents.push(event);
  return event;
}

function appendApprovalHistory(contract, context, action, from, to, metadata = {}) {
  const event = {
    action,
    from,
    to,
    userId: context.actorId || null,
    timestamp: timestamp(context),
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {}
  };
  contract.approval.approvalHistory = Array.isArray(contract.approval.approvalHistory) ? contract.approval.approvalHistory : [];
  contract.approval.approvalHistory.push(event);
  return event;
}

function findCurrentContract(db, organizationId) {
  const contracts = Array.isArray(db?.pilotContracts) ? db.pilotContracts : [];
  return contracts
    .filter(item => item && item.organizationId === organizationId)
    .sort(sortNewest)[0] || null;
}

function findActiveContract(db, organizationId) {
  const contracts = Array.isArray(db?.pilotContracts) ? db.pilotContracts : [];
  return contracts
    .filter(item => item && item.organizationId === organizationId && item.lifecycleStatus !== "closed")
    .sort(sortNewest)[0] || null;
}

function sortNewest(a, b) {
  return new Date(b.audit?.updatedAt || b.audit?.createdAt || 0) - new Date(a.audit?.updatedAt || a.audit?.createdAt || 0);
}

function derivedPilotContract(context) {
  const organizationId = requireOrganizationId(context);
  return {
    id: null,
    organizationId,
    persisted: false,
    businessObjective: "Define a measurable enterprise pilot decision before launch.",
    primaryKpi: normalizePrimaryKpi({}),
    guardrails: [],
    ownership: normalizeOwnership({}),
    approval: {
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      approvalHistory: []
    },
    lifecycleStatus: "draft",
    decisionDeadline: null,
    audit: {
      createdAt: null,
      createdBy: null,
      updatedAt: null,
      updatedBy: null
    },
    auditEvents: []
  };
}

function toPublicContract(contract) {
  return {
    ...normalizeContract(contract),
    persisted: true
  };
}

function assertTenantAccess(contract, organizationId) {
  if (!contract || contract.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_CONTRACT_ACCESS", "Pilot contract organization does not match the authenticated organization.");
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
    throw domainError(400, "INVALID_LIFECYCLE_STATUS", "Pilot contract lifecycle status is invalid.");
  }
  return normalized;
}

function normalizeApprovalStatus(value) {
  const normalized = normalizeString(value, "draft");
  if (!["draft", "approved", "locked"].includes(normalized)) {
    throw domainError(400, "INVALID_APPROVAL_STATUS", "Pilot contract approval status is invalid.");
  }
  return normalized;
}

function normalizeDirection(value) {
  const normalized = normalizeString(value, "increase");
  if (!["increase", "decrease", "maintain"].includes(normalized)) {
    throw domainError(400, "INVALID_KPI_DIRECTION", "Pilot contract KPI direction is invalid.");
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

function fromApprovalStatus(lifecycleStatus) {
  return lifecycleStatus === "draft" ? "draft" : "approved";
}

function timestamp(context = {}) {
  return context.now || new Date().toISOString();
}

function createId() {
  return `pdc_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
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
  createPilotContract,
  getCurrentPilotContract,
  summarizePilotContract,
  updatePilotContract
};
