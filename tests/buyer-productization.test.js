const assert = require("assert");
const {
  TEMPLATES,
  REQUIRED_INPUT,
  buildSyntheticBuyerDemo,
  createBuyerMetricContract,
  evaluateBuyerReadiness,
  getBuyerUseCaseTemplate,
  listBuyerUseCaseTemplates
} = require("../src/buyer-productization");

function test(name, fn) { try { fn(); console.log(`✓ ${name}`); } catch (error) { console.error(`✗ ${name}`); throw error; } }

test("active buyer templates are discoverable and future MilliGold path is inactive", () => {
  const ids = listBuyerUseCaseTemplates().map(item => item.template_id);
  assert.deepStrictEqual(ids.sort(), ["digipay_crm_policy_optimization_v1", "miligold_second_purchase_v1"].sort());
  assert.strictEqual(TEMPLATES.miligold_repeat_purchase_continuity_future.active_for_initial_pilot, false);
});

test("DigiPay template is one-product/one-cohort and keeps buyer inputs unresolved", () => {
  const template = getBuyerUseCaseTemplate("digipay_crm_policy_optimization_v1");
  assert.deepStrictEqual(template.scope, { products: 1, cohorts: 1 });
  assert(template.action_catalog.includes("NO_ACTION"));
  assert.strictEqual(template.metric_contract_template.MDE.state, REQUIRED_INPUT.state);
  assert.strictEqual(template.control_policy, "CURRENT_CRM_POLICY");
});

test("MilliGold initial template is only first purchase to second purchase", () => {
  const template = getBuyerUseCaseTemplate("miligold_second_purchase_v1");
  assert.strictEqual(template.use_case_id, "first_purchase_to_second_purchase");
  assert(template.stop_conditions.includes("repeat_continuity_scope"));
  assert.strictEqual(template.default_outcome_window.state, REQUIRED_INPUT.state);
});

test("readiness does not fabricate buyer-dependent values", () => {
  const readiness = evaluateBuyerReadiness("digipay_crm_policy_optimization_v1", { missingData: ["customer_id_hash"] });
  assert.strictEqual(readiness.diagnostic_ready, false);
  assert(readiness.blockers.some(code => code === "DATA_CUSTOMER_ID_HASH"));
  assert(readiness.missing_owners.includes("finance_owner"));
  assert.strictEqual(readiness.recommended_next_step, "REQUEST_DATA");
});

test("frozen complete contract reaches controlled-pilot readiness through canonical validation", () => {
  const input = {
    buyer_id: "synthetic_digipay", contract_id: "synthetic_contract", version: 1, status: "FROZEN", approved_by: "synthetic_finance", approved_at: "2025-01-01T00:00:00Z",
    eligible_population: "one product cohort", exclusions: "opted out", assignment_unit: "customer_id", treatment_definition: "MARGINLIFT_POLICY", control_definition: "CURRENT_CRM_POLICY", primary_kpi: "repeat purchase", outcome_window: "30 days", finance_owner: "finance", CRM_owner: "crm", data_owner: "data", outcome_owner: "outcome",
    randomization_method: "randomized", assignment_seed: "seed", holdout_percentage: 20, exposure_definition: "message exposure", delivery_definition: "delivered", analysis_population: "assigned", estimand: "ITT", confidence_level: 0.95, MDE: 0.05, minimum_sample: 1000, margin_formula: "revenue * margin - costs", incentive_cost: "approved input", messaging_cost: "approved input", channel_cost: "approved input", operational_cost: "approved input", contamination_policy: "exclude contaminated", concurrent_campaign_policy: "declare overlaps", missing_data_policy: "report missing", stopping_rule: "fixed window", guardrails: ["complaints"], analysis_cutoff: "2025-02-01T00:00:00Z"
  };
  const readiness = evaluateBuyerReadiness("miligold_second_purchase_v1", { metricContract: createBuyerMetricContract("miligold_second_purchase_v1", input) });
  assert.strictEqual(readiness.pilot_ready, true);
  assert.strictEqual(readiness.recommended_next_step, "READY_FOR_CONTROLLED_PILOT");
});

test("synthetic demos are explicitly non-customer evidence and reuse the package builder", () => {
  const demo = buildSyntheticBuyerDemo("miligold_second_purchase_v1");
  assert.strictEqual(demo.synthetic, true);
  assert(demo.label.includes("NOT CUSTOMER EVIDENCE"));
  assert.strictEqual(demo.evidencePackageBuilder, "buildBuyerEvidencePackage");
});

console.log("Buyer productization tests passed.");
