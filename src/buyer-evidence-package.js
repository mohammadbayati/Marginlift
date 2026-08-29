const crypto = require("crypto");
const { authorizeBuyerClaim, serializeBuyerClaims, CLAIM_TYPES } = require("./buyer-claim-authority");

const PACKAGE_VERSION = "buyer_evidence_package_v1";
const STATUSES = Object.freeze({ DRAFT: "DRAFT", COMPLETE: "COMPLETE", COMPLETE_WITH_LIMITATIONS: "COMPLETE_WITH_LIMITATIONS", BLOCKED: "BLOCKED", INVALIDATED: "INVALIDATED" });

function buildBuyerEvidencePackage(input = {}) {
  const trust = input.buyerReadoutTrust || {};
  const assessment = input.integrityAssessment || {};
  const contract = input.metricContract || input.pilotControl?.metricContractSnapshot || null;
  const finance = input.financialProvenance || input.businessImpact?.financialProvenance || {};
  const blocked = trust.trust_status === "UNRESOLVED" || trust.trust_status === "BLOCKED" || trust.trust_status === "INVALIDATED" || !assessment.assessment_id;
  const invalidated = trust.trust_status === "INVALIDATED" || assessment.overall_status === "INVALIDATED";
  const limitations = [...new Set([...(trust.limitations || []), ...(assessment.blocking_reasons || []).map(item => item.reason_code || item)])];
  const claims = [
    { claimType: CLAIM_TYPES.CAUSAL_EFFECT, value: input.outcome?.summary?.primaryEstimate ?? input.outcome?.primaryEstimate ?? null },
    { claimType: CLAIM_TYPES.INCREMENTAL_REVENUE, value: input.businessImpact?.realizedImpact?.measuredImpact ?? null },
    { claimType: CLAIM_TYPES.INCREMENTAL_PROFIT, value: input.businessImpact?.roi?.netValue ?? input.customerAnalysis?.summary?.expectedIncrementalProfit ?? null },
    { claimType: CLAIM_TYPES.SCALE_RECOMMENDATION, value: "SCALE" },
    { claimType: CLAIM_TYPES.MODIFY_RECOMMENDATION, value: "MODIFY" },
    { claimType: CLAIM_TYPES.STOP_RECOMMENDATION, value: "STOP" }
  ];
  const claimRegister = serializeBuyerClaims({ claims, buyerTrust: trust, format: "json" }).claims;
  const recommendation = chooseRecommendation(trust, assessment);
  const packageStatus = invalidated ? STATUSES.INVALIDATED : blocked ? STATUSES.BLOCKED : limitations.length ? STATUSES.COMPLETE_WITH_LIMITATIONS : STATUSES.COMPLETE;
  const pkg = {
    package_id: input.packageId || `bep_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`,
    package_version: PACKAGE_VERSION,
    generated_at: input.generatedAt || new Date().toISOString(),
    generated_by: input.generatedBy || "system",
    package_status: packageStatus,
    executive_decision: { decision: recommendation.decision, evidence_level: trust.evidence_level || "OBSERVED", verification_status: trust.verification_status || "BLOCKED", primary_reason: recommendation.reason, strongest_supporting_evidence: recommendation.support, biggest_limitation: limitations[0] || null, next_required_action: recommendation.next_action },
    evidence_level: trust.evidence_level || "OBSERVED",
    verification_status: trust.verification_status || "BLOCKED",
    trust_status: trust.trust_status || "UNRESOLVED",
    buyer_context: { buyer_id: contract?.buyer_id || null, use_case: contract?.use_case || input.useCase || null },
    metric_contract: contract ? summarizeContract(contract) : null,
    experiment_design: input.experiment ? summarizeExperiment(input.experiment) : null,
    data_readiness: input.dataReadiness || { status: "DATA_NOT_READY", missing_fields: ["canonical assessment"] },
    population_summary: input.populationSummary || null,
    assignment_summary: input.assignmentSummary || null,
    exposure_delivery_summary: input.exposureDeliverySummary || null,
    contamination_summary: input.contaminationSummary || null,
    integrity_summary: summarizeIntegrity(assessment),
    statistical_summary: input.statisticalSummary || null,
    outcome_summary: input.outcomeSummary || input.outcome?.summary || null,
    financial_summary: summarizeFinancial(input.businessImpact, finance, trust),
    guardrail_summary: input.guardrailSummary || null,
    claim_summary: { claims: claimRegister, claims_we_can_make: claimRegister.filter(item => item.allowed), claims_we_cannot_make: claimRegister.filter(item => !item.allowed) },
    recommendation,
    limitations,
    unresolved_items: trust.blocking_reasons || [],
    lineage: { package_id: input.packageId || null, metric_contract_id: trust.contract_lineage?.id || contract?.contract_id || null, metric_contract_version: trust.contract_lineage?.version || contract?.version || null, metric_contract_hash: trust.contract_lineage?.hash || contract?.contract_hash || null, pilot_id: input.pilotId || null, experiment_id: input.experimentId || null, integrity_assessment_id: trust.assessment_reference?.id || assessment.assessment_id || null, integrity_assessment_version: trust.assessment_reference?.version || assessment.assessment_version || null, integrity_assessment_hash: trust.assessment_reference?.hash || assessment.assessment_hash || null, data_snapshot_id: input.dataSnapshotId || contract?.data_snapshot_id || null, financial_provenance_reference: finance.formula_id || null, claim_authority_version: "buyer-claim-authority-v1" }
  };
  pkg.package_hash = hashPackage(pkg);
  return pkg;
}

function buildBuyerEvidenceMarkdown(pkg) {
  const c = pkg.claim_summary?.claims || [];
  const lines = ["# MarginLift Buyer Evidence Package", "", `Package status: ${pkg.package_status}`, `Trust status: ${pkg.trust_status}`, `Evidence level: ${pkg.evidence_level}`, "", "## Executive Decision", `- Decision: ${pkg.executive_decision.decision}`, `- Reason: ${pkg.executive_decision.primary_reason}`, `- Next action: ${pkg.executive_decision.next_required_action}`, "", "## What Was Tested", `- Use case: ${pkg.buyer_context.use_case || "not specified"}`, `- Contract: ${pkg.metric_contract?.contract_id || "unresolved"}`, "", "## Data Readiness", `- Status: ${pkg.data_readiness.status || "DATA_NOT_READY"}`, `- Missing: ${(pkg.data_readiness.missing_fields || []).join(", ") || "none"}`, "", "## Experiment Integrity", `- Status: ${pkg.integrity_summary.overall_status || "NOT_EVALUATED"}`, `- Assessment: ${pkg.lineage.integrity_assessment_id || "unresolved"}`, "", "## Results", JSON.stringify(pkg.outcome_summary || {}, null, 2), "", "## Financial Impact", `- Status: ${pkg.financial_summary.verification_status}`, `- Observed value: ${pkg.financial_summary.observed_value ?? "unavailable"}`, "", "## Claim Register", ...c.map(item => `- ${item.claim_type}: ${item.allowed ? item.display_value : "unverified / unavailable"} — ${item.verification_status}`), "", "## Limitations", ...(pkg.limitations.length ? pkg.limitations.map(item => `- ${item}`) : ["- none recorded"]), "", "## Audit Lineage", `- Package hash: ${pkg.package_hash}`, `- Contract hash: ${pkg.lineage.metric_contract_hash || "unresolved"}`, `- Assessment hash: ${pkg.lineage.integrity_assessment_hash || "unresolved"}`, `- Generated at: ${pkg.generated_at}`];
  return `${lines.join("\n")}\n`;
}

function chooseRecommendation(trust, assessment) {
  if (assessment.overall_status === "INVALIDATED") return { decision: "RE_RUN_EXPERIMENT", reason: "Experiment integrity is invalidated.", support: "Integrity assessment", next_action: "Fix execution and rerun the experiment." };
  if (assessment.overall_status === "BLOCKED" || !trust.trust_status || trust.trust_status === "UNRESOLVED") return { decision: "NO_VERIFIED_DECISION", reason: "Canonical trust is unresolved or blocked.", support: "Trust gate", next_action: "Resolve evidence blockers before making a business decision." };
  if (trust.claim_permissions?.can_recommend_scale) return { decision: "SCALE", reason: "Canonical permission authorizes scale.", support: "Verified claim permissions", next_action: "Scale under the approved guardrails." };
  if (trust.claim_permissions?.can_recommend_stop) return { decision: "STOP", reason: "Canonical permission authorizes stop.", support: "Verified claim permissions", next_action: "Stop the policy and document the outcome." };
  if (trust.claim_permissions?.can_recommend_modify) return { decision: "MODIFY", reason: "Canonical permission authorizes modification.", support: "Experiment evidence", next_action: "Modify and collect additional evidence." };
  return { decision: "COLLECT_MORE_EVIDENCE", reason: "Evidence is insufficient for a verified decision.", support: "Integrity limitations", next_action: "Collect more evidence." };
}
function summarizeContract(c) { return { contract_id:c.contract_id, version:c.version, hash:c.contract_hash, use_case:c.use_case, eligible_population:c.eligible_population, exclusions:c.exclusions, assignment_unit:c.assignment_unit, randomization_method:c.randomization_method, primary_kpi:c.primary_kpi, secondary_kpis:c.secondary_kpis, outcome_window:c.outcome_window, minimum_sample:c.minimum_sample, MDE:c.MDE, estimand:c.estimand, margin_formula:c.margin_formula, stopping_rule:c.stopping_rule, owners:{ finance:c.finance_owner, CRM:c.CRM_owner, data:c.data_owner, outcome:c.outcome_owner }, status:c.status }; }
function summarizeExperiment(e) { return { id:e.id || null, assignments:e.assignments?.length || 0, design:e.design || null }; }
function summarizeIntegrity(a) { return { assessment_id:a.assessment_id || null, assessment_version:a.assessment_version || null, assessment_hash:a.assessment_hash || null, overall_status:a.overall_status || "NOT_EVALUATED", checks:(a.checks || []).map(c => ({ check_id:c.check_id, status:c.status, reason_code:c.reason_code })) }; }
function summarizeFinancial(businessImpact, finance, trust) { return { observed_value:businessImpact?.realizedImpact?.measuredImpact ?? null, verification_status:trust.claim_permissions?.can_claim_incremental_profit ? "VERIFIED" : "FINANCIAL_VERIFICATION_UNAVAILABLE", provenance_status:finance.status || "UNKNOWN", formula_id:finance.formula_id || null, missing_components:finance.missing_components || [] }; }
function hashPackage(pkg) { const copy = { ...pkg }; delete copy.package_hash; return `sha256:${crypto.createHash("sha256").update(canonical(copy), "utf8").digest("hex")}`; }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`; return JSON.stringify(value); }
module.exports = { PACKAGE_VERSION, STATUSES, buildBuyerEvidenceMarkdown, buildBuyerEvidencePackage, hashPackage };
