const { createMetricContract, validateMetricContract } = require("./metric-contract");
const { buildBuyerEvidencePackage } = require("./buyer-evidence-package");

const REQUIRED_INPUT = Object.freeze({ state: "REQUIRED_BUYER_INPUT" });

const COMMON_DATA_FIELDS = Object.freeze({
  diagnostic_required: ["customer_id_hash", "action_or_assignment", "outcome", "value"],
  pilot_required: ["customer_id_hash", "assignment", "exposure_at", "delivery_status", "outcome", "outcome_at"],
  optional: ["consent_status", "contact_count_window", "campaign_id", "channel", "cost_components"]
});
const COMMERCIAL_DELIVERABLES = Object.freeze({
  SCOPING: ["use_case_definition", "owner_map", "data_request", "proposed_kpi"],
  PAID_DIAGNOSTIC: ["data_readiness", "current_state_analysis", "financial_readiness", "experiment_feasibility", "draft_metric_contract", "diagnostic_buyer_evidence_package"],
  CONTROLLED_PILOT: ["frozen_metric_contract", "assignment_holdout_design", "prelaunch_and_live_integrity", "final_integrity_assessment", "buyer_evidence_package", "authorized_decision"]
});
const PRODUCT_BOUNDARIES = Object.freeze({ does_not: ["replace_crm", "replace_bi", "execute_every_crm_campaign", "guarantee_uplift_or_profit", "infer_causality_from_invalid_history", "require_raw_pii_for_initial_diagnostic", "promise_turnkey_vpc", "claim_enterprise_ready"], does: ["structure_decision_problem", "define_measurement", "compare_policies_under_valid_experiments", "enforce_evidence_integrity", "calculate_provenanced_economics", "produce_audit_ready_evidence_packages"] });

const TEMPLATES = Object.freeze({
  digipay_crm_policy_optimization_v1: Object.freeze({
    template_id: "digipay_crm_policy_optimization_v1", buyer_type: "DIGIPAY", use_case_id: "crm_policy_optimization",
    display_name: "DigiPay CRM Policy Optimization", objective: "Compare the current CRM policy with a selective MarginLift policy on one product and one cohort.",
    business_problem: "Determine who would return organically, who needs intervention, and whether intervention economics justify action.",
    primary_decision: "CURRENT_CRM_POLICY_VS_MARGINLIFT_POLICY", scope: { products: 1, cohorts: 1 },
    eligible_population_definition: REQUIRED_INPUT, exclusion_definition: REQUIRED_INPUT,
    required_data_schema: COMMON_DATA_FIELDS, optional_data_schema: ["risk_restriction", "product_id", "historical_experiment_assignment"],
    action_catalog: ["NO_ACTION", "LOW_COST_MESSAGE", "TARGETED_INTERVENTION", "INCENTIVE"], control_policy: "CURRENT_CRM_POLICY",
    outcome_definition: REQUIRED_INPUT, default_outcome_window: REQUIRED_INPUT,
    metric_contract_template: { use_case: "digipay_crm_policy_optimization", eligible_population: REQUIRED_INPUT, exclusions: REQUIRED_INPUT, treatment_definition: "MARGINLIFT_POLICY", control_definition: "CURRENT_CRM_POLICY", assignment_unit: REQUIRED_INPUT, randomization_method: REQUIRED_INPUT, holdout_percentage: REQUIRED_INPUT, primary_kpi: REQUIRED_INPUT, outcome_window: REQUIRED_INPUT, MDE: REQUIRED_INPUT, minimum_sample: REQUIRED_INPUT, margin_formula: REQUIRED_INPUT, incentive_cost: REQUIRED_INPUT, messaging_cost: REQUIRED_INPUT, channel_cost: REQUIRED_INPUT, operational_cost: REQUIRED_INPUT, contamination_policy: REQUIRED_INPUT, concurrent_campaign_policy: REQUIRED_INPUT, stopping_rule: REQUIRED_INPUT, finance_owner: null, CRM_owner: null, data_owner: null, outcome_owner: null },
    financial_requirements: ["margin_formula", "incentive_cost", "messaging_cost", "channel_cost", "operational_cost", "finance_owner"],
    integrity_requirements: ["holdout", "ITT", "contact_cap", "exclusions", "exposure_logging", "outcome_logging"],
    owner_requirements: ["finance_owner", "CRM_owner", "data_owner", "outcome_owner"],
    diagnostic_deliverables: ["readiness", "current_policy_map", "cost_margin_gaps", "experiment_feasibility", "draft_metric_contract", "diagnostic_evidence_package"],
    pilot_deliverables: ["frozen_metric_contract", "assignments", "integrity_assessments", "buyer_evidence_package", "authorized_decision"],
    diagnostic_workflow: ["READINESS_INTAKE", "DATA_SCHEMA_VALIDATION", "CURRENT_CRM_POLICY_MAPPING", "ELIGIBLE_POPULATION", "COST_MARGIN_CONTRACT", "HISTORICAL_OR_SHADOW_ANALYSIS", "CONTACT_CAP_ANALYSIS", "EXPERIMENT_FEASIBILITY", "DRAFT_METRIC_CONTRACT", "DIAGNOSTIC_EVIDENCE_PACKAGE", "GO_NO_GO"],
    pilot_workflow: ["SCOPING", "FROZEN_CONTRACT", "SHADOW", "PRE_LAUNCH_INTEGRITY", "LIVE_HOLDOUT", "IN_FLIGHT_INTEGRITY", "READOUT", "BUYER_EVIDENCE_PACKAGE", "AUTHORIZED_DECISION"],
    responsibility_matrix: { MarginLift: ["metric_contract_facilitation", "assignment_design", "integrity_assessment", "evidence_package", "financial_readout"], "DigiPay CRM/Growth": ["cohort_definition", "current_policy", "CRM_execution", "exposure_logging"], "DigiPay Data": ["data_extraction", "validation", "outcome_logging"], "DigiPay Finance": ["margin_formula", "cost_approval", "financial_review"], "DigiPay Risk/Security": ["security_and_processing_review"] },
    readiness_gates: ["one_product", "one_cohort", "control_holdout", "finance_approval", "contact_cap", "hashed_ids"],
    stop_conditions: ["missing_control", "missing_financial_formula", "contact_cap_violation", "integrity_invalidated"],
    limitations: ["CRM execution remains DigiPay responsibility.", "Buyer-controlled processing/VPC deployment requires security review; it is not turnkey today."], commercial_deliverables: COMMERCIAL_DELIVERABLES
  }),
  miligold_second_purchase_v1: Object.freeze({
    template_id: "miligold_second_purchase_v1", buyer_type: "MILLIGOLD", use_case_id: "first_purchase_to_second_purchase",
    display_name: "MilliGold First Purchase to Second Purchase", objective: "Determine which first-time purchasers require intervention to produce a profitable second purchase.",
    business_problem: "Separate first-to-second purchase conversion from broader repeat-purchase continuity.", primary_decision: "INTERVENTION_VS_NO_ACTION_FOR_SECOND_PURCHASE", scope: { pathways: 1, cohorts: 1 },
    eligible_population_definition: REQUIRED_INPUT, exclusion_definition: REQUIRED_INPUT,
    required_data_schema: { diagnostic_required: ["customer_id_hash", "purchase_at", "purchase_sequence", "transaction_value", "second_purchase_signal"], pilot_required: ["customer_id_hash", "assignment", "exposure_at", "delivery_status", "second_purchase_at", "transaction_value"], optional: ["discount_amount", "message_channel", "campaign_id", "consent_status", "contact_count_window"] },
    optional_data_schema: ["product_family", "margin_inputs"], action_catalog: ["NO_ACTION", "REMINDER", "TARGETED_INTERVENTION", "INCENTIVE"], control_policy: "CURRENT_CRM_POLICY",
    outcome_definition: "SECOND_PURCHASE_EVENT", default_outcome_window: REQUIRED_INPUT,
    metric_contract_template: { use_case: "miligold_first_purchase_to_second_purchase", eligible_population: REQUIRED_INPUT, exclusions: REQUIRED_INPUT, index_date: "FIRST_PURCHASE_AT", treatment_definition: REQUIRED_INPUT, control_definition: "CURRENT_CRM_POLICY_OR_NO_ACTION", assignment_unit: REQUIRED_INPUT, randomization_method: REQUIRED_INPUT, holdout_percentage: REQUIRED_INPUT, primary_kpi: "SECOND_PURCHASE_WITHIN_BUYER_CONFIRMED_WINDOW", outcome_window: REQUIRED_INPUT, MDE: REQUIRED_INPUT, minimum_sample: REQUIRED_INPUT, margin_formula: REQUIRED_INPUT, incentive_cost: REQUIRED_INPUT, messaging_cost: REQUIRED_INPUT, channel_cost: REQUIRED_INPUT, operational_cost: REQUIRED_INPUT, contamination_policy: REQUIRED_INPUT, concurrent_campaign_policy: REQUIRED_INPUT, stopping_rule: REQUIRED_INPUT, finance_owner: null, CRM_owner: null, data_owner: null, outcome_owner: null },
    financial_requirements: ["contribution_margin_formula", "discount_cost", "message_cost", "finance_owner"], integrity_requirements: ["first_purchase_definition", "second_purchase_definition", "holdout", "outcome_window_confirmation"], owner_requirements: ["finance_owner", "CRM_owner", "data_owner", "outcome_owner"],
    diagnostic_deliverables: ["purchase_sequence_validation", "window_confirmation", "financial_readiness", "experiment_feasibility", "draft_metric_contract", "diagnostic_evidence_package"], pilot_deliverables: ["frozen_metric_contract", "randomized_holdout", "integrity_assessments", "buyer_evidence_package", "authorized_decision"], readiness_gates: ["one_cohort", "one_pathway", "buyer_confirmed_window", "contribution_margin", "hashed_ids"], stop_conditions: ["repeat_continuity_scope", "missing_purchase_history", "missing_financial_formula", "integrity_invalidated"], limitations: ["Repeat-purchase continuity is a future, inactive template.", "MilliGold CRM executes interventions and records delivery/outcomes."]
    , diagnostic_workflow: ["DEFINE_FIRST_PURCHASE", "DEFINE_SECOND_PURCHASE", "CONFIRM_OUTCOME_WINDOW", "VALIDATE_EVENT_HISTORY", "VALIDATE_ACTION_HISTORY", "VALIDATE_FINANCE_INPUTS", "DEFINE_ONE_COHORT", "EXPERIMENT_FEASIBILITY", "DRAFT_METRIC_CONTRACT", "DIAGNOSTIC_EVIDENCE_PACKAGE", "GO_NO_GO"], pilot_workflow: ["FROZEN_CONTRACT", "SHADOW", "PRE_LAUNCH_INTEGRITY", "RANDOMIZED_HOLDOUT", "CRM_EXECUTION", "OUTCOME_WINDOW", "FINANCIAL_READOUT", "BUYER_EVIDENCE_PACKAGE", "AUTHORIZED_DECISION"], responsibility_matrix: { MarginLift: ["metric_contract_facilitation", "holdout_design", "integrity_assessment", "evidence_package"], "MilliGold Marketing/CRM": ["cohort_definition", "CRM_execution", "delivery_logging"], "MilliGold Data": ["event_history", "assignment_and_outcome_logging"], "MilliGold Finance": ["contribution_margin_formula", "cost_approval", "financial_review"] }, commercial_deliverables: COMMERCIAL_DELIVERABLES
  }),
  miligold_repeat_purchase_continuity_future: Object.freeze({ template_id: "miligold_repeat_purchase_continuity_future", buyer_type: "MILLIGOLD", use_case_id: "repeat_purchase_continuity", active_for_initial_pilot: false, status: "NOT_ACTIVE_FOR_INITIAL_PILOT" })
});

function listBuyerUseCaseTemplates() { return Object.values(TEMPLATES).filter(item => item.active_for_initial_pilot !== false); }
function getBuyerUseCaseTemplate(id) { return TEMPLATES[id] || null; }

function createBuyerMetricContract(templateId, buyerInput = {}) {
  const template = getBuyerUseCaseTemplate(templateId);
  if (!template || !template.metric_contract_template) throw new Error("UNKNOWN_BUYER_TEMPLATE");
  return createMetricContract({ ...template.metric_contract_template, ...buyerInput, contract_id: buyerInput.contract_id || `${templateId}_contract`, buyer_id: buyerInput.buyer_id || template.buyer_type, version: buyerInput.version || 1, status: buyerInput.status || "DRAFT" });
}

function evaluateBuyerReadiness(templateId, input = {}) {
  const template = getBuyerUseCaseTemplate(templateId);
  if (!template) return { template_id: templateId, diagnostic_ready: false, pilot_ready: false, blockers: ["UNKNOWN_BUYER_TEMPLATE"], recommended_next_step: "NO_GO" };
  const contract = input.metricContract || createBuyerMetricContract(templateId, input.buyerInput || {});
  const approval = validateMetricContract(contract, { target_status: "APPROVED" });
  const frozen = validateMetricContract(contract, { target_status: "FROZEN" });
  const missingData = (input.missingData || []).map(String);
  const missingOwners = template.owner_requirements.filter(field => !contract[field]);
  const blockers = [...new Set([...(input.blockers || []), ...missingData.map(field => `DATA_${field.toUpperCase()}`), ...missingOwners.map(field => `OWNER_${field.toUpperCase()}`), ...(frozen.blocking_reasons || [])])];
  const diagnosticReady = missingData.length === 0 && approval.missing_required_fields.length === 0;
  const pilotReady = diagnosticReady && frozen.valid && contract.status === "FROZEN";
  return { buyer_template_id: templateId, use_case_id: template.use_case_id, diagnostic_ready: diagnosticReady, pilot_ready: pilotReady, missing_data: missingData, missing_owners: missingOwners, missing_metric_contract_fields: frozen.missing_required_fields, financial_gaps: frozen.financial_gaps, experiment_gaps: frozen.experiment_gaps, security_review_required: true, blockers, warnings: template.limitations || [], recommended_next_step: pilotReady ? "READY_FOR_CONTROLLED_PILOT" : diagnosticReady ? "PROCEED_TO_DIAGNOSTIC" : "REQUEST_DATA" };
}

function buildSyntheticBuyerDemo(templateId, overrides = {}) {
  const template = getBuyerUseCaseTemplate(templateId);
  if (!template) throw new Error("UNKNOWN_BUYER_TEMPLATE");
  return { synthetic: true, label: `SYNTHETIC ${template.buyer_type}-LIKE DEMO — NOT CUSTOMER EVIDENCE`, template_id: templateId, scope: template.scope, control: template.control_policy, actions: template.action_catalog, buyerInputRequired: true, metricContract: createBuyerMetricContract(templateId, { buyer_id: `synthetic_${template.buyer_type.toLowerCase()}`, ...overrides }), evidencePackageInput: { buyerContext: { buyer_id: `synthetic_${template.buyer_type.toLowerCase()}` }, dataReadiness: { status: "DATA_READY_WITH_LIMITATIONS", missing_fields: ["buyer-approved contract values"] } }, evidencePackageBuilder: buildBuyerEvidencePackage.name };
}

module.exports = { COMMON_DATA_FIELDS, COMMERCIAL_DELIVERABLES, PRODUCT_BOUNDARIES, REQUIRED_INPUT, TEMPLATES, buildSyntheticBuyerDemo, createBuyerMetricContract, evaluateBuyerReadiness, getBuyerUseCaseTemplate, listBuyerUseCaseTemplates };
