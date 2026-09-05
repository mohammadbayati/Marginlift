const crypto = require("crypto");

const LIFECYCLE_STATUSES = Object.freeze([
  "draft",
  "evidence_review",
  "customer_review",
  "executive_review",
  "accepted",
  "rejected"
]);

const TERMINAL_STATUSES = new Set(["accepted", "rejected"]);

function normalizeAcceptanceRecord(input = {}, sourceContext = {}) {
  const source = input && typeof input === "object" ? input : {};
  const lifecycleStatus = normalizeLifecycleStatus(source.lifecycleStatus || "draft");
  const criteria = normalizeCriteria(source.acceptanceCriteria, sourceContext);
  const evidencePackage = normalizeEvidencePackage(source.evidencePackage);
  return {
    id: normalizeString(source.id),
    organizationId: normalizeString(source.organizationId),
    pilotContractId: normalizeNullableString(source.pilotContractId ?? sourceContext.decisionContract?.id ?? null),
    businessImpactLedgerId: normalizeNullableString(source.businessImpactLedgerId ?? sourceContext.businessImpact?.id ?? null),
    pilotWorkflowId: normalizeNullableString(source.pilotWorkflowId ?? sourceContext.pilotControl?.id ?? null),
    experimentId: normalizeNullableString(source.experimentId ?? sourceContext.experiment?.id ?? null),
    outcomeId: normalizeNullableString(source.outcomeId ?? sourceContext.outcome?.id ?? null),
    lifecycleStatus,
    acceptanceCriteria: criteria,
    customerAcceptance: normalizeCustomerAcceptance(source.customerAcceptance),
    executiveApproval: normalizeExecutiveApproval(source.executiveApproval),
    certification: normalizeCertification(source.certification, criteria, sourceContext, lifecycleStatus, evidencePackage),
    evidencePackage,
    auditEvents: Array.isArray(source.auditEvents) ? source.auditEvents.map(normalizeAuditEvent).filter(Boolean) : [],
    audit: normalizeAudit(source.audit)
  };
}

function createPilotAcceptance(db, context, input = {}, sourceContext = {}) {
  const organizationId = requireOrganizationId(context);
  assertInputOrganization(input, organizationId);
  db.pilotAcceptances = Array.isArray(db.pilotAcceptances) ? db.pilotAcceptances : [];
  const active = findActiveAcceptance(db, organizationId);
  if (active) {
    throw domainError(409, "ACTIVE_ACCEPTANCE_EXISTS", "Close the active pilot acceptance record before creating a new one.");
  }

  const now = timestamp(context);
  const record = normalizeAcceptanceRecord({
    ...input,
    id: input.id || createId(),
    organizationId,
    lifecycleStatus: "draft",
    auditEvents: [],
    audit: {
      createdAt: now,
      createdBy: context.actorId || null,
      updatedAt: now,
      updatedBy: context.actorId || null
    }
  }, sourceContext);

  appendAuditEvent(record, context, "acceptance_created", null, "draft", { source: "production_acceptance" });
  db.pilotAcceptances.push(record);
  return toPublicAcceptance(record, sourceContext);
}

function getPilotAcceptance(db, context, sourceContext = {}) {
  const organizationId = requireOrganizationId(context);
  const record = findLatestAcceptance(db, organizationId);
  if (!record) return fallbackAcceptance(context, sourceContext);
  assertTenantAccess(record, organizationId);
  return toPublicAcceptance(record, sourceContext);
}

function dispatchAcceptanceAction(db, context, input = {}, sourceContext = {}) {
  const action = normalizeString(input.action);
  const record = requireLatestAcceptance(db, context);
  if (TERMINAL_STATUSES.has(record.lifecycleStatus) && action !== "generate_package") {
    throw domainError(409, "ACCEPTANCE_CLOSED", "Terminal acceptance records cannot be modified.");
  }
  if (action === "submit_evidence") return submitEvidence(record, context, input, sourceContext);
  if (action === "verify_criterion") return verifyCriterion(record, context, input, sourceContext);
  if (action === "waive_criterion") return waiveCriterion(record, context, input, sourceContext);
  if (action === "request_customer_acceptance") return requestCustomerAcceptance(record, context, input, sourceContext);
  if (action === "record_customer_acceptance") return recordCustomerAcceptance(record, context, input, sourceContext);
  if (action === "request_executive_approval") return requestExecutiveApproval(record, context, input, sourceContext);
  if (action === "record_executive_approval") return recordExecutiveApproval(record, context, input, sourceContext);
  if (action === "generate_package") return generatePackage(record, context, input, sourceContext);
  if (action === "certify") return certifyAcceptance(record, context, input, sourceContext);
  if (action === "reject") return rejectAcceptance(record, context, input, sourceContext);
  throw domainError(400, "UNSUPPORTED_ACCEPTANCE_ACTION", "Pilot acceptance action is not supported.");
}

function submitEvidence(record, context, input, sourceContext) {
  assertLifecycle(record, ["draft", "evidence_review"], "INVALID_ACCEPTANCE_EVIDENCE_STAGE");
  const criteriaKey = normalizeString(input.criteriaKey || input.key);
  const criterion = requireCriterion(record, criteriaKey);
  const evidence = normalizeEvidence(input.evidence || input);
  if (!evidence.label && !evidence.url && !evidence.referenceId) {
    throw domainError(400, "ACCEPTANCE_EVIDENCE_REQUIRED", "Acceptance evidence must include a label, URL, or reference id.");
  }
  const nextCriterion = {
    ...criterion,
    status: criterion.status === "verified" || criterion.status === "waived" ? criterion.status : "submitted",
    evidenceRefs: [...criterion.evidenceRefs, evidence]
  };
  const next = cloneWithUpdates(record, context, sourceContext, {
    lifecycleStatus: "evidence_review",
    acceptanceCriteria: replaceCriterion(record.acceptanceCriteria, nextCriterion)
  });
  appendAuditEvent(next, context, "acceptance_evidence_submitted", criterion.key, criterion.key, {
    evidenceId: evidence.id,
    ...(input.metadata || {})
  });
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function verifyCriterion(record, context, input, sourceContext) {
  assertLifecycle(record, ["evidence_review"], "INVALID_ACCEPTANCE_VERIFICATION_STAGE");
  const criterion = requireCriterion(record, input.criteriaKey || input.key);
  if (!criterion.evidenceRefs.length) {
    throw domainError(400, "ACCEPTANCE_CRITERION_EVIDENCE_MISSING", "Acceptance criterion requires evidence before verification.");
  }
  const nextCriterion = {
    ...criterion,
    status: "verified",
    verifiedBy: context.actorId || normalizeNullableString(input.verifiedBy),
    verifiedAt: normalizeNullableString(input.verifiedAt) || timestamp(context),
    notes: normalizeNullableString(input.notes ?? criterion.notes ?? null)
  };
  const next = cloneWithUpdates(record, context, sourceContext, {
    acceptanceCriteria: replaceCriterion(record.acceptanceCriteria, nextCriterion)
  });
  appendAuditEvent(next, context, "acceptance_criterion_verified", criterion.status, "verified", {
    criteriaKey: criterion.key,
    ...(input.metadata || {})
  });
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function waiveCriterion(record, context, input, sourceContext) {
  assertLifecycle(record, ["evidence_review"], "INVALID_ACCEPTANCE_WAIVER_STAGE");
  const criterion = requireCriterion(record, input.criteriaKey || input.key);
  const reason = normalizeString(input.reason || input.notes);
  if (!reason) throw domainError(400, "ACCEPTANCE_WAIVER_REASON_REQUIRED", "Waiving acceptance evidence requires a reason.");
  const nextCriterion = {
    ...criterion,
    status: "waived",
    verifiedBy: context.actorId || normalizeNullableString(input.verifiedBy),
    verifiedAt: normalizeNullableString(input.verifiedAt) || timestamp(context),
    notes: reason
  };
  const next = cloneWithUpdates(record, context, sourceContext, {
    acceptanceCriteria: replaceCriterion(record.acceptanceCriteria, nextCriterion)
  });
  appendAuditEvent(next, context, "acceptance_criterion_waived", criterion.status, "waived", {
    criteriaKey: criterion.key,
    reason,
    ...(input.metadata || {})
  });
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function requestCustomerAcceptance(record, context, input, sourceContext) {
  assertLifecycle(record, ["evidence_review"], "INVALID_CUSTOMER_ACCEPTANCE_STAGE");
  assertRequiredCriteriaReady(record);
  const next = cloneWithUpdates(record, context, sourceContext, {
    lifecycleStatus: "customer_review",
    customerAcceptance: {
      ...record.customerAcceptance,
      status: "requested",
      notes: normalizeNullableString(input.notes ?? record.customerAcceptance.notes ?? null)
    }
  });
  appendAuditEvent(next, context, "customer_acceptance_requested", record.lifecycleStatus, "customer_review", input.metadata || {});
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function recordCustomerAcceptance(record, context, input, sourceContext) {
  assertLifecycle(record, ["customer_review"], "INVALID_CUSTOMER_ACCEPTANCE_STAGE");
  const patch = input.customerAcceptance || input;
  const status = normalizeReviewStatus(patch.status || "accepted");
  if (!["accepted", "rejected"].includes(status)) {
    throw domainError(400, "INVALID_CUSTOMER_ACCEPTANCE_STATUS", "Customer acceptance must be accepted or rejected.");
  }
  const acceptedBy = normalizeString(patch.acceptedBy);
  if (status === "accepted" && !acceptedBy) {
    throw domainError(400, "CUSTOMER_ACCEPTOR_REQUIRED", "Customer acceptance requires an acceptor identity.");
  }
  const nextStatus = status === "rejected" ? "rejected" : record.lifecycleStatus;
  const next = cloneWithUpdates(record, context, sourceContext, {
    lifecycleStatus: nextStatus,
    customerAcceptance: normalizeCustomerAcceptance({
      ...record.customerAcceptance,
      ...patch,
      status,
      acceptedAt: patch.acceptedAt || timestamp(context)
    }),
    certification: status === "rejected"
      ? { ...record.certification, status: "blocked", blockers: [...record.certification.blockers, "customer_acceptance_rejected"] }
      : record.certification
  });
  appendAuditEvent(next, context, "customer_acceptance_recorded", record.customerAcceptance.status, status, {
    acceptedBy: next.customerAcceptance.acceptedBy,
    ...(input.metadata || {})
  });
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function requestExecutiveApproval(record, context, input, sourceContext) {
  assertLifecycle(record, ["customer_review"], "INVALID_EXECUTIVE_APPROVAL_STAGE");
  assertCustomerAccepted(record);
  const next = cloneWithUpdates(record, context, sourceContext, {
    lifecycleStatus: "executive_review",
    executiveApproval: {
      ...record.executiveApproval,
      status: "requested",
      decisionMemo: normalizeNullableString(input.decisionMemo ?? record.executiveApproval.decisionMemo ?? null)
    }
  });
  appendAuditEvent(next, context, "executive_approval_requested", record.lifecycleStatus, "executive_review", input.metadata || {});
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function recordExecutiveApproval(record, context, input, sourceContext) {
  assertLifecycle(record, ["executive_review"], "INVALID_EXECUTIVE_APPROVAL_STAGE");
  const patch = input.executiveApproval || input;
  const status = normalizeApprovalStatus(patch.status || "approved");
  if (!["approved", "rejected"].includes(status)) {
    throw domainError(400, "INVALID_EXECUTIVE_APPROVAL_STATUS", "Executive approval must be approved or rejected.");
  }
  if (status === "approved") {
    assertPackageGenerated(record);
    if (!normalizeString(patch.approvedBy)) {
      throw domainError(400, "EXECUTIVE_APPROVER_REQUIRED", "Executive approval requires an approver identity.");
    }
  }
  const nextStatus = status === "rejected" ? "rejected" : record.lifecycleStatus;
  const next = cloneWithUpdates(record, context, sourceContext, {
    lifecycleStatus: nextStatus,
    executiveApproval: normalizeExecutiveApproval({
      ...record.executiveApproval,
      ...patch,
      status,
      approvedAt: patch.approvedAt || timestamp(context)
    }),
    certification: status === "rejected"
      ? { ...record.certification, status: "blocked", blockers: [...record.certification.blockers, "executive_approval_rejected"] }
      : record.certification
  });
  appendAuditEvent(next, context, "executive_approval_recorded", record.executiveApproval.status, status, {
    approvedBy: next.executiveApproval.approvedBy,
    ...(input.metadata || {})
  });
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function generatePackage(record, context, input, sourceContext) {
  const generatedAt = normalizeNullableString(input.generatedAt) || timestamp(context);
  const packageData = buildEvidencePackage(record, sourceContext, { generatedAt });
  const next = cloneWithUpdates(record, context, sourceContext, {
    evidencePackage: normalizeEvidencePackage({
      packageId: record.evidencePackage.packageId || createId("pkg"),
      generatedAt,
      status: "generated",
      includedRefs: packageData.includedRefs,
      sections: packageData.sections,
      checksum: packageData.checksum,
      version: record.evidencePackage.version + 1
    })
  });
  appendAuditEvent(next, context, "acceptance_package_generated", record.evidencePackage.checksum, packageData.checksum, input.metadata || {});
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function certifyAcceptance(record, context, input, sourceContext) {
  assertLifecycle(record, ["executive_review"], "INVALID_CERTIFICATION_STAGE");
  const blockers = certificationBlockers(record, sourceContext);
  if (blockers.length) {
    const next = cloneWithUpdates(record, context, sourceContext, {
      certification: {
        ...record.certification,
        status: "blocked",
        blockers
      }
    });
    appendAuditEvent(next, context, "acceptance_certification_blocked", "not_certified", "blocked", { blockers });
    Object.assign(record, next);
    throw domainError(409, "ACCEPTANCE_CERTIFICATION_BLOCKED", `Acceptance certification is blocked: ${blockers.join(", ")}.`);
  }
  const next = cloneWithUpdates(record, context, sourceContext, {
    lifecycleStatus: "accepted",
    certification: {
      status: "certified",
      certifiedBy: context.actorId || normalizeNullableString(input.certifiedBy),
      certifiedAt: normalizeNullableString(input.certifiedAt) || timestamp(context),
      certificationLevel: normalizeCertificationLevel(input.certificationLevel || "enterprise_acceptance_ready"),
      blockers: [],
      summary: normalizeString(input.summary, "Production pilot rehearsal evidence is certified for enterprise acceptance.")
    }
  });
  appendAuditEvent(next, context, "acceptance_certified", record.lifecycleStatus, "accepted", input.metadata || {});
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function rejectAcceptance(record, context, input, sourceContext) {
  if (TERMINAL_STATUSES.has(record.lifecycleStatus)) {
    throw domainError(409, "ACCEPTANCE_CLOSED", "Terminal acceptance records cannot be modified.");
  }
  const reason = normalizeString(input.reason || input.notes);
  if (!reason) throw domainError(400, "ACCEPTANCE_REJECTION_REASON_REQUIRED", "Rejecting acceptance requires a reason.");
  const next = cloneWithUpdates(record, context, sourceContext, {
    lifecycleStatus: "rejected",
    certification: {
      ...record.certification,
      status: "blocked",
      blockers: [...record.certification.blockers, "acceptance_rejected"],
      summary: reason
    }
  });
  appendAuditEvent(next, context, "acceptance_rejected", record.lifecycleStatus, "rejected", { reason, ...(input.metadata || {}) });
  Object.assign(record, next);
  return toPublicAcceptance(record, sourceContext);
}

function buildEvidencePackage(recordInput, sourceContext = {}, options = {}) {
  const record = normalizeAcceptanceRecord(recordInput, sourceContext);
  const generatedAt = normalizeNullableString(options.generatedAt) || record.evidencePackage.generatedAt || "";
  const sections = [
    "pilot_identity",
    "decision_contract_summary",
    "business_impact_summary",
    "control_room_status",
    "rehearsal_status",
    "outcome_evidence",
    "incident_drill_status",
    "customer_acceptance",
    "executive_approval",
    "certification_summary",
    "audit_trail"
  ];
  const includedRefs = collectEvidenceRefs(record, sourceContext);
  const sourceSummary = summarizeSourceContext(sourceContext);
  const lines = [
    `# MarginLift Production Pilot Acceptance Package`,
    "",
    `Generated At: ${generatedAt || "not_generated"}`,
    `Organization: ${sourceContext.organization?.name || record.organizationId || "unknown"}`,
    `Acceptance ID: ${record.id || "not_created"}`,
    "",
    "## Pilot Identity",
    `- Pilot Contract ID: ${record.pilotContractId || "missing"}`,
    `- Business Impact Ledger ID: ${record.businessImpactLedgerId || "missing"}`,
    `- Pilot Workflow ID: ${record.pilotWorkflowId || "missing"}`,
    `- Experiment ID: ${record.experimentId || "missing"}`,
    `- Outcome ID: ${record.outcomeId || "missing"}`,
    "",
    "## Decision Contract Summary",
    `- Status: ${sourceSummary.decisionContractStatus}`,
    `- Objective: ${sourceSummary.businessObjective}`,
    `- KPI: ${sourceSummary.primaryKpi}`,
    "",
    "## Business Impact Summary",
    `- Finance Verification: ${sourceSummary.financeVerification}`,
    `- Realized Value: ${sourceSummary.realizedValue}`,
    `- ROI Status: ${sourceSummary.roiStatus}`,
    "",
    "## Control Room Status",
    `- Lifecycle: ${sourceSummary.controlLifecycle}`,
    `- Open Blockers: ${sourceSummary.openBlockers}`,
    `- Decision Ready: ${sourceSummary.decisionReady}`,
    "",
    "## Rehearsal Status",
    `- Rehearsal Complete: ${sourceSummary.rehearsalComplete}`,
    `- Completed Stages: ${sourceSummary.completedStages}`,
    "",
    "## Outcome Evidence",
    `- Outcome Status: ${sourceSummary.outcomeStatus}`,
    `- Evidence Status: ${sourceSummary.outcomeEvidenceStatus}`,
    `- Outcome Version: ${sourceSummary.outcomeVersion}`,
    "",
    "## Incident Drill Status",
    `- Critical Blockers Open: ${sourceSummary.criticalBlockers}`,
    `- Incident Evidence References: ${sourceSummary.incidentEvidenceRefs}`,
    "",
    "## Acceptance Criteria",
    ...record.acceptanceCriteria.map(item => `- ${item.key}: ${item.status}${item.required ? " (required)" : ""}`),
    "",
    "## Customer Acceptance",
    `- Status: ${record.customerAcceptance.status}`,
    `- Accepted By: ${record.customerAcceptance.acceptedBy || "not_recorded"}`,
    `- Accepted At: ${record.customerAcceptance.acceptedAt || "not_recorded"}`,
    "",
    "## Executive Approval",
    `- Status: ${record.executiveApproval.status}`,
    `- Approved By: ${record.executiveApproval.approvedBy || "not_recorded"}`,
    `- Approved At: ${record.executiveApproval.approvedAt || "not_recorded"}`,
    "",
    "## Certification Summary",
    `- Lifecycle Status: ${record.lifecycleStatus}`,
    `- Certification Status: ${record.certification.status}`,
    `- Certification Level: ${record.certification.certificationLevel}`,
    `- Blockers: ${record.certification.blockers.length ? record.certification.blockers.join(", ") : "none"}`,
    "",
    "## Audit Trail",
    ...record.auditEvents.map(event => `- ${event.timestamp || "unknown"} ${event.action} ${event.from ?? "null"} -> ${event.to ?? "null"}`)
  ];
  const body = `${lines.join("\n")}\n`;
  const checksum = sha256(body);
  return {
    markdown: `${body}\nPackage Checksum: sha256:${checksum}\n`,
    checksum: `sha256:${checksum}`,
    includedRefs,
    sections
  };
}

function summarizePilotAcceptance(record) {
  if (!record || record.persisted !== true) {
    return {
      persisted: false,
      lifecycleStatus: "draft",
      certificationStatus: "not_certified",
      customerAcceptanceStatus: "not_requested",
      executiveApprovalStatus: "not_requested",
      requiredCriteriaReady: false,
      packageChecksum: null
    };
  }
  return {
    persisted: true,
    id: record.id,
    lifecycleStatus: record.lifecycleStatus,
    certificationStatus: record.certification.status,
    customerAcceptanceStatus: record.customerAcceptance.status,
    executiveApprovalStatus: record.executiveApproval.status,
    requiredCriteriaReady: requiredCriteriaReady(record),
    packageChecksum: record.evidencePackage.checksum || null
  };
}

function normalizeCriteria(input, sourceContext = {}) {
  const supplied = Array.isArray(input) ? input : [];
  const byKey = new Map(supplied.map(item => [item?.key, item]).filter(([key]) => key));
  return defaultCriteria(sourceContext).map(item => normalizeCriterion({ ...item, ...(byKey.get(item.key) || {}) }));
}

function defaultCriteria(sourceContext = {}) {
  const pilotControl = sourceContext.pilotControl || {};
  const completedStages = Array.isArray(pilotControl.stages)
    ? pilotControl.stages.filter(stage => stage.status === "completed").length
    : 0;
  return [
    {
      key: "decision_contract_ready",
      label: "Decision contract approved or locked",
      required: true,
      status: sourceContext.decisionContract?.persisted && ["approved", "locked", "experiment_running", "outcome_review", "closed"].includes(sourceContext.decisionContract.lifecycleStatus) ? "submitted" : "missing"
    },
    {
      key: "business_impact_verified",
      label: "Business impact verified by finance",
      required: true,
      status: sourceContext.businessImpact?.financeValidation?.status === "verified" ? "submitted" : "missing"
    },
    {
      key: "rehearsal_completed",
      label: "Production pilot rehearsal completed",
      required: true,
      status: ["decision_ready", "closed"].includes(pilotControl.lifecycleStatus) || completedStages >= 5 ? "submitted" : "missing"
    },
    {
      key: "outcome_evidence_available",
      label: "Outcome evidence available for review",
      required: true,
      status: sourceContext.outcome?.id ? "submitted" : "missing"
    },
    {
      key: "incident_drills_closed",
      label: "Incident drills and critical blockers closed",
      required: true,
      status: hasOpenCriticalBlockers(sourceContext) ? "missing" : "submitted"
    }
  ];
}

function normalizeCriterion(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    key: normalizeString(source.key),
    label: normalizeString(source.label, source.key || ""),
    required: source.required !== false,
    status: normalizeCriterionStatus(source.status),
    evidenceRefs: Array.isArray(source.evidenceRefs) ? source.evidenceRefs.map(normalizeEvidence).filter(Boolean) : [],
    verifiedBy: normalizeNullableString(source.verifiedBy),
    verifiedAt: normalizeNullableString(source.verifiedAt),
    notes: normalizeNullableString(source.notes)
  };
}

function normalizeEvidence(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: normalizeString(source.id, createId("evd")),
    label: normalizeString(source.label),
    url: normalizeNullableString(source.url),
    referenceId: normalizeNullableString(source.referenceId),
    evidenceType: normalizeString(source.evidenceType, "artifact"),
    createdAt: normalizeNullableString(source.createdAt),
    createdBy: normalizeNullableString(source.createdBy)
  };
}

function normalizeCustomerAcceptance(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    status: normalizeCustomerStatus(source.status || "not_requested"),
    acceptedBy: normalizeNullableString(source.acceptedBy),
    acceptedAt: normalizeNullableString(source.acceptedAt),
    customerRole: normalizeNullableString(source.customerRole),
    notes: normalizeNullableString(source.notes),
    evidenceRefs: Array.isArray(source.evidenceRefs) ? source.evidenceRefs.map(normalizeEvidence).filter(Boolean) : []
  };
}

function normalizeExecutiveApproval(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    status: normalizeExecutiveStatus(source.status || "not_requested"),
    approvedBy: normalizeNullableString(source.approvedBy),
    approvedAt: normalizeNullableString(source.approvedAt),
    approverRole: normalizeNullableString(source.approverRole),
    decisionMemo: normalizeNullableString(source.decisionMemo),
    conditions: normalizeStringArray(source.conditions),
    evidenceRefs: Array.isArray(source.evidenceRefs) ? source.evidenceRefs.map(normalizeEvidence).filter(Boolean) : []
  };
}

function normalizeCertification(input = {}, criteria = [], sourceContext = {}, lifecycleStatus = "draft", evidencePackage = null) {
  const source = input && typeof input === "object" ? input : {};
  const blockers = normalizeStringArray(source.blockers);
  return {
    status: normalizeCertificationStatus(source.status || "not_certified"),
    certifiedBy: normalizeNullableString(source.certifiedBy),
    certifiedAt: normalizeNullableString(source.certifiedAt),
    certificationLevel: normalizeCertificationLevel(source.certificationLevel || "pilot_rehearsal_complete"),
    blockers,
    summary: normalizeString(source.summary, certificationSummary(criteria, sourceContext, lifecycleStatus, evidencePackage, blockers))
  };
}

function normalizeEvidencePackage(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    packageId: normalizeNullableString(source.packageId),
    generatedAt: normalizeNullableString(source.generatedAt),
    status: normalizePackageStatus(source.status || "not_generated"),
    includedRefs: normalizeStringArray(source.includedRefs),
    sections: normalizeStringArray(source.sections),
    checksum: normalizeNullableString(source.checksum),
    version: normalizePositiveInteger(source.version, 0)
  };
}

function certificationSummary(criteria, sourceContext, lifecycleStatus, evidencePackage, blockers) {
  if (lifecycleStatus === "accepted") return "Production pilot acceptance is certified.";
  if (blockers.length) return `Certification blocked by ${blockers.join(", ")}.`;
  if (!criteria.every(item => !item.required || ["verified", "waived"].includes(item.status))) return "Acceptance evidence is still under review.";
  if (hasOpenCriticalBlockers(sourceContext)) return "Certification blocked by open critical blockers.";
  if (!evidencePackage || evidencePackage.status === "not_generated") return "Final evidence package has not been generated.";
  return "Acceptance evidence is ready for executive review.";
}

function certificationBlockers(record, sourceContext = {}) {
  const blockers = [];
  if (!requiredCriteriaReady(record)) blockers.push("required_acceptance_criteria_not_ready");
  if (record.customerAcceptance.status !== "accepted") blockers.push("customer_acceptance_missing");
  if (record.executiveApproval.status !== "approved") blockers.push("executive_approval_missing");
  if (record.evidencePackage.status === "not_generated" || !record.evidencePackage.checksum) blockers.push("evidence_package_missing");
  if (hasOpenCriticalBlockers(sourceContext)) blockers.push("critical_blockers_open");
  return blockers;
}

function summarizeSourceContext(sourceContext = {}) {
  const contract = sourceContext.decisionContract || {};
  const businessImpact = sourceContext.businessImpact || {};
  const pilotControl = sourceContext.pilotControl || {};
  const outcome = sourceContext.outcome || {};
  const stages = Array.isArray(pilotControl.stages) ? pilotControl.stages : [];
  const blockers = Array.isArray(pilotControl.blockers) ? pilotControl.blockers : [];
  const openBlockers = blockers.filter(item => item && !["resolved", "closed"].includes(item.status));
  const criticalBlockers = openBlockers.filter(item => item.severity === "critical");
  const incidentEvidenceRefs = stages
    .flatMap(stage => Array.isArray(stage.evidence) ? stage.evidence : [])
    .filter(evidence => /incident|drill|blocker/i.test(`${evidence.label || ""} ${evidence.evidenceType || ""}`))
    .map(evidence => evidence.referenceId || evidence.id || evidence.label)
    .filter(Boolean);
  const completedStages = stages.filter(stage => stage.status === "completed").length;
  return {
    decisionContractStatus: contract.lifecycleStatus || "missing",
    businessObjective: contract.businessObjective || "missing",
    primaryKpi: contract.primaryKpi?.key || contract.primaryKpi?.label || "missing",
    financeVerification: businessImpact.financeValidation?.status || "missing",
    realizedValue: stringifyValue(businessImpact.realizedImpact?.measuredImpact),
    roiStatus: businessImpact.roi?.roiPercentage === null || businessImpact.roi?.roiPercentage === undefined ? "not_available" : String(businessImpact.roi.roiPercentage),
    controlLifecycle: pilotControl.lifecycleStatus || "missing",
    openBlockers: String(openBlockers.length),
    decisionReady: String(pilotControl.lifecycleStatus === "decision_ready" || pilotControl.lifecycleStatus === "closed" || pilotControl.executiveReadiness?.overallStatus === "ready"),
    rehearsalComplete: String(["decision_ready", "closed"].includes(pilotControl.lifecycleStatus) || completedStages >= 5),
    completedStages: String(completedStages),
    outcomeStatus: outcome.summary?.decisionStatus || outcome.summary?.evidenceStatus || (outcome.id ? "available" : "missing"),
    outcomeEvidenceStatus: outcome.summary?.evidenceStatus || "missing",
    outcomeVersion: stringifyValue(outcome.version),
    criticalBlockers: String(criticalBlockers.length),
    incidentEvidenceRefs: incidentEvidenceRefs.length ? incidentEvidenceRefs.sort().join(", ") : "none"
  };
}

function collectEvidenceRefs(record, sourceContext = {}) {
  const refs = [];
  refs.push(record.pilotContractId, record.businessImpactLedgerId, record.pilotWorkflowId, record.experimentId, record.outcomeId);
  for (const criterion of record.acceptanceCriteria) {
    for (const evidence of criterion.evidenceRefs) refs.push(evidence.referenceId || evidence.id || evidence.url || evidence.label);
  }
  for (const evidence of record.customerAcceptance.evidenceRefs) refs.push(evidence.referenceId || evidence.id || evidence.url || evidence.label);
  for (const evidence of record.executiveApproval.evidenceRefs) refs.push(evidence.referenceId || evidence.id || evidence.url || evidence.label);
  const stages = Array.isArray(sourceContext.pilotControl?.stages) ? sourceContext.pilotControl.stages : [];
  for (const stage of stages) {
    for (const evidence of stage.evidence || []) refs.push(evidence.referenceId || evidence.id || evidence.url || evidence.label);
  }
  return [...new Set(refs.filter(Boolean).map(String))].sort();
}

function cloneWithUpdates(record, context, sourceContext, updates) {
  return normalizeAcceptanceRecord({
    ...record,
    ...updates,
    auditEvents: Array.isArray(record.auditEvents) ? [...record.auditEvents] : [],
    audit: updateAudit(record.audit, context)
  }, sourceContext);
}

function fallbackAcceptance(context, sourceContext) {
  return {
    ...normalizeAcceptanceRecord({
      id: null,
      organizationId: requireOrganizationId(context),
      lifecycleStatus: "draft",
      audit: {
        createdAt: null,
        createdBy: null,
        updatedAt: null,
        updatedBy: null
      },
      auditEvents: []
    }, sourceContext),
    persisted: false
  };
}

function toPublicAcceptance(record, sourceContext = {}) {
  return {
    ...normalizeAcceptanceRecord(record, sourceContext),
    persisted: true
  };
}

function requireLatestAcceptance(db, context) {
  const organizationId = requireOrganizationId(context);
  db.pilotAcceptances = Array.isArray(db.pilotAcceptances) ? db.pilotAcceptances : [];
  const record = findLatestAcceptance(db, organizationId);
  if (!record) throw domainError(404, "ACCEPTANCE_NOT_FOUND", "No pilot acceptance record exists for this organization.");
  assertTenantAccess(record, organizationId);
  return record;
}

function findLatestAcceptance(db, organizationId) {
  const records = Array.isArray(db?.pilotAcceptances) ? db.pilotAcceptances : [];
  return records
    .filter(item => item && item.organizationId === organizationId)
    .sort(sortNewest)[0] || null;
}

function findActiveAcceptance(db, organizationId) {
  const records = Array.isArray(db?.pilotAcceptances) ? db.pilotAcceptances : [];
  return records
    .filter(item => item && item.organizationId === organizationId && !TERMINAL_STATUSES.has(item.lifecycleStatus))
    .sort(sortNewest)[0] || null;
}

function requireCriterion(record, criteriaKey) {
  const key = normalizeString(criteriaKey);
  if (!key) throw domainError(400, "ACCEPTANCE_CRITERION_KEY_REQUIRED", "Acceptance criterion key is required.");
  const criterion = record.acceptanceCriteria.find(item => item.key === key);
  if (!criterion) throw domainError(404, "ACCEPTANCE_CRITERION_NOT_FOUND", "Acceptance criterion was not found.");
  return criterion;
}

function replaceCriterion(criteria, nextCriterion) {
  return criteria.map(item => item.key === nextCriterion.key ? nextCriterion : item);
}

function assertRequiredCriteriaReady(record) {
  if (!requiredCriteriaReady(record)) {
    throw domainError(409, "ACCEPTANCE_CRITERIA_NOT_READY", "Required acceptance criteria must be verified or waived first.");
  }
}

function requiredCriteriaReady(record) {
  return normalizeAcceptanceRecord(record).acceptanceCriteria
    .every(item => !item.required || ["verified", "waived"].includes(item.status));
}

function assertCustomerAccepted(record) {
  if (record.customerAcceptance.status !== "accepted") {
    throw domainError(409, "CUSTOMER_ACCEPTANCE_REQUIRED", "Customer acceptance must be recorded first.");
  }
}

function assertPackageGenerated(record) {
  if (record.evidencePackage.status === "not_generated" || !record.evidencePackage.checksum) {
    throw domainError(409, "ACCEPTANCE_PACKAGE_REQUIRED", "Executive approval requires a generated evidence package.");
  }
}

function hasOpenCriticalBlockers(sourceContext = {}) {
  const blockers = Array.isArray(sourceContext.pilotControl?.blockers) ? sourceContext.pilotControl.blockers : [];
  return blockers.some(item => item && item.severity === "critical" && !["resolved", "closed"].includes(item.status));
}

function assertLifecycle(record, allowed, code) {
  if (!allowed.includes(record.lifecycleStatus)) {
    throw domainError(409, code, `Invalid acceptance lifecycle stage: ${record.lifecycleStatus}.`);
  }
}

function appendAuditEvent(record, context, action, from, to, metadata = {}) {
  const event = {
    action,
    from,
    to,
    userId: context.actorId || null,
    timestamp: timestamp(context),
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {}
  };
  record.auditEvents = Array.isArray(record.auditEvents) ? record.auditEvents : [];
  record.auditEvents.push(event);
  return event;
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

function assertInputOrganization(input, organizationId) {
  if (input.organizationId && input.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_ACCEPTANCE_ACCESS", "Pilot acceptance organization does not match the authenticated organization.");
  }
}

function assertTenantAccess(record, organizationId) {
  if (!record || record.organizationId !== organizationId) {
    throw domainError(403, "CROSS_ORGANIZATION_ACCEPTANCE_ACCESS", "Pilot acceptance organization does not match the authenticated organization.");
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
    throw domainError(400, "INVALID_ACCEPTANCE_STATUS", "Pilot acceptance lifecycle status is invalid.");
  }
  return normalized;
}

function normalizeCriterionStatus(value) {
  const normalized = normalizeString(value, "missing");
  if (!["missing", "submitted", "verified", "waived"].includes(normalized)) return "missing";
  return normalized;
}

function normalizeCustomerStatus(value) {
  const normalized = normalizeString(value, "not_requested");
  if (!["not_requested", "requested", "accepted", "rejected"].includes(normalized)) return "not_requested";
  return normalized;
}

function normalizeExecutiveStatus(value) {
  const normalized = normalizeString(value, "not_requested");
  if (!["not_requested", "requested", "approved", "rejected"].includes(normalized)) return "not_requested";
  return normalized;
}

function normalizeReviewStatus(value) {
  const normalized = normalizeString(value);
  if (!["accepted", "rejected"].includes(normalized)) return normalized;
  return normalized;
}

function normalizeApprovalStatus(value) {
  const normalized = normalizeString(value);
  if (!["approved", "rejected"].includes(normalized)) return normalized;
  return normalized;
}

function normalizeCertificationStatus(value) {
  const normalized = normalizeString(value, "not_certified");
  if (!["not_certified", "certified", "blocked"].includes(normalized)) return "not_certified";
  return normalized;
}

function normalizeCertificationLevel(value) {
  const normalized = normalizeString(value, "pilot_rehearsal_complete");
  if (!["pilot_rehearsal_complete", "enterprise_acceptance_ready"].includes(normalized)) return "pilot_rehearsal_complete";
  return normalized;
}

function normalizePackageStatus(value) {
  const normalized = normalizeString(value, "not_generated");
  if (!["not_generated", "generated", "sealed"].includes(normalized)) return "not_generated";
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

function normalizeStringArray(value, fallback = []) {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return source.map(item => normalizeString(item)).filter(Boolean);
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function stringifyValue(value) {
  if (value === null || value === undefined || value === "") return "not_available";
  return String(value);
}

function sortNewest(a, b) {
  return new Date(b.audit?.updatedAt || b.audit?.createdAt || 0) - new Date(a.audit?.updatedAt || a.audit?.createdAt || 0);
}

function timestamp(context = {}) {
  return context.now || new Date().toISOString();
}

function createId(prefix = "pac") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function domainError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  LIFECYCLE_STATUSES,
  buildEvidencePackage,
  createPilotAcceptance,
  dispatchAcceptanceAction,
  getPilotAcceptance,
  normalizeAcceptanceRecord,
  summarizePilotAcceptance
};
