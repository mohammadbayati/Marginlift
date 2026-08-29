const assert = require("assert");
const { createMetricContract, freezeMetricContract, transitionMetricContract, evaluateClaimPermissions, createEvidenceMetadata, normalizeFinancialProvenance } = require("../src/metric-contract");
const { validateLivePilotCreation } = require("../src/pilot-integration-gate");

const base = {
  contract_id: "mc_gate_test", buyer_id: "buyer", use_case: "retention", version: 1,
  data_snapshot_id: "snapshot", eligible_population: "eligible", exclusions: ["opt_out"],
  analysis_population: "assigned", assignment_unit: "customer_id", randomization_method: "deterministic_hash", assignment_seed: "seed",
  holdout_percentage: 10, treatment_definition: "offer", control_definition: "none", exposure_definition: "delivered", delivery_definition: "crm",
  primary_kpi: "incremental_profit", outcome_window: "30 days", analysis_cutoff: "2026-10-01", estimand: "itt", confidence_level: .95,
  MDE: 1, minimum_sample: 100, margin_formula: "revenue-cost", incentive_cost: "crm", messaging_cost: { state: "NOT_APPLICABLE", reason: "included" },
  channel_cost: "channel", operational_cost: "ops", contamination_policy: "none", concurrent_campaign_policy: "exclude",
  missing_data_policy: "fail", stopping_rule: "window", guardrails: ["refund"], finance_owner: "finance", CRM_owner: "crm", data_owner: "data", outcome_owner: "analytics",
  approved_by: "sponsor", approved_at: "2026-08-30T00:00:00.000Z"
};

function frozen() { return freezeMetricContract(transitionMetricContract(createMetricContract(base), "APPROVED")); }
function permissions(contract) {
  return evaluateClaimPermissions(contract, createEvidenceMetadata({ evidence_level: "EXPERIMENTAL", metric_contract: contract, generated_at: "2026-08-30T00:00:00.000Z" }), normalizeFinancialProvenance({ formula_id: "f", formula_version: "1", currency: "IRR", revenue_source: "r", margin_source: "m", incentive_cost_source: "i", messaging_cost_source: "msg", channel_cost_source: "c", operational_cost_source: "o", buyer_approved_by: "finance", buyer_approved_at: "2026-08-30T00:00:00.000Z", data_snapshot_id: "snapshot", as_of: "2026-08-30" }), { assignment_valid: true, exposure_valid: true, outcome_valid: true, integrity_status: "pass" });
}

const contract = frozen();
const allowed = validateLivePilotCreation({ metricContract: contract, claimPermissions: permissions(contract) });
assert.strictEqual(allowed.allowed, true);
assert.strictEqual(allowed.metric_contract_hash, contract.contract_hash);

for (const candidate of [null, { ...contract, status: "DRAFT" }, { ...contract, status: "APPROVED" }, { ...contract, status: "INVALIDATED" }]) {
  const result = validateLivePilotCreation({ metricContract: candidate, claimPermissions: permissions(contract) });
  assert.strictEqual(result.allowed, false);
}

assert.ok(validateLivePilotCreation({ metricContract: contract, claimPermissions: permissions(contract), pilotInput: { metric_contract_hash: "forged" } }).blocking_reasons.includes("PILOT_CONTRACT_HASH_MISMATCH"));
assert.ok(validateLivePilotCreation({ metricContract: contract, claimPermissions: { can_start_live_pilot: false } }).blocking_reasons.includes("PILOT_CLAIM_PERMISSION_BLOCKED"));
console.log("pilot-integration-gate tests passed");
