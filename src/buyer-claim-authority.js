const CLAIM_TYPES = Object.freeze({
  DESCRIPTIVE_VALUE: "DESCRIPTIVE_VALUE", OBSERVED_ASSOCIATION: "OBSERVED_ASSOCIATION", SHADOW_ESTIMATE: "SHADOW_ESTIMATE", EXPERIMENTAL_RESULT: "EXPERIMENTAL_RESULT", CAUSAL_EFFECT: "CAUSAL_EFFECT", INCREMENTAL_REVENUE: "INCREMENTAL_REVENUE", INCREMENTAL_PROFIT: "INCREMENTAL_PROFIT", VERIFIED_SAVINGS: "VERIFIED_SAVINGS", POLICY_SUPERIORITY: "POLICY_SUPERIORITY", SCALE_RECOMMENDATION: "SCALE_RECOMMENDATION", MODIFY_RECOMMENDATION: "MODIFY_RECOMMENDATION", STOP_RECOMMENDATION: "STOP_RECOMMENDATION", EXPERIMENT_INVALID: "EXPERIMENT_INVALID", MORE_EVIDENCE_REQUIRED: "MORE_EVIDENCE_REQUIRED", EXECUTION_FAILURE: "EXECUTION_FAILURE", OPERATIONAL_ACCEPTANCE: "OPERATIONAL_ACCEPTANCE", BUYER_ACCEPTANCE: "BUYER_ACCEPTANCE"
});
const PERMISSIONS = { CAUSAL_EFFECT: "can_claim_causal_effect", INCREMENTAL_REVENUE: "can_claim_incremental_revenue", INCREMENTAL_PROFIT: "can_claim_incremental_profit", VERIFIED_SAVINGS: "can_claim_incremental_profit", POLICY_SUPERIORITY: "can_claim_causal_effect", SCALE_RECOMMENDATION: "can_recommend_scale", MODIFY_RECOMMENDATION: "can_recommend_modify", STOP_RECOMMENDATION: "can_recommend_stop" };
function authorizeBuyerClaim({ claimType, value, buyerTrust = {}, context = {} } = {}) {
  const permission = PERMISSIONS[claimType] || null;
  const strong = Boolean(permission);
  const allowed = !strong ? [CLAIM_TYPES.DESCRIPTIVE_VALUE, CLAIM_TYPES.OBSERVED_ASSOCIATION, CLAIM_TYPES.SHADOW_ESTIMATE, CLAIM_TYPES.EXPERIMENTAL_RESULT, CLAIM_TYPES.EXPERIMENT_INVALID, CLAIM_TYPES.MORE_EVIDENCE_REQUIRED, CLAIM_TYPES.EXECUTION_FAILURE, CLAIM_TYPES.OPERATIONAL_ACCEPTANCE, CLAIM_TYPES.BUYER_ACCEPTANCE].includes(claimType) : buyerTrust.claim_permissions?.[permission] === true;
  return { claim_type: claimType || "UNKNOWN_STRONG_CLAIM", allowed, value: allowed ? value : null, display_value: allowed ? value : value == null ? "unavailable" : value, evidence_level: allowed ? (buyerTrust.evidence_level || "OBSERVED") : "OBSERVED", verification_status: allowed ? (buyerTrust.verification_status || "UNVERIFIED") : "UNVERIFIED", integrity_status: buyerTrust.integrity_status || "UNRESOLVED", financial_status: buyerTrust.financial_status || "UNKNOWN", permission_used: permission, assessment_id: buyerTrust.assessment_reference?.id || null, metric_contract_id: buyerTrust.contract_lineage?.id || null, metric_contract_version: buyerTrust.contract_lineage?.version || null, metric_contract_hash: buyerTrust.contract_lineage?.hash || null, limitations: buyerTrust.limitations || [], blocking_reasons: allowed ? [] : (buyerTrust.blocking_reasons || ["TRUST_CANONICAL_PERMISSION_BLOCKED"]), safe_label: allowed ? claimType : "DESCRIPTIVE_VALUE_UNVERIFIED", context };
}
function serializeBuyerClaims({ claims = [], buyerTrust = {}, format = "json" } = {}) {
  const authorized = claims.map(claim => authorizeBuyerClaim({ ...claim, buyerTrust }));
  if (format === "markdown") return authorized.map(claim => `- ${claim.safe_label}: ${claim.allowed ? claim.display_value : "unverified / unavailable"} (${claim.verification_status})`).join("\n");
  return { claims: authorized, trust: buyerTrust };
}
const BUYER_CLAIM_SURFACES = Object.freeze([
  "/api/pilot/workspace", "/api/pilot/readout.md", "/api/pilot/business-impact", "/api/pilot/acceptance", "/api/pilot/acceptance/package.md", "/api/enterprise/intelligence", "/api/enterprise/product-surface", "/api/pilot/package.md", "/api/campaigns/current/report", "/api/decision-engine/overview", "/api/finance/summary", "/api/readiness/current", "/api/pilot/evidence-package.json", "/api/pilot/evidence-package.md"
]);
module.exports = { BUYER_CLAIM_SURFACES, CLAIM_TYPES, authorizeBuyerClaim, serializeBuyerClaims };
