const assert = require("assert");

const {
  EVIDENCE_LEVELS,
  FINANCIAL_STATES,
  METRIC_CONTRACT_STATUSES,
  createEvidenceMetadata,
  createFinancialProvenance,
  createMetricContract,
  createNextMetricContractVersion,
  evaluateClaimPermissions,
  transitionMetricContract,
  validateMetricContract
} = require("../src/truth-contract");

const frozenContract = Object.freeze({
  contract_id: "mc_test_001",
  buyer_id: "buyer_test",
  use_case: "retention_policy",
  status: METRIC_CONTRACT_STATUSES.FROZEN,
  version: 1,
  created_at: "2026-08-30T00:00:00.000Z",
  approved_at: "2026-08-30T01:00:00.000Z",
  approved_by: "buyer_sponsor",
  data_snapshot_id: "snapshot_001",
  eligible_population: "customers active in last 90 days",
  exclusions: "employees, fraud hold, opt-out",
  index_date: "2026-09-01",
  analysis_population: "assigned eligible customers",
  assignment_unit: "customer_id",
  randomization_method: "deterministic_hash",
  assignment_seed: "seed_v1",
  holdout_percentage: 10,
  treatment_definition: "targeted offer policy",
  control_definition: "business as usual CRM",
  exposure_definition: "message delivered in CRM",
  delivery_definition: "CRM campaign export",
  primary_kpi: "incremental_profit_per_assigned_customer",
  secondary_kpis: ["conversion_rate", "revenue_per_assigned_customer"],
  outcome_window: "30 days after exposure",
  analysis_cutoff: "2026-10-01T00:00:00.000Z",
  estimand: "intention_to_treat",
  confidence_level: 0.95,
  MDE: "3pp conversion lift",
  minimum_sample: 1000,
  margin_formula: "revenue * gross_margin_rate - incentive_cost - messaging_cost - channel_cost - operational_cost",
  incentive_cost: { value: 0, state: "EXPLICIT_ZERO", approved_by: "finance_owner" },
  messaging_cost: { value: 20, source: "crm_rate_card" },
  channel_cost: { value: 50, source: "sms_vendor" },
  operational_cost: { value: 500000, source: "finance_model" },
  contamination_policy: "control receives no campaign exposure",
  concurrent_campaign_policy: "pause overlapping lifecycle campaigns",
  missing_data_policy: "exclude rows with missing primary outcome before unblinding",
  guardrails: ["refund_rate <= 3%", "complaint_rate <= baseline"],
  stopping_rule: "complete after outcome window and minimum sample",
  finance_owner: "finance_owner",
  CRM_owner: "crm_owner",
  data_owner: "data_owner",
  outcome_owner: "analytics_owner",
  evidence_package_id: "pkg_001"
});

const validExperimentState = Object.freeze({
  state: "completed",
  assignment_valid: true,
  exposure_valid: true,
  outcome_valid: true,
  integrity_status: "pass",
  blocking_integrity_failure: false
});

function financial(overrides = {}) {
  return createFinancialProvenance({
    formula_id: "incremental_profit_v1",
    formula_version: "1.0.0",
    currency: "IRR",
    revenue_source: "outcome_export",
    margin_source: "finance_margin_table",
    incentive_cost_source: { value: 0, state: "EXPLICIT_ZERO", approved_by: "finance_owner" },
    messaging_cost_source: "sms_vendor_invoice",
    channel_cost_source: "crm_vendor_invoice",
    operational_cost_source: "finance_operating_model",
    buyer_approved_by: "finance_owner",
    buyer_approved_at: "2026-08-30T02:00:00.000Z",
    data_snapshot_id: "snapshot_001",
    as_of: "2026-08-30",
    ...overrides
  });
}

function evidence(level, overrides = {}) {
  return createEvidenceMetadata({
    evidence_level: level,
    source_type: "pilot_readout",
    metric_contract_id: frozenContract.contract_id,
    metric_contract_version: frozenContract.version,
    metric_contract_hash: validateMetricContract(frozenContract).contract_hash,
    data_snapshot_id: frozenContract.data_snapshot_id,
    experiment_id: "exp_001",
    generated_at: "2026-10-02T00:00:00.000Z",
    ...overrides
  });
}

function assertBlocks(result, reasonCode) {
  assert.strictEqual(result.blocking_reasons.includes(reasonCode), true, `${reasonCode} should block`);
}

function run() {
  const draft = createMetricContract({ buyer_id: "buyer_test", use_case: "retention_policy", version: 1 });
  const draftValidation = validateMetricContract(draft);
  assert.strictEqual(draftValidation.pilot_eligible, false);
  assertBlocks(draftValidation, "MC_NOT_FROZEN");

  const missingFinanceOwner = createMetricContract({
    ...frozenContract,
    status: METRIC_CONTRACT_STATUSES.DRAFT,
    finance_owner: ""
  });
  const ownerValidation = validateMetricContract(missingFinanceOwner, { target_status: METRIC_CONTRACT_STATUSES.APPROVED });
  assert.strictEqual(ownerValidation.valid, false);
  assertBlocks(ownerValidation, "MC_MISSING_FINANCE_OWNER");

  const approved = transitionMetricContract(
    createMetricContract({ ...frozenContract, status: METRIC_CONTRACT_STATUSES.DRAFT }),
    METRIC_CONTRACT_STATUSES.APPROVED,
    { approved_by: "buyer_sponsor", approved_at: "2026-08-30T01:00:00.000Z" }
  );
  assert.strictEqual(approved.status, METRIC_CONTRACT_STATUSES.APPROVED);
  assert.strictEqual(validateMetricContract(approved).pilot_eligible, false);

  const frozen = transitionMetricContract(approved, METRIC_CONTRACT_STATUSES.FROZEN);
  const frozenValidation = validateMetricContract(frozen);
  assert.strictEqual(frozenValidation.valid, true);
  assert.strictEqual(frozenValidation.pilot_eligible, true);
  assert.strictEqual(frozenValidation.causal_claim_eligible, true);
  assert.strictEqual(frozenValidation.financial_claim_eligible, true);
  assert.ok(frozenValidation.contract_hash.startsWith("sha256:"));

  assert.throws(
    () => transitionMetricContract(frozen, METRIC_CONTRACT_STATUSES.DRAFT),
    error => error && error.code === "MC_ILLEGAL_TRANSITION"
  );

  assert.throws(
    () => createNextMetricContractVersion(frozen, { primary_kpi: "net_revenue" }, { version: 1 }),
    error => error && error.code === "MC_VERSION_NOT_INCREMENTED"
  );
  const nextVersion = createNextMetricContractVersion(frozen, { primary_kpi: "net_revenue" }, { version: 2 });
  assert.strictEqual(nextVersion.version, 2);
  assert.strictEqual(nextVersion.previous_contract_hash, validateMetricContract(frozen).contract_hash);
  assert.notStrictEqual(validateMetricContract(nextVersion).contract_hash, validateMetricContract(frozen).contract_hash);
  assert.throws(
    () => transitionMetricContract(frozen, METRIC_CONTRACT_STATUSES.FROZEN, { patch: { primary_kpi: "net_revenue" } }),
    error => error && error.code === "MC_POST_FREEZE_MUTATION"
  );

  for (const level of [EVIDENCE_LEVELS.OBSERVED, EVIDENCE_LEVELS.SIMULATED, EVIDENCE_LEVELS.SHADOW]) {
    const permissions = evaluateClaimPermissions(frozen, evidence(level), financial(), validExperimentState);
    assert.strictEqual(permissions.can_claim_causal_effect, false);
    assert.strictEqual(permissions.can_claim_incremental_profit, false);
    assertBlocks(permissions, "EVIDENCE_LEVEL_NOT_CAUSAL");
  }

  const experimental = evaluateClaimPermissions(frozen, evidence(EVIDENCE_LEVELS.EXPERIMENTAL), financial(), validExperimentState);
  assert.strictEqual(experimental.can_claim_causal_effect, true);
  assert.strictEqual(experimental.can_claim_incremental_revenue, true);
  assert.strictEqual(experimental.can_claim_incremental_profit, false);
  assertBlocks(experimental, "EVIDENCE_NOT_VERIFIED_INCREMENTAL");

  const incompleteFinance = financial({ messaging_cost_source: "" });
  assert.strictEqual(incompleteFinance.status, FINANCIAL_STATES.FINANCIAL_INCOMPLETE);
  assert.ok(incompleteFinance.missing_components.includes("messaging_cost_source"));
  const noProfit = evaluateClaimPermissions(frozen, evidence(EVIDENCE_LEVELS.VERIFIED_INCREMENTAL), incompleteFinance, validExperimentState);
  assert.strictEqual(noProfit.can_claim_causal_effect, true);
  assert.strictEqual(noProfit.can_claim_incremental_profit, false);
  assertBlocks(noProfit, "FINANCIAL_INCOMPLETE");

  const unknownCost = financial({ channel_cost_source: null });
  assert.strictEqual(unknownCost.status, FINANCIAL_STATES.FINANCIAL_INCOMPLETE);
  assert.ok(unknownCost.missing_components.includes("channel_cost_source"));

  const explicitZero = financial({ channel_cost_source: { value: 0, state: "EXPLICIT_ZERO", approved_by: "finance_owner" } });
  assert.strictEqual(explicitZero.status, FINANCIAL_STATES.FINANCIAL_COMPLETE);

  const verified = evaluateClaimPermissions(frozen, evidence(EVIDENCE_LEVELS.VERIFIED_INCREMENTAL), financial(), validExperimentState);
  assert.strictEqual(verified.can_run_diagnostic, true);
  assert.strictEqual(verified.can_start_live_pilot, true);
  assert.strictEqual(verified.can_claim_causal_effect, true);
  assert.strictEqual(verified.can_claim_incremental_revenue, true);
  assert.strictEqual(verified.can_claim_incremental_profit, true);
  assert.strictEqual(verified.can_recommend_scale, true);
  assert.deepStrictEqual(verified.blocking_reasons, []);

  const invalidatedContract = { ...frozen, status: METRIC_CONTRACT_STATUSES.INVALIDATED };
  const invalidated = evaluateClaimPermissions(
    invalidatedContract,
    evidence(EVIDENCE_LEVELS.VERIFIED_INCREMENTAL),
    financial(),
    validExperimentState
  );
  assert.strictEqual(invalidated.can_start_live_pilot, false);
  assert.strictEqual(invalidated.can_claim_causal_effect, false);
  assert.strictEqual(invalidated.can_claim_incremental_profit, false);
  assertBlocks(invalidated, "MC_INVALIDATED");

  const legacy = createEvidenceMetadata({
    evidence_level: EVIDENCE_LEVELS.OBSERVED,
    source_type: "legacy_dashboard"
  });
  assert.strictEqual(legacy.verification_status, "LEGACY_INCOMPLETE");
  assert.strictEqual(legacy.claim_permissions.can_claim_causality, false);
  assert.strictEqual(legacy.claim_permissions.can_claim_verified_incremental_profit, false);
  assert.strictEqual(legacy.claim_permissions.requires_disclaimer, true);
}

run();
console.log("truth-contract tests passed");
