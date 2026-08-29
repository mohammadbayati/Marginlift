const { getLatestIntegrityAssessment, verifyAssessmentHash } = require("./pilot-integrity-store");

function resolveBuyerReadoutTrust({ db = {}, pilotId = null, experimentId = null, contractRegistry = null, contract = null, evidenceMetadata = {}, financialProvenance = {}, readoutTimestamp = null } = {}) {
  const assessment = getLatestIntegrityAssessment(db, pilotId, experimentId);
  const blocking = [];
  if (!assessment) blocking.push("INT_ASSESSMENT_UNRESOLVED");
  else if (!verifyAssessmentHash(assessment)) blocking.push("INT_ASSESSMENT_HASH_MISMATCH");
  else if (contract && (assessment.metric_contract_id !== contract.contract_id || Number(assessment.metric_contract_version) !== Number(contract.version) || assessment.metric_contract_hash !== contract.contract_hash)) blocking.push("TRUST_ASSESSMENT_LINEAGE_MISMATCH");
  const stale = Boolean(readoutTimestamp && assessment?.assessed_at && new Date(assessment.assessed_at) > new Date(readoutTimestamp));
  if (contractRegistry && contract) {
    const resolved = contractRegistry.verify ? contractRegistry.verify({ contract_id: contract.contract_id, version: contract.version, contract_hash: contract.contract_hash }) : null;
    if (resolved && !resolved.valid) blocking.push(...(resolved.blocking_reasons || ["INT_CONTRACT_LINEAGE_MISMATCH"]));
  }
  const permissions = assessment?.claim_permissions || { can_claim_causal_effect: false, can_claim_incremental_revenue: false, can_claim_incremental_profit: false, can_recommend_scale: false, can_recommend_modify: false, can_recommend_stop: false };
  const currentStatus = blocking.length ? "BLOCKED" : stale ? "STALE" : assessment.overall_status;
  return {
    trust_status: currentStatus === "READY" ? "TRUSTED" : currentStatus === "READY_WITH_WARNINGS" ? "TRUSTED_WITH_LIMITATIONS" : currentStatus === "STALE" ? "STALE" : blocking.length ? "UNRESOLVED" : currentStatus === "INVALIDATED" ? "INVALIDATED" : "BLOCKED",
    verification_status: currentStatus === "READY" || currentStatus === "READY_WITH_WARNINGS" ? (stale ? "STALE" : "CURRENT_VALID") : "BLOCKED",
    integrity_status: currentStatus,
    evidence_level: currentStatus === "READY" || currentStatus === "READY_WITH_WARNINGS" ? (evidenceMetadata.evidence_level || "EXPERIMENTAL") : "OBSERVED",
    claim_permissions: blocking.length ? { ...permissions, can_claim_causal_effect: false, can_claim_incremental_revenue: false, can_claim_incremental_profit: false, can_recommend_scale: false } : permissions,
    contract_lineage: assessment ? { id: assessment.metric_contract_id, version: assessment.metric_contract_version, hash: assessment.metric_contract_hash } : null,
    assessment_reference: assessment ? { id: assessment.assessment_id, version: assessment.assessment_version, hash: assessment.assessment_hash } : null,
    financial_status: financialProvenance.status || "UNKNOWN",
    limitations: assessment?.checks?.filter(check => check.status !== "PASS").map(check => check.reason_code).filter(Boolean) || [],
    allowed_claims: Object.entries(permissions).filter(([, value]) => value === true).map(([key]) => key),
    blocked_claims: Object.entries(permissions).filter(([, value]) => value !== true).map(([key]) => key),
    assessment_freshness: stale ? "STALE" : "CURRENT",
    warnings: assessment?.warnings?.map(item => item.reason_code).filter(Boolean) || [],
    blocking_reasons: [...new Set([...blocking, ...(assessment?.blocking_reasons || [])])]
  };
}

const STRONG_CLAIM_KEYS = new Set(["verifiedFinancialProofCount", "totalRealizedValue", "totalNetValue", "verifiedImpactRate", "incrementalRevenue", "incrementalProfit", "expectedIncrementalProfit", "verifiedSavings", "policySuperiority", "recommendation", "decision"]);
function applyBuyerReadoutTrust(payload, trust) {
  const blocked = !(trust?.claim_permissions?.can_claim_causal_effect === true);
  const result = { ...payload, buyerReadoutTrust: trust };
  if (!blocked) return result;
  for (const key of ["verified", "causal", "incremental", "accepted", "integrity_status", "claim_permission"]) {
    if (Object.prototype.hasOwnProperty.call(result, key)) result[key] = false;
  }
  return { ...result, verified_claims_suppressed: true, blocked_claims: trust.blocking_reasons || ["TRUST_CANONICAL_PERMISSION_BLOCKED"] };
}

module.exports = { applyBuyerReadoutTrust, resolveBuyerReadoutTrust };
