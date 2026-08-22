const assert = require("assert");

const {
  addBlocker,
  appendEvidence,
  calculateExecutiveReadiness,
  createPilotWorkflow,
  dispatchPilotWorkflowAction,
  getPilotWorkflow,
  normalizePilotWorkflow,
  transitionPilotStage,
  updateBlocker
} = require("../src/pilot-control-room");

const context = Object.freeze({
  organizationId: "org_marginlift",
  actorId: "usr_ops",
  actorRole: "owner",
  now: "2026-08-22T00:00:00.000Z"
});

const readyContext = Object.freeze({
  decisionContract: {
    persisted: true,
    lifecycleStatus: "locked"
  },
  readiness: {
    status: "ready"
  },
  experiment: {
    id: "exp_123",
    design: {
      randomizationEvidence: {
        verified: true
      }
    }
  },
  businessImpact: {
    persisted: true,
    financeValidation: {
      status: "verified"
    }
  }
});

function assertThrowsCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

function run() {
  const normalized = normalizePilotWorkflow({
    organizationId: context.organizationId,
    lifecycleStatus: "kickoff",
    stages: [
      { key: "kickoff", evidence: [{ label: "Kickoff notes", referenceId: "doc_1" }] }
    ],
    blockers: [
      { description: "Missing finance owner", severity: "high" }
    ]
  }, readyContext);
  assert.strictEqual(normalized.lifecycleStatus, "kickoff");
  assert.strictEqual(normalized.stages.length, 7);
  assert.strictEqual(normalized.stages.find(item => item.key === "kickoff").evidence.length, 1);
  assert.strictEqual(normalized.blockers[0].status, "open");
  assert.strictEqual(normalized.executiveReadiness.overallStatus, "ready");

  assert.deepStrictEqual(calculateExecutiveReadiness(readyContext, "kickoff"), {
    decisionContractReady: true,
    dataReady: true,
    experimentReady: true,
    financialProofReady: true,
    overallStatus: "ready"
  });

  const emptyDb = {};
  const fallback = getPilotWorkflow(emptyDb, context, readyContext);
  assert.strictEqual(fallback.persisted, false);
  assert.strictEqual(fallback.lifecycleStatus, "draft");

  const db = {};
  const created = createPilotWorkflow(db, context, {
    pilotContractId: "pdc_123",
    businessImpactLedgerId: "bil_123",
    milestones: [{ name: "Executive readout", targetDate: "2026-09-22" }]
  }, readyContext);
  assert.strictEqual(created.persisted, true);
  assert.strictEqual(created.organizationId, context.organizationId);
  assert.strictEqual(created.lifecycleStatus, "draft");
  assert.strictEqual(created.stages.find(item => item.key === "draft").status, "active");
  assert.ok(created.auditEvents.some(event => event.action === "pilot_workflow_created"));

  assertThrowsCode(
    () => createPilotWorkflow(db, context, { organizationId: "org_other" }, readyContext),
    "CROSS_ORGANIZATION_PILOT_WORKFLOW_ACCESS"
  );
  assert.strictEqual(getPilotWorkflow(db, { ...context, organizationId: "org_other" }, readyContext).persisted, false);

  assertThrowsCode(
    () => transitionPilotStage(db, context, { lifecycleStatus: "data_ready" }, readyContext),
    "INVALID_PILOT_WORKFLOW_TRANSITION"
  );

  const kickoff = transitionPilotStage(db, context, {
    lifecycleStatus: "kickoff",
    metadata: { reason: "Pilot kickoff completed." }
  }, readyContext);
  assert.strictEqual(kickoff.lifecycleStatus, "kickoff");
  assert.strictEqual(kickoff.stages.find(item => item.key === "draft").status, "completed");
  assert.ok(kickoff.auditEvents.some(event => event.action === "pilot_stage_transition" && event.from === "draft" && event.to === "kickoff"));

  const withEvidence = appendEvidence(db, context, {
    stageKey: "kickoff",
    evidence: {
      label: "Signed pilot kickoff notes",
      referenceId: "doc_kickoff"
    }
  }, readyContext);
  const kickoffEvidence = withEvidence.stages.find(item => item.key === "kickoff").evidence;
  assert.strictEqual(kickoffEvidence.length, 1);
  const firstEvidenceId = kickoffEvidence[0].id;
  const withMoreEvidence = dispatchPilotWorkflowAction(db, context, {
    action: "append_evidence",
    stageKey: "kickoff",
    evidence: {
      label: "Data owner confirmation",
      referenceId: "doc_data_owner"
    }
  }, readyContext);
  const appendedEvidence = withMoreEvidence.stages.find(item => item.key === "kickoff").evidence;
  assert.strictEqual(appendedEvidence.length, 2);
  assert.strictEqual(appendedEvidence[0].id, firstEvidenceId);
  assert.ok(withMoreEvidence.auditEvents.some(event => event.action === "pilot_evidence_appended"));

  const blocked = addBlocker(db, context, {
    description: "Finance export not delivered.",
    ownerId: "usr_finance",
    severity: "critical"
  }, readyContext);
  assert.strictEqual(blocked.blockers.length, 1);
  assert.ok(blocked.auditEvents.some(event => event.action === "pilot_blocker_added"));
  const blockerId = blocked.blockers[0].id;
  const unblocked = updateBlocker(db, context, {
    blockerId,
    updates: {
      status: "resolved"
    }
  }, readyContext);
  assert.strictEqual(unblocked.blockers[0].status, "resolved");
  assert.ok(unblocked.auditEvents.some(event => event.action === "pilot_blocker_updated"));

  const dataReady = dispatchPilotWorkflowAction(db, context, { action: "transition_stage", lifecycleStatus: "data_ready" }, readyContext);
  assert.strictEqual(dataReady.lifecycleStatus, "data_ready");
  const running = dispatchPilotWorkflowAction(db, context, { action: "transition_stage", lifecycleStatus: "experiment_running" }, readyContext);
  assert.strictEqual(running.lifecycleStatus, "experiment_running");
  const outcomePending = dispatchPilotWorkflowAction(db, context, { action: "transition_stage", lifecycleStatus: "outcome_pending" }, readyContext);
  assert.strictEqual(outcomePending.lifecycleStatus, "outcome_pending");
  const decisionReady = dispatchPilotWorkflowAction(db, context, { action: "transition_stage", lifecycleStatus: "decision_ready" }, readyContext);
  assert.strictEqual(decisionReady.lifecycleStatus, "decision_ready");
  const closed = dispatchPilotWorkflowAction(db, context, { action: "close" }, readyContext);
  assert.strictEqual(closed.lifecycleStatus, "closed");

  assertThrowsCode(
    () => dispatchPilotWorkflowAction(db, context, { action: "transition_stage", lifecycleStatus: "kickoff" }, readyContext),
    "INVALID_PILOT_WORKFLOW_TRANSITION"
  );
  assertThrowsCode(
    () => dispatchPilotWorkflowAction(db, context, { action: "unknown_action" }, readyContext),
    "UNSUPPORTED_PILOT_WORKFLOW_ACTION"
  );
}

run();
console.log("pilot-control-room tests passed");
