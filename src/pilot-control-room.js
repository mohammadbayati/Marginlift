const crypto = require("crypto");

const LIFECYCLE_STATUSES = Object.freeze([
  "draft",
  "kickoff",
  "data_ready",
  "experiment_running",
  "outcome_pending",
  "decision_ready",
  "closed"
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  draft: "kickoff",
  kickoff: "data_ready",
  data_ready: "experiment_running",
  experiment_running: "outcome_pending",
  outcome_pending: "decision_ready",
  decision_ready: "closed"
});

function normalizePilotWorkflow(input = {}, readinessContext = {}) {
  const source = input && typeof input === "object" ? input : {};
  const lifecycleStatus = normalizeLifecycleStatus(source.lifecycleStatus || "draft");
  const stages = normalizeStages(source.stages, lifecycleStatus);
  return {
    id: normalizeString(source.id),
    organizationId: normalizeString(source.organizationId),
    pilotContractId: normalizeNullableString(source.pilotContractId),
    businessImpactLedgerId: normalizeNullableString(source.businessImpactLedgerId),
    lifecycleStatus,
    stages,
    blockers: normalizeBlockers(source.blockers),
    milestones: normalizeMilestones(source.milestones),
    executiveReadiness: calculateExecutiveReadiness(readinessContext, lifecycleStatus),
    auditEvents: Array.isArray(source.auditEvents) ? source.auditEvents.map(normalizeAuditEvent).filter(Boolean) : [],
    audit: normalizeAudit(source.audit)
  };
}

function createPilotWorkflow(db, context, input = {}, readinessContext = {}) {
  const organizationId = requireOrganizationId(context);
  assertInputOrganization(input, organizationId);
  db.pilotWorkflows = Array.isArray(db.pilotWorkflows) ? db.pilotWorkflows : [];

  const now = timestamp(context);
  const workflow = normalizePilotWorkflow({
    ...input,
    id: input.id || createId(),
    organizationId,
    lifecycleStatus: "draft",
    stages: input.stages || defaultStages(),
    auditEvents: [],
    audit: {
      createdAt: now,
      createdBy: context.actorId || null,
      updatedAt: now,
      updatedBy: context.actorId || null
    }
  }, readinessContext);

  appendAuditEvent(workflow, context, "pilot_workflow_created", null, "draft", {
    source: "pilot_control_room"
  });
  db.pilotWorkflows.push(workflow);
  return toPublicWorkflow(workflow, readinessContext);
}

function getPilotWorkflow(db, context, readinessContext = {}) {
  const organizationId = requireOrganizationId(context);
  const workflow = findLatestWorkflow(db, organizationId);
  if (!workflow) return fallbackWorkflow(context, readinessContext);
  assertTenantAccess(workflow, organizationId);
  return toPublicWorkflow(workflow, readinessContext);
}

function transitionPilotStage(db, context, input = {}, readinessContext = {}) {
  const workflow = requireLatestWorkflow(db, context);
  const target = normalizeLifecycleStatus(input.lifecycleStatus || input.stageKey || input.to);
  assertAllowedTransition(workflow.lifecycleStatus, target);

  const next = normalizePilotWorkflow({
    ...workflow,
    lifecycleStatus: target,
    stages: transitionStages(workflow.stages, workflow.lifecycleStatus, target),
    auditEvents: [...workflow.auditEvents],
    audit: updateAudit(workflow.audit, context)
  }, readinessContext);
  appendAuditEvent(next, context, "pilot_stage_transition", workflow.lifecycleStatus, target, input.metadata || {});
  Object.assign(workflow, next);
  return toPublicWorkflow(workflow, readinessContext);
}

function appendEvidence(db, context, input = {}, readinessContext = {}) {
  const workflow = requireLatestWorkflow(db, context);
  const stageKey = normalizeLifecycleStatus(input.stageKey || input.lifecycleStatus || workflow.lifecycleStatus);
  const stage = workflow.stages.find(item => item.key === stageKey);
  if (!stage) throw domainError(404, "PILOT_STAGE_NOT_FOUND", "Pilot workflow stage was not found.");
  const evidence = normalizeEvidence(input.evidence || input);
  if (!evidence.label && !evidence.url && !evidence.referenceId) {
    throw domainError(400, "PILOT_EVIDENCE_REQUIRED", "Pilot workflow evidence must include a label, URL, or reference id.");
  }

  const nextStages = workflow.stages.map(item => {
    if (item.key !== stageKey) return item;
    return {
      ...item,
      evidence: [...(Array.isArray(item.evidence) ? item.evidence : []), evidence]
    };
  });
  const next = normalizePilotWorkflow({
    ...workflow,
    stages: nextStages,
    auditEvents: [...workflow.auditEvents],
    audit: updateAudit(workflow.audit, context)
  }, readinessContext);
  appendAuditEvent(next, context, "pilot_evidence_appended", stageKey, stageKey, {
    evidenceId: evidence.id,
    ...(input.metadata || {})
  });
  Object.assign(workflow, next);
  return toPublicWorkflow(workflow, readinessContext);
}

function addBlocker(db, context, input = {}, readinessContext = {}) {
  const workflow = requireLatestWorkflow(db, context);
  const blocker = normalizeBlocker({ ...(input.blocker || input), id: input.blocker?.id || input.id || createId("blk") });
  if (!blocker.description) throw domainError(400, "PILOT_BLOCKER_DESCRIPTION_REQUIRED", "Pilot workflow blocker description is required.");
  const next = normalizePilotWorkflow({
    ...workflow,
    blockers: [...workflow.blockers, blocker],
    auditEvents: [...workflow.auditEvents],
    audit: updateAudit(workflow.audit, context)
  }, readinessContext);
  appendAuditEvent(next, context, "pilot_blocker_added", null, blocker.id, input.metadata || {});
  Object.assign(workflow, next);
  return toPublicWorkflow(workflow, readinessContext);
}

function updateBlocker(db, context, input = {}, readinessContext = {}) {
  const workflow = requireLatestWorkflow(db, context);
  const blockerId = normalizeString(input.blockerId || input.id || input.blocker?.id);
  if (!blockerId) throw domainError(400, "PILOT_BLOCKER_ID_REQUIRED", "Pilot workflow blocker id is required.");
  const existing = workflow.blockers.find(item => item.id === blockerId);
  if (!existing) throw domainError(404, "PILOT_BLOCKER_NOT_FOUND", "Pilot workflow blocker was not found.");
  const updates = input.blocker || input.updates || input;
  const nextBlocker = normalizeBlocker({
    ...existing,
    description: Object.prototype.hasOwnProperty.call(updates, "description") ? updates.description : existing.description,
    ownerId: Object.prototype.hasOwnProperty.call(updates, "ownerId") ? updates.ownerId : existing.ownerId,
    severity: Object.prototype.hasOwnProperty.call(updates, "severity") ? updates.severity : existing.severity,
    status: Object.prototype.hasOwnProperty.call(updates, "status") ? updates.status : existing.status
  });
  const next = normalizePilotWorkflow({
    ...workflow,
    blockers: workflow.blockers.map(item => item.id === blockerId ? nextBlocker : item),
    auditEvents: [...workflow.auditEvents],
    audit: updateAudit(workflow.audit, context)
  }, readinessContext);
  appendAuditEvent(next, context, "pilot_blocker_updated", existing.status, nextBlocker.status, {
    blockerId,
    ...(input.metadata || {})
  });
  Object.assign(workflow, next);
  return toPublicWorkflow(workflow, readinessContext);
}

function updateMilestone(db, context, input = {}, readinessContext = {}) {
  const workflow = requireLatestWorkflow(db, context);
  const name = normalizeString(input.name || input.milestone?.name);
  if (!name) throw domainError(400, "PILOT_MILESTONE_NAME_REQUIRED", "Pilot workflow milestone name is required.");
  const updates = input.milestone || input.updates || input;
  const existing = workflow.milestones.find(item => item.name === name);
  const milestone = normalizeMilestone({
    ...(existing || {}),
    name,
    targetDate: Object.prototype.hasOwnProperty.call(updates, "targetDate") ? updates.targetDate : existing?.targetDate,
    status: Object.prototype.hasOwnProperty.call(updates, "status") ? updates.status : existing?.status
  });
  const milestones = existing
    ? workflow.milestones.map(item => item.name === name ? milestone : item)
    : [...workflow.milestones, milestone];
  const next = normalizePilotWorkflow({
    ...workflow,
    milestones,
    auditEvents: [...workflow.auditEvents],
    audit: updateAudit(workflow.audit, context)
  }, readinessContext);
  appendAuditEvent(next, context, "pilot_milestone_updated", existing?.status || null, milestone.status, {
    milestone: name,
    ...(input.metadata || {})
  });
  Object.assign(workflow, next);
  return toPublicWorkflow(workflow, readinessContext);
}

function calculateExecutiveReadiness(readinessContext = {}, lifecycleStatus = "draft") {
  const decisionContract = readinessContext.decisionContract || null;
  const businessImpact = readinessContext.businessImpact || null;
  const readiness = readinessContext.readiness || null;
  const experiment = readinessContext.experiment || null;
  const decisionContractReady = Boolean(
    decisionContract?.persisted === true &&
    ["approved", "locked", "experiment_running", "outcome_review", "closed"].includes(decisionContract.lifecycleStatus)
  );
  const dataReady = Boolean(
    readiness?.status === "ready" ||
    readiness?.dataReady === true ||
    readinessContext.dataReady === true
  );
  const experimentReady = Boolean(
    experiment?.id &&
    (experiment?.design?.randomizationEvidence?.verified === true || ["experiment_running", "outcome_pending", "decision_ready", "closed"].includes(lifecycleStatus))
  );
  const financialProofReady = Boolean(
    businessImpact?.persisted === true &&
    businessImpact?.financeValidation?.status === "verified"
  );
  const score = [decisionContractReady, dataReady, experimentReady, financialProofReady]
    .filter(Boolean).length;
  return {
    decisionContractReady,
    dataReady,
    experimentReady,
    financialProofReady,
    overallStatus: score === 4 ? "ready" : score >= 2 ? "partial" : "blocked"
  };
}

function appendAuditEvent(workflow, context, action, from, to, metadata = {}) {
  const event = {
    action,
    from,
    to,
    userId: context.actorId || null,
    timestamp: timestamp(context),
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {}
  };
  workflow.auditEvents = Array.isArray(workflow.auditEvents) ? workflow.auditEvents : [];
  workflow.auditEvents.push(event);
  return event;
}

function summarizePilotWorkflow(workflow) {
  if (!workflow || workflow.persisted !== true) {
    return {
      persisted: false,
      lifecycleStatus: "draft",
      currentStage: null,
      blockersCount: 0,
      readinessScore: 0,
      decisionReady: false
    };
  }
  const readinessScore = readinessScoreFrom(workflow.executiveReadiness);
  const openBlockers = workflow.blockers.filter(item => item.status !== "resolved" && item.status !== "closed");
  return {
    persisted: true,
    id: workflow.id,
    lifecycleStatus: workflow.lifecycleStatus,
    currentStage: currentStage(workflow)?.key || workflow.lifecycleStatus,
    blockersCount: openBlockers.length,
    readinessScore,
    decisionReady: workflow.lifecycleStatus === "decision_ready" || workflow.executiveReadiness.overallStatus === "ready"
  };
}

function dispatchPilotWorkflowAction(db, context, input = {}, readinessContext = {}) {
  const action = normalizeString(input.action);
  if (action === "transition_stage") return transitionPilotStage(db, context, input, readinessContext);
  if (action === "append_evidence") return appendEvidence(db, context, input, readinessContext);
  if (action === "add_blocker") return addBlocker(db, context, input, readinessContext);
  if (action === "update_blocker") return updateBlocker(db, context, input, readinessContext);
  if (action === "update_milestone") return updateMilestone(db, context, input, readinessContext);
  if (action === "close") return transitionPilotStage(db, context, { ...input, lifecycleStatus: "closed" }, readinessContext);
  throw domainError(400, "UNSUPPORTED_PILOT_WORKFLOW_ACTION", "Pilot workflow action is not supported.");
}

function requireLatestWorkflow(db, context) {
  const organizationId = requireOrganizationId(context);
  db.pilotWorkflows = Array.isArray(db.pilotWorkflows) ? db.pilotWorkflows : [];
  const workflow = findLatestWorkflow(db, organizationId);
  if (!workflow) throw domainError(404, "PILOT_WORKFLOW_NOT_FOUND", "No pilot workflow exists for this organization.");
  assertTenantAccess(workflow, organizationId);
  return workflow;
}

function transitionStages(stages, from, to) {
  return normalizeStages(stages, to).map(stage => {
    if (stage.key === from) {
      return {
        ...stage,
        status: "completed",
        completedAt: stage.completedAt || new Date().toISOString()
      };
    }
    if (stage.key === to) {
      return {
        ...stage,
        status: to === "closed" ? "completed" : "active",
        completedAt: to === "closed" ? stage.completedAt || new Date().toISOString() : stage.completedAt
      };
    }
    return stage;
  });
}

function defaultStages() {
  return LIFECYCLE_STATUSES.map((key, index) => ({
    key,
    name: titleFromKey(key),
    status: index === 0 ? "active" : "pending",
    ownerId: null,
    dueDate: null,
    completedAt: null,
    evidence: []
  }));
}

function normalizeStages(input, lifecycleStatus) {
  const supplied = Array.isArray(input) ? input : [];
  const byKey = new Map(supplied.map(stage => [stage?.key, stage]).filter(([key]) => LIFECYCLE_STATUSES.includes(key)));
  return defaultStages().map(stage => normalizeStage({
    ...stage,
    ...(byKey.get(stage.key) || {}),
    status: stageStatusFor(stage.key, lifecycleStatus, byKey.get(stage.key)?.status),
    evidence: byKey.get(stage.key)?.evidence || stage.evidence
  }));
}

function normalizeStage(input = {}) {
  return {
    key: normalizeLifecycleStatus(input.key),
    name: normalizeString(input.name, titleFromKey(input.key)),
    status: normalizeStageStatus(input.status),
    ownerId: normalizeNullableString(input.ownerId),
    dueDate: normalizeNullableString(input.dueDate),
    completedAt: normalizeNullableString(input.completedAt),
    evidence: Array.isArray(input.evidence) ? input.evidence.map(normalizeEvidence).filter(Boolean) : []
  };
}

function stageStatusFor(key, lifecycleStatus, existingStatus) {
  const stageIndex = LIFECYCLE_STATUSES.indexOf(key);
  const lifecycleIndex = LIFECYCLE_STATUSES.indexOf(lifecycleStatus);
  if (lifecycleStatus === "closed") return "completed";
  if (stageIndex < lifecycleIndex) return "completed";
  if (stageIndex === lifecycleIndex) return existingStatus === "completed" ? "completed" : "active";
  return "pending";
}

function normalizeEvidence(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: normalizeString(source.id, createId("evd")),
    label: normalizeString(source.label),
    url: normalizeNullableString(source.url),
    referenceId: normalizeNullableString(source.referenceId),
    evidenceType: normalizeString(source.evidenceType, "artifact"),
    createdAt: normalizeNullableString(source.createdAt) || new Date().toISOString(),
    createdBy: normalizeNullableString(source.createdBy)
  };
}

function normalizeBlockers(input) {
  return Array.isArray(input) ? input.map(normalizeBlocker).filter(item => item.description) : [];
}

function normalizeBlocker(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: normalizeString(source.id, createId("blk")),
    description: normalizeString(source.description),
    ownerId: normalizeNullableString(source.ownerId),
    severity: normalizeSeverity(source.severity),
    status: normalizeBlockerStatus(source.status)
  };
}

function normalizeMilestones(input) {
  return Array.isArray(input) ? input.map(normalizeMilestone).filter(item => item.name) : [];
}

function normalizeMilestone(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    name: normalizeString(source.name),
    targetDate: normalizeNullableString(source.targetDate),
    status: normalizeMilestoneStatus(source.status)
  };
}

function fallbackWorkflow(context, readinessContext) {
  return {
    id: null,
    organizationId: requireOrganizationId(context),
    pilotContractId: null,
    businessImpactLedgerId: null,
    persisted: false,
    lifecycleStatus: "draft",
    stages: defaultStages(),
    blockers: [],
    milestones: [],
    executiveReadiness: calculateExecutiveReadiness(readinessContext, "draft"),
    auditEvents: [],
    audit: {
      createdAt: null,
      createdBy: null,
      updatedAt: null,
      updatedBy: null
    }
  };
}

function toPublicWorkflow(workflow, readinessContext = {}) {
  return {
    ...normalizePilotWorkflow(workflow, readinessContext),
    persisted: true
  };
}

function findLatestWorkflow(db, organizationId) {
  const workflows = Array.isArray(db?.pilotWorkflows) ? db.pilotWorkflows : [];
  return workflows
    .filter(item => item && item.organizationId === organizationId)
    .sort(sortNewest)[0] || null;
}

function assertAllowedTransition(from, to) {
  if (ALLOWED_TRANSITIONS[from] !== to) {
    throw domainError(409, "INVALID_PILOT_WORKFLOW_TRANSITION", `Invalid pilot workflow transition from ${from} to ${to}.`);
  }
}

function assertInputOrganization(input, organizationId) {
  if (input.organizationId && input.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_PILOT_WORKFLOW_ACCESS", "Pilot workflow organization does not match the authenticated organization.");
  }
}

function assertTenantAccess(workflow, organizationId) {
  if (!workflow || workflow.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_PILOT_WORKFLOW_ACCESS", "Pilot workflow organization does not match the authenticated organization.");
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
    throw domainError(400, "INVALID_PILOT_WORKFLOW_STATUS", "Pilot workflow lifecycle status is invalid.");
  }
  return normalized;
}

function normalizeStageStatus(value) {
  const normalized = normalizeString(value, "pending");
  if (!["pending", "active", "completed", "blocked"].includes(normalized)) return "pending";
  return normalized;
}

function normalizeSeverity(value) {
  const normalized = normalizeString(value, "medium");
  if (!["low", "medium", "high", "critical"].includes(normalized)) return "medium";
  return normalized;
}

function normalizeBlockerStatus(value) {
  const normalized = normalizeString(value, "open");
  if (!["open", "in_progress", "resolved", "closed"].includes(normalized)) return "open";
  return normalized;
}

function normalizeMilestoneStatus(value) {
  const normalized = normalizeString(value, "pending");
  if (!["pending", "complete", "missed"].includes(normalized)) return "pending";
  return normalized;
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

function updateAudit(input = {}, context = {}) {
  const audit = normalizeAudit(input);
  return {
    ...audit,
    updatedAt: timestamp(context),
    updatedBy: context.actorId || null
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

function currentStage(workflow) {
  return workflow.stages.find(item => item.key === workflow.lifecycleStatus) || workflow.stages.find(item => item.status === "active") || null;
}

function readinessScoreFrom(readiness) {
  if (!readiness) return 0;
  return ["decisionContractReady", "dataReady", "experimentReady", "financialProofReady"]
    .filter(key => readiness[key] === true).length;
}

function sortNewest(a, b) {
  return new Date(b.audit?.updatedAt || b.audit?.createdAt || 0) - new Date(a.audit?.updatedAt || a.audit?.createdAt || 0);
}

function titleFromKey(key) {
  return normalizeString(key).split("_").map(part => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
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

function timestamp(context = {}) {
  return context.now || new Date().toISOString();
}

function createId(prefix = "pwf") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
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
  addBlocker,
  appendAuditEvent,
  appendEvidence,
  calculateExecutiveReadiness,
  createPilotWorkflow,
  dispatchPilotWorkflowAction,
  getPilotWorkflow,
  normalizePilotWorkflow,
  summarizePilotWorkflow,
  transitionPilotStage,
  updateBlocker,
  updateMilestone
};
