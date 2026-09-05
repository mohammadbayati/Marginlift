const assert = require("assert");

const {
  buildEvidencePackage,
  createPilotAcceptance,
  dispatchAcceptanceAction,
  getPilotAcceptance,
  normalizeAcceptanceRecord
} = require("../src/production-acceptance");

const context = Object.freeze({
  organizationId: "org_marginlift",
  actorId: "usr_admin",
  actorRole: "admin",
  now: "2026-09-30T00:00:00.000Z"
});

const sourceContext = Object.freeze({
  organization: { id: "org_marginlift", name: "MarginLift Test" },
  decisionContract: {
    id: "pdc_123",
    persisted: true,
    lifecycleStatus: "locked",
    businessObjective: "Prove production pilot readiness.",
    primaryKpi: { key: "incremental_profit_per_customer" }
  },
  businessImpact: {
    id: "bil_123",
    persisted: true,
    financeValidation: { status: "verified" },
    realizedImpact: { measuredImpact: 26000 },
    roi: { roiPercentage: 260 }
  },
  pilotControl: {
    id: "pwf_123",
    persisted: true,
    lifecycleStatus: "decision_ready",
    executiveReadiness: { overallStatus: "ready" },
    blockers: [],
    stages: [
      { key: "draft", status: "completed", evidence: [{ label: "contract", referenceId: "doc_contract" }] },
      { key: "kickoff", status: "completed", evidence: [{ label: "kickoff", referenceId: "doc_kickoff" }] },
      { key: "data_ready", status: "completed", evidence: [{ label: "data", referenceId: "doc_data" }] },
      { key: "experiment_running", status: "completed", evidence: [{ label: "incident drill", referenceId: "doc_drill" }] },
      { key: "outcome_pending", status: "completed", evidence: [{ label: "outcome", referenceId: "doc_outcome" }] },
      { key: "decision_ready", status: "active", evidence: [{ label: "readout", referenceId: "doc_readout" }] }
    ]
  },
  experiment: { id: "exp_123" },
  outcome: {
    id: "out_123",
    version: 2,
    summary: {
      decisionStatus: "needs_review",
      evidenceStatus: "descriptive_only"
    }
  },
  readiness: { status: "ready" }
});

function assertThrowsCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

function verifyAllCriteria(db) {
  const keys = db.pilotAcceptances[0].acceptanceCriteria.map(item => item.key);
  for (const key of keys) {
    dispatchAcceptanceAction(db, context, {
      action: "submit_evidence",
      criteriaKey: key,
      evidence: {
        label: `${key} evidence`,
        referenceId: `doc_${key}`
      }
    }, sourceContext);
    dispatchAcceptanceAction(db, context, {
      action: "verify_criterion",
      criteriaKey: key,
      notes: `${key} verified`
    }, sourceContext);
  }
}

function run() {
  const normalized = normalizeAcceptanceRecord({
    organizationId: context.organizationId,
    acceptanceCriteria: [
      { key: "decision_contract_ready", status: "verified", evidenceRefs: [{ label: "contract", referenceId: "doc_1" }] }
    ]
  }, sourceContext);
  assert.strictEqual(normalized.organizationId, context.organizationId);
  assert.strictEqual(normalized.acceptanceCriteria.length, 5);
  assert.strictEqual(normalized.acceptanceCriteria.find(item => item.key === "decision_contract_ready").status, "verified");
  assert.strictEqual(normalized.pilotContractId, "pdc_123");

  assert.throws(
    () => normalizeAcceptanceRecord({ lifecycleStatus: "unknown" }, sourceContext),
    error => error && error.code === "INVALID_ACCEPTANCE_STATUS"
  );

  const emptyDb = {};
  const fallback = getPilotAcceptance(emptyDb, context, sourceContext);
  assert.strictEqual(fallback.persisted, false);
  assert.strictEqual(fallback.lifecycleStatus, "draft");

  const db = {};
  const created = createPilotAcceptance(db, context, {}, sourceContext);
  assert.strictEqual(created.persisted, true);
  assert.strictEqual(created.organizationId, context.organizationId);
  assert.strictEqual(created.lifecycleStatus, "draft");
  assert.strictEqual(created.acceptanceCriteria.length, 5);
  assert.ok(created.auditEvents.some(event => event.action === "acceptance_created"));

  assertThrowsCode(
    () => createPilotAcceptance({}, context, { organizationId: "org_other" }, sourceContext),
    "CROSS_ORGANIZATION_ACCEPTANCE_ACCESS"
  );
  assert.strictEqual(getPilotAcceptance(db, { ...context, organizationId: "org_other" }, sourceContext).persisted, false);

  assertThrowsCode(
    () => dispatchAcceptanceAction(db, context, {
      action: "verify_criterion",
      criteriaKey: "decision_contract_ready"
    }, sourceContext),
    "INVALID_ACCEPTANCE_VERIFICATION_STAGE"
  );

  const firstEvidence = dispatchAcceptanceAction(db, context, {
    action: "submit_evidence",
    criteriaKey: "decision_contract_ready",
    evidence: { label: "Decision contract", referenceId: "doc_contract_acceptance" }
  }, sourceContext);
  assert.strictEqual(firstEvidence.lifecycleStatus, "evidence_review");
  assert.strictEqual(firstEvidence.acceptanceCriteria.find(item => item.key === "decision_contract_ready").evidenceRefs.length, 1);

  assertThrowsCode(
    () => dispatchAcceptanceAction(db, context, { action: "request_customer_acceptance" }, sourceContext),
    "ACCEPTANCE_CRITERIA_NOT_READY"
  );

  assertThrowsCode(
    () => dispatchAcceptanceAction(db, context, {
      action: "verify_criterion",
      criteriaKey: "business_impact_verified"
    }, sourceContext),
    "ACCEPTANCE_CRITERION_EVIDENCE_MISSING"
  );

  dispatchAcceptanceAction(db, context, {
    action: "verify_criterion",
    criteriaKey: "decision_contract_ready",
    notes: "Decision contract accepted."
  }, sourceContext);

  for (const key of ["business_impact_verified", "rehearsal_completed", "outcome_evidence_available", "incident_drills_closed"]) {
    dispatchAcceptanceAction(db, context, {
      action: "submit_evidence",
      criteriaKey: key,
      evidence: { label: `${key} evidence`, referenceId: `doc_${key}` }
    }, sourceContext);
    dispatchAcceptanceAction(db, context, {
      action: "verify_criterion",
      criteriaKey: key
    }, sourceContext);
  }

  const customerRequested = dispatchAcceptanceAction(db, context, {
    action: "request_customer_acceptance"
  }, sourceContext);
  assert.strictEqual(customerRequested.lifecycleStatus, "customer_review");
  assert.strictEqual(customerRequested.customerAcceptance.status, "requested");

  const customerAccepted = dispatchAcceptanceAction(db, context, {
    action: "record_customer_acceptance",
    customerAcceptance: {
      status: "accepted",
      acceptedBy: "customer_sponsor",
      customerRole: "CRO",
      notes: "Customer accepts rehearsal evidence."
    }
  }, sourceContext);
  assert.strictEqual(customerAccepted.customerAcceptance.status, "accepted");
  assert.ok(customerAccepted.auditEvents.some(event => event.action === "customer_acceptance_recorded"));

  const executiveRequested = dispatchAcceptanceAction(db, context, {
    action: "request_executive_approval"
  }, sourceContext);
  assert.strictEqual(executiveRequested.lifecycleStatus, "executive_review");

  assertThrowsCode(
    () => dispatchAcceptanceAction(db, context, {
      action: "record_executive_approval",
      executiveApproval: {
        status: "approved",
        approvedBy: "ceo"
      }
    }, sourceContext),
    "ACCEPTANCE_PACKAGE_REQUIRED"
  );

  const packaged = dispatchAcceptanceAction(db, context, {
    action: "generate_package",
    generatedAt: "2026-10-01T00:00:00.000Z"
  }, sourceContext);
  assert.match(packaged.evidencePackage.checksum, /^sha256:[a-f0-9]{64}$/);

  assertThrowsCode(
    () => dispatchAcceptanceAction(db, context, { action: "certify" }, sourceContext),
    "ACCEPTANCE_CERTIFICATION_BLOCKED"
  );

  const executiveApproved = dispatchAcceptanceAction(db, context, {
    action: "record_executive_approval",
    executiveApproval: {
      status: "approved",
      approvedBy: "ceo",
      approverRole: "CEO",
      decisionMemo: "Approved for enterprise acceptance."
    }
  }, sourceContext);
  assert.strictEqual(executiveApproved.executiveApproval.status, "approved");
  assert.ok(executiveApproved.auditEvents.some(event => event.action === "executive_approval_recorded"));

  const certified = dispatchAcceptanceAction(db, context, {
    action: "certify",
    certificationLevel: "enterprise_acceptance_ready"
  }, sourceContext);
  assert.strictEqual(certified.lifecycleStatus, "accepted");
  assert.strictEqual(certified.certification.status, "certified");
  assert.strictEqual(certified.certification.certificationLevel, "enterprise_acceptance_ready");

  const packageA = buildEvidencePackage(certified, sourceContext, { generatedAt: "2026-10-01T00:00:00.000Z" });
  const packageB = buildEvidencePackage(certified, sourceContext, { generatedAt: "2026-10-01T00:00:00.000Z" });
  assert.strictEqual(packageA.checksum, packageB.checksum);
  assert.strictEqual(packageA.markdown, packageB.markdown);
  assert.ok(packageA.markdown.includes("## Customer Acceptance"));
  assert.ok(packageA.includedRefs.includes("doc_drill"));

  const blockedDb = {};
  createPilotAcceptance(blockedDb, context, {}, sourceContext);
  verifyAllCriteria(blockedDb);
  dispatchAcceptanceAction(blockedDb, context, { action: "request_customer_acceptance" }, sourceContext);
  dispatchAcceptanceAction(blockedDb, context, {
    action: "record_customer_acceptance",
    customerAcceptance: { status: "accepted", acceptedBy: "customer_sponsor" }
  }, sourceContext);
  dispatchAcceptanceAction(blockedDb, context, { action: "request_executive_approval" }, sourceContext);
  dispatchAcceptanceAction(blockedDb, context, {
    action: "generate_package",
    generatedAt: "2026-10-01T00:00:00.000Z"
  }, sourceContext);
  dispatchAcceptanceAction(blockedDb, context, {
    action: "record_executive_approval",
    executiveApproval: { status: "approved", approvedBy: "ceo" }
  }, sourceContext);
  assertThrowsCode(
    () => dispatchAcceptanceAction(blockedDb, context, { action: "certify" }, {
      ...sourceContext,
      pilotControl: {
        ...sourceContext.pilotControl,
        blockers: [{ description: "Rollback drill failed.", severity: "critical", status: "open" }]
      }
    }),
    "ACCEPTANCE_CERTIFICATION_BLOCKED"
  );
}

run();
console.log("production-acceptance tests passed");
