const assert = require("assert");

const {
  CLAIM_PERMISSION,
  CONTRACT_STATUSES,
  EVIDENCE_LEVELS,
  FINANCIAL_STATES,
  createEvidenceMetadata,
  createMetricContract,
  createNextMetricContractVersion,
  evaluateClaimPermissions,
  freezeMetricContract,
  getContractHash,
  normalizeFinancialProvenance,
  transitionMetricContract,
  validateFinancialProvenance,
  validateMetricContract
} = require("../src/metric-contract");

const now = "2026-08-30T00:00:00.000Z";

function completeContract(overrides = {}) {
  return createMetricContract({
    contract_id: "mc_test",
    buyer_id: "buyer_synthetic",
    use_case: "fintech-crm-reuse",
    version: 1,
    created_at: now,
    data_snapshot_id: "snapshot_1",
    eligible_population: "Active customers eligible for CRM reuse offer",
    exclusions: ["opt_out", "active_dispute"],
    index_date: "2026-09-01",
    analysis_population: "Assigned customers with closed outcome window",
    assignment_unit: "customer_id",
    randomization_method: "deterministic_hash",
    assignment_seed: "seed:test:1",
    holdout_percentage: 10,
    treatment_definition: "MarginLift recommended CRM action",
    control_definition: "No incremental CRM incentive",
    exposure_definition: "Message delivered through CRM",
    delivery_definition: "Batch export to CRM before campaign start",
    primary_kpi: "incremental_profit_per_assigned_customer",
    secondary_kpis: ["conversion_rate", "revenue_per_assigned_customer"],
    outcome_window: { type: "days_after_exposure", days: 30 },
    analysis_cutoff: "2026-10-01T00:00:00.000Z",
    estimand: "intention_to_treat_policy_vs_control",
    confidence_level: 0.95,
    MDE: { value: 50000, unit: "toman_per_customer" },
    minimum_sample: { per_arm: 1000 },
    margin_formula: "outcome_revenue * gross_margin_rate - incentive_cost - messaging_cost - channel_cost - operational_cost",
    incentive_cost: { source: "crm_export", required: true },
    messaging_cost: { amount: 0, source: "buyer_declared_zero", buyer_approved_by: "finance_lead", buyer_approved_at: now },
    channel_cost: { source: "crm_platform_invoice", required: true },
    operational_cost: { amount: 0, source: "buyer_declared_zero", buyer_approved_by: "finance_lead", buyer_approved_at: now },
    contamination_policy: "control customers must not receive treatment message",
    concurrent_campaign_policy: "exclude overlapping retention campaigns",
    missing_data_policy: "fail row and report missingness",
    guardrails: ["revenue_non_inferiority", "contact_frequency_cap"],
    stopping_rule: "analyze once after outcome window closes",
    finance_owner: "finance_lead",
    CRM_owner: "crm_lead",
    data_owner: "data_lead",
    outcome_owner: "analytics_lead",
    approved_by: "growth_sponsor",
    approved_at: now,
    evidence_package_id: "evidence_pkg_1",
    ...overrides
  });
}

function completeFinance(overrides = {}) {
  return normalizeFinancialProvenance({
    formula_id: "profit_formula",
    formula_version: "v1",
    currency: "IRR",
    revenue_source: "outcome_csv",
    margin_source: "finance_margin_table",
    incentive_cost_source: "crm_cost_export",
    messaging_cost_source: "buyer_declared_zero",
    channel_cost_source: "crm_platform_invoice",
    operational_cost_source: "buyer_declared_zero",
    buyer_approved_by: "finance_lead",
    buyer_approved_at: now,
    data_snapshot_id: "snapshot_1",
    as_of: now,
    missing_components: [],
    assumptions: [],
    explicit_zero_components: ["messaging_cost", "operational_cost"],
    ...overrides
  });
}

function validFrozenContract() {
  return freezeMetricContract(transitionMetricContract(completeContract(), CONTRACT_STATUSES.APPROVED));
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

function run() {
  const draft = completeContract({ approved_by: "", approved_at: "" });
  let validation = validateMetricContract(draft);
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.pilot_eligible, false);
  assert.ok(validation.errors.includes("MC_NOT_FROZEN"));

  assertThrowsCode(() => transitionMetricContract(draft, CONTRACT_STATUSES.FROZEN), "MC_ILLEGAL_TRANSITION");
  const withoutFinanceOwner = completeContract({ finance_owner: "" });
  assert.ok(validateMetricContract(withoutFinanceOwner, { target_status: CONTRACT_STATUSES.APPROVED }).ownership_gaps.includes("MC_MISSING_FINANCE_OWNER"));

  const approved = transitionMetricContract(completeContract(), CONTRACT_STATUSES.APPROVED);
  assert.strictEqual(approved.status, CONTRACT_STATUSES.APPROVED);
  assert.strictEqual(validateMetricContract(approved).pilot_eligible, false);

  const frozen = freezeMetricContract(approved);
  validation = validateMetricContract(frozen);
  assert.strictEqual(frozen.status, CONTRACT_STATUSES.FROZEN);
  assert.strictEqual(validation.pilot_eligible, true);
  assert.strictEqual(validation.causal_claim_eligible, true);
  assert.ok(frozen.contract_hash.startsWith("sha256:"));
  assert.ok(frozen.frozen_material_hash.startsWith("sha256:"));

  const completed = transitionMetricContract(frozen, CONTRACT_STATUSES.COMPLETED);
  assert.strictEqual(completed.status, CONTRACT_STATUSES.COMPLETED);
  const invalidated = transitionMetricContract(frozen, CONTRACT_STATUSES.INVALIDATED);
  assert.strictEqual(validateMetricContract(invalidated).pilot_eligible, false);
  assert.ok(validateMetricContract(invalidated).errors.includes("MC_INVALIDATED"));

  assertThrowsCode(() => transitionMetricContract(completed, CONTRACT_STATUSES.APPROVED), "MC_ILLEGAL_TRANSITION");
  assertThrowsCode(() => freezeMetricContract({ ...frozen, primary_kpi: "late_changed_kpi" }), "MC_POST_FREEZE_MUTATION");

  const nextVersion = createNextMetricContractVersion(frozen, {
    primary_kpi: "incremental_revenue_per_assigned_customer"
  }, { now: "2026-08-31T00:00:00.000Z" });
  assert.strictEqual(nextVersion.status, CONTRACT_STATUSES.DRAFT);
  assert.strictEqual(nextVersion.version, 2);
  assert.strictEqual(nextVersion.previous_contract_hash, frozen.contract_hash);

  assert.strictEqual(getContractHash(frozen), getContractHash({ ...frozen }));
  assert.notStrictEqual(getContractHash(frozen), getContractHash(nextVersion));

  const notApplicableContract = completeContract({
    status: CONTRACT_STATUSES.FROZEN,
    channel_cost: { state: "NOT_APPLICABLE", reason: "Buyer uses free owned channel for this pilot." }
  });
  assert.strictEqual(validateMetricContract(notApplicableContract, { target_status: CONTRACT_STATUSES.FROZEN }).valid, true);
  const missingReasonContract = completeContract({
    status: CONTRACT_STATUSES.FROZEN,
    channel_cost: { state: "NOT_APPLICABLE" }
  });
  assert.ok(validateMetricContract(missingReasonContract, { target_status: CONTRACT_STATUSES.FROZEN }).errors.includes("MC_MISSING_CHANNEL_COST"));

  for (const level of [EVIDENCE_LEVELS.OBSERVED, EVIDENCE_LEVELS.SIMULATED, EVIDENCE_LEVELS.SHADOW]) {
    const permissions = evaluateClaimPermissions({
      metric_contract: frozen,
      evidence_metadata: createEvidenceMetadata({ evidence_level: level, metric_contract: frozen }),
      financial_provenance: completeFinance(),
      experiment_state: { assignment_valid: true, integrity_passed: true, outcome_window_closed: true }
    });
    assert.strictEqual(permissions.can_claim_causal_effect, false);
    assert.ok(permissions.blocking_reasons.includes("EVIDENCE_LEVEL_NOT_CAUSAL"));
  }

  const experimentalPermissions = evaluateClaimPermissions({
    metric_contract: frozen,
    evidence_metadata: createEvidenceMetadata({ evidence_level: EVIDENCE_LEVELS.EXPERIMENTAL, metric_contract: frozen }),
    financial_provenance: completeFinance({ margin_source: "" }),
    experiment_state: { assignment_valid: true, integrity_passed: true, outcome_window_closed: true }
  });
  assert.strictEqual(experimentalPermissions.can_claim_causal_effect, true);
  assert.strictEqual(experimentalPermissions.can_claim_incremental_profit, false);
  assert.ok(experimentalPermissions.blocking_reasons.includes("FINANCIAL_INCOMPLETE"));

  const verifiedPermissions = evaluateClaimPermissions({
    metric_contract: frozen,
    evidence_metadata: createEvidenceMetadata({ evidence_level: EVIDENCE_LEVELS.VERIFIED_INCREMENTAL, metric_contract: frozen }),
    financial_provenance: completeFinance(),
    experiment_state: { assignment_valid: true, integrity_passed: true, outcome_window_closed: true }
  });
  assert.strictEqual(verifiedPermissions.can_start_live_pilot, true);
  assert.strictEqual(verifiedPermissions.can_claim_causal_effect, true);
  assert.strictEqual(verifiedPermissions.can_claim_incremental_revenue, true);
  assert.strictEqual(verifiedPermissions.can_claim_incremental_profit, true);
  assert.ok(verifiedPermissions.claim_permissions.includes(CLAIM_PERMISSION.VERIFIED_INCREMENTAL_PROFIT));

  const shadowPermissions = evaluateClaimPermissions({
    metric_contract: draft,
    evidence_metadata: createEvidenceMetadata({ evidence_level: EVIDENCE_LEVELS.SHADOW, metric_contract: draft }),
    financial_provenance: completeFinance(),
    experiment_state: { assignment_valid: false, integrity_passed: false, outcome_window_closed: false }
  });
  assert.strictEqual(shadowPermissions.can_run_diagnostic, true);
  assert.strictEqual(shadowPermissions.can_enter_shadow, true);
  assert.strictEqual(shadowPermissions.can_start_live_pilot, false);

  assert.strictEqual(validateFinancialProvenance(completeFinance()).state, FINANCIAL_STATES.COMPLETE);
  assert.strictEqual(validateFinancialProvenance(completeFinance({ incentive_cost_source: "" })).state, FINANCIAL_STATES.INCOMPLETE);
  assert.ok(validateFinancialProvenance(completeFinance({ buyer_approved_by: "" })).state === FINANCIAL_STATES.BUYER_APPROVAL_REQUIRED);
  assert.strictEqual(validateFinancialProvenance(completeFinance({ explicit_zero_components: ["incentive_cost"] })).state, FINANCIAL_STATES.COMPLETE);

  const legacy = createEvidenceMetadata({ source_type: "legacy_record" });
  assert.strictEqual(legacy.verification_status, "LEGACY_INCOMPLETE");
  assert.strictEqual(legacy.evidence_level, EVIDENCE_LEVELS.OBSERVED);
}

run();
console.log("metric-contract tests passed");
