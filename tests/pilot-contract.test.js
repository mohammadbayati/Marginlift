const assert = require("assert");

const {
  createPilotContract,
  getCurrentPilotContract,
  updatePilotContract
} = require("../src/pilot-contract");

const context = Object.freeze({
  organizationId: "org_marginlift",
  actorId: "usr_owner",
  actorRole: "owner",
  now: "2026-08-22T00:00:00.000Z"
});

function validContractInput(overrides = {}) {
  return {
    businessObjective: "Prove that targeted retention offers improve incremental profit before enterprise rollout.",
    primaryKpi: {
      key: "incremental_profit_per_customer",
      label: "Incremental profit per assigned customer",
      baselineValue: 120000,
      targetValue: 150000,
      unit: "toman",
      direction: "increase",
      measurementMethod: "intention_to_treat",
      dataSource: "outcome_csv",
      measurementWindow: {
        type: "days_after_exposure",
        days: 30,
        startsAt: "assignment",
        endsAt: "outcome_window_close"
      }
    },
    guardrails: [
      { metric: "refund_rate", threshold: "<= 3%", status: "draft" }
    ],
    ownership: {
      sponsor: "CRO",
      businessOwner: "Lifecycle Lead",
      dataOwner: "Data Lead",
      financeOwner: "Finance Lead",
      marginliftOwner: "MarginLift Principal"
    },
    decisionDeadline: "2026-09-22T00:00:00.000Z",
    ...overrides
  };
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

function run() {
  const emptyDb = {};
  const fallback = getCurrentPilotContract(emptyDb, context);
  assert.strictEqual(fallback.persisted, false);
  assert.strictEqual(fallback.organizationId, context.organizationId);
  assert.strictEqual(fallback.lifecycleStatus, "draft");

  const db = {};
  const created = createPilotContract(db, context, validContractInput());
  assert.strictEqual(created.persisted, true);
  assert.strictEqual(created.organizationId, context.organizationId);
  assert.strictEqual(created.lifecycleStatus, "draft");
  assert.strictEqual(created.primaryKpi.measurementWindow.days, 30);
  assert.strictEqual(created.approval.status, "draft");
  assert.ok(created.auditEvents.some(event => event.action === "contract_created"));

  assertThrowsCode(
    () => createPilotContract(db, context, validContractInput()),
    "ACTIVE_PILOT_CONTRACT_EXISTS"
  );

  const approved = updatePilotContract(db, context, {
    lifecycleStatus: "approved",
    metadata: { reason: "Pilot decision contract accepted by sponsor." }
  });
  assert.strictEqual(approved.lifecycleStatus, "approved");
  assert.strictEqual(approved.approval.status, "approved");
  assert.strictEqual(approved.approval.approvedBy, context.actorId);
  assert.ok(approved.approval.approvalHistory.some(event => event.action === "approval_status_changed"));
  assert.ok(approved.auditEvents.some(event => event.action === "lifecycle_transition" && event.from === "draft" && event.to === "approved"));

  assertThrowsCode(
    () => updatePilotContract(db, context, { lifecycleStatus: "outcome_review" }),
    "INVALID_LIFECYCLE_TRANSITION"
  );

  const locked = updatePilotContract(db, context, {
    lifecycleStatus: "locked",
    metadata: { reason: "Baseline, target, and guardrails frozen before execution." }
  });
  assert.strictEqual(locked.lifecycleStatus, "locked");
  assert.strictEqual(locked.approval.status, "locked");

  assertThrowsCode(
    () => updatePilotContract(db, context, {
      businessObjective: "Change the pilot objective after lock."
    }),
    "PILOT_CONTRACT_LOCKED"
  );
  assertThrowsCode(
    () => updatePilotContract(db, context, {
      primaryKpi: { targetValue: 175000 }
    }),
    "PILOT_CONTRACT_LOCKED"
  );
  assertThrowsCode(
    () => updatePilotContract(db, context, {
      guardrails: [{ metric: "refund_rate", threshold: "<= 5%", status: "draft" }]
    }),
    "PILOT_CONTRACT_LOCKED"
  );

  const running = updatePilotContract(db, context, { lifecycleStatus: "experiment_running" });
  assert.strictEqual(running.lifecycleStatus, "experiment_running");
  const review = updatePilotContract(db, context, { lifecycleStatus: "outcome_review" });
  assert.strictEqual(review.lifecycleStatus, "outcome_review");
  const closed = updatePilotContract(db, context, { lifecycleStatus: "closed" });
  assert.strictEqual(closed.lifecycleStatus, "closed");

  const otherContext = { ...context, organizationId: "org_other" };
  assert.strictEqual(getCurrentPilotContract(db, otherContext).persisted, false);
  assertThrowsCode(
    () => createPilotContract(db, context, validContractInput({ organizationId: "org_other" })),
    "CROSS_ORGANIZATION_CONTRACT_ACCESS"
  );
}

run();
console.log("pilot-contract tests passed");
