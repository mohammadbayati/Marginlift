const assert = require("assert");

const {
  CONTRACT_STATUSES,
  createMetricContract,
  freezeMetricContract,
  getContractHash,
  transitionMetricContract
} = require("../src/metric-contract");
const {
  createMetricContractRegistry,
  registerMetricContract,
  resolveMetricContract,
  resolveFrozenMetricContract,
  verifyMetricContractReference,
  validateExperimentContext
} = require("../src/metric-contract-registry");
const {
  beginPilotRequest,
  completePilotRequest,
  createPilotRequestFingerprint,
  getPilotIdempotencyRecord
} = require("../src/pilot-idempotency");

const now = "2026-08-30T00:00:00.000Z";

const baseContract = Object.freeze({
  contract_id: "mc_phase2_foundation",
  buyer_id: "buyer_phase2",
  use_case: "retention_policy",
  version: 1,
  created_at: now,
  approved_at: now,
  approved_by: "sponsor",
  data_snapshot_id: "snapshot_phase2",
  eligible_population: "eligible customers",
  exclusions: ["opt_out"],
  index_date: "assignment_date",
  analysis_population: "assigned customers",
  assignment_unit: "customer_id",
  randomization_method: "deterministic_hash",
  assignment_seed: "seed_phase2",
  holdout_percentage: 10,
  treatment_definition: "targeted offer",
  control_definition: "business as usual",
  exposure_definition: "message delivered",
  delivery_definition: "crm export",
  primary_kpi: "incremental_profit",
  secondary_kpis: ["conversion"],
  outcome_window: "30 days",
  analysis_cutoff: "2026-10-01T00:00:00.000Z",
  estimand: "intention_to_treat",
  confidence_level: 0.95,
  MDE: 1,
  minimum_sample: 100,
  margin_formula: "revenue - costs",
  incentive_cost: "crm export",
  messaging_cost: { state: "NOT_APPLICABLE", reason: "included in channel invoice" },
  channel_cost: "channel invoice",
  operational_cost: "ops model",
  contamination_policy: "control receives no treatment",
  concurrent_campaign_policy: "exclude overlap",
  missing_data_policy: "fail closed",
  guardrails: ["refund_rate"],
  stopping_rule: "close after outcome window",
  finance_owner: "finance",
  CRM_owner: "crm",
  data_owner: "data",
  outcome_owner: "analytics"
});

function frozenContract(patch = {}) {
  return freezeMetricContract(transitionMetricContract(createMetricContract({ ...baseContract, ...patch }), CONTRACT_STATUSES.APPROVED));
}

function runRegistryTests() {
  const db = {};
  const registry = createMetricContractRegistry(db);
  const frozen = frozenContract();
  const registered = registerMetricContract(registry, frozen);

  assert.strictEqual(registered.contract_id, frozen.contract_id);
  assert.strictEqual(registered.version, 1);
  assert.strictEqual(registered.contract_hash, getContractHash(frozen));

  const resolved = resolveMetricContract(registry, frozen.contract_id, 1);
  assert.strictEqual(resolved.found, true);
  assert.strictEqual(resolved.contract.contract_hash, frozen.contract_hash);

  const frozenResolved = resolveFrozenMetricContract(registry, frozen.contract_id);
  assert.strictEqual(frozenResolved.found, true);
  assert.strictEqual(frozenResolved.contract.status, "FROZEN");

  const verified = verifyMetricContractReference(registry, {
    contract_id: frozen.contract_id,
    version: frozen.version,
    contract_hash: frozen.contract_hash
  });
  assert.strictEqual(verified.valid, true);

  const mismatch = verifyMetricContractReference(registry, {
    contract_id: frozen.contract_id,
    version: frozen.version,
    contract_hash: "sha256:forged"
  });
  assert.strictEqual(mismatch.valid, false);
  assert.ok(mismatch.blocking_reasons.includes("INT_CONTRACT_HASH_MISMATCH"));

  const unresolved = verifyMetricContractReference(registry, {
    contract_id: "missing",
    version: 1,
    contract_hash: frozen.contract_hash
  });
  assert.strictEqual(unresolved.valid, false);
  assert.ok(unresolved.blocking_reasons.includes("INT_CONTRACT_UNRESOLVED"));
}

function runExperimentContextTests() {
  const db = {};
  const registry = createMetricContractRegistry(db);
  const frozen = registerMetricContract(registry, frozenContract());
  const clean = validateExperimentContext({
    registry,
    metricContract: frozen,
    pilot: {
      id: "pilot_1",
      metricContractId: frozen.contract_id,
      metricContractVersion: frozen.version,
      metricContractHash: frozen.contract_hash,
      dataSnapshotId: frozen.data_snapshot_id,
      experimentId: "exp_1"
    },
    experiment: {
      id: "exp_1",
      metric_contract_id: frozen.contract_id,
      metric_contract_version: frozen.version,
      metric_contract_hash: frozen.contract_hash,
      data_snapshot_id: frozen.data_snapshot_id,
      buyer_id: frozen.buyer_id,
      use_case: frozen.use_case,
      assignment_unit: frozen.assignment_unit,
      estimand: frozen.estimand,
      outcome_window: frozen.outcome_window,
      analysis_cutoff: frozen.analysis_cutoff
    }
  });
  assert.strictEqual(clean.valid, true);

  const mismatch = validateExperimentContext({
    registry,
    metricContract: frozen,
    pilot: {
      id: "pilot_1",
      metricContractId: frozen.contract_id,
      metricContractVersion: frozen.version,
      metricContractHash: frozen.contract_hash,
      dataSnapshotId: "wrong_snapshot",
      experimentId: "exp_2"
    },
    experiment: {
      id: "exp_1",
      metric_contract_id: frozen.contract_id,
      metric_contract_version: 99,
      metric_contract_hash: "sha256:forged",
      data_snapshot_id: frozen.data_snapshot_id,
      buyer_id: "wrong_buyer",
      use_case: frozen.use_case,
      assignment_unit: "account_id",
      estimand: frozen.estimand,
      outcome_window: frozen.outcome_window,
      analysis_cutoff: frozen.analysis_cutoff
    }
  });
  assert.strictEqual(mismatch.valid, false);
  assert.ok(mismatch.blocking_reasons.includes("INT_EXPERIMENT_LINEAGE_MISMATCH"));
  assert.ok(mismatch.blocking_reasons.includes("INT_DATA_SNAPSHOT_MISMATCH"));
  assert.ok(mismatch.blocking_reasons.includes("INT_CONTRACT_HASH_MISMATCH"));
  assert.ok(mismatch.blocking_reasons.includes("INT_BUYER_CONTEXT_MISMATCH"));
  assert.ok(mismatch.blocking_reasons.includes("INT_ASSIGNMENT_CONTEXT_MISMATCH"));
}

function runIdempotencyTests() {
  const db = {};
  const requestPayload = {
    organizationId: "org_1",
    metric_contract_id: "mc_1",
    metric_contract_version: 1,
    requested_stage: "experiment_running"
  };
  const samePayloadDifferentOrder = {
    requested_stage: "experiment_running",
    metric_contract_version: 1,
    metric_contract_id: "mc_1",
    organizationId: "org_1"
  };

  assert.strictEqual(
    createPilotRequestFingerprint(requestPayload),
    createPilotRequestFingerprint(samePayloadDifferentOrder)
  );

  const first = beginPilotRequest(db, {
    idempotencyKey: "idem_1",
    requestPayload,
    scope: "org_1",
    now
  });
  assert.strictEqual(first.allowed, true);
  assert.strictEqual(first.replay, false);

  completePilotRequest(db, first, {
    status: "created",
    pilot_id: "pilot_1"
  }, "2026-08-30T00:01:00.000Z");

  const retry = beginPilotRequest(db, {
    idempotencyKey: "idem_1",
    requestPayload: samePayloadDifferentOrder,
    scope: "org_1",
    now: "2026-08-30T00:02:00.000Z"
  });
  assert.strictEqual(retry.allowed, true);
  assert.strictEqual(retry.replay, true);
  assert.strictEqual(retry.result.pilot_id, "pilot_1");

  const conflict = beginPilotRequest(db, {
    idempotencyKey: "idem_1",
    requestPayload: { ...requestPayload, metric_contract_version: 2 },
    scope: "org_1",
    now: "2026-08-30T00:03:00.000Z"
  });
  assert.strictEqual(conflict.allowed, false);
  assert.ok(conflict.blocking_reasons.includes("PILOT_IDEMPOTENCY_CONFLICT"));

  const blocked = beginPilotRequest(db, {
    idempotencyKey: "idem_blocked",
    requestPayload,
    scope: "org_1",
    now
  });
  completePilotRequest(db, blocked, {
    status: "blocked",
    blocking_reasons: ["PILOT_CONTRACT_NOT_FROZEN"]
  }, now);
  const blockedRetry = beginPilotRequest(db, {
    idempotencyKey: "idem_blocked",
    requestPayload,
    scope: "org_1",
    now
  });
  assert.strictEqual(blockedRetry.replay, true);
  assert.strictEqual(blockedRetry.result.status, "blocked");

  const missingKey = beginPilotRequest(db, {
    requestPayload,
    scope: "org_1",
    now
  });
  assert.strictEqual(missingKey.allowed, false);
  assert.ok(missingKey.blocking_reasons.includes("PILOT_IDEMPOTENCY_KEY_MISSING"));

  const record = getPilotIdempotencyRecord(db, "org_1", "idem_1");
  assert.strictEqual(record.result.pilot_id, "pilot_1");
}

runRegistryTests();
runExperimentContextTests();
runIdempotencyTests();

console.log("phase2 foundation tests passed");
