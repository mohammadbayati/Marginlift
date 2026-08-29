const { getLatestIntegrityAssessment, verifyAssessmentHash } = require("./pilot-integrity-store");

function resolveBuyerReadoutTrust({ db = {}, pilotId = null, experimentId = null, contractRegistry = null, contract = null, evidenceMetadata = {}, financialProvenance = {} } = {}) {
  const assessment = getLatestIntegrityAssessment(db, pilotId, experimentId);
  const blocking = [];
  if (!assessment) blocking.push("INT_ASSESSMENT_UNRESOLVED");
  else if (!verifyAssessmentHash(assessment)) blocking.push("INT_ASSESSMENT_HASH_MISMATCH");
  if (contractRegistry && contract) {
    const resolved = contractRegistry.verify ? contractRegistry.verify({ contract_id: contract.contract_id, version: contract.version, contract_hash: contract.contract_hash }) : null;
    if (resolved && !resolved.valid) blocking.push(...(resolved.blocking_reasons || ["INT_CONTRACT_LINEAGE_MISMATCH"]));
  }
  const permissions = assessment?.claim_permissions || { can_claim_causal_effect: false, can_claim_incremental_revenue: false, can_claim_incremental_profit: false, can_recommend_scale: false, can_recommend_modify: false, can_recommend_stop: false };
  const currentStatus = blocking.length ? "BLOCKED" : assessment.overall_status;
  return {
    verification_status: currentStatus === "READY" || currentStatus === "READY_WITH_WARNINGS" ? "CURRENT_VALID" : "BLOCKED",
    integrity_status: currentStatus,
    evidence_level: currentStatus === "READY" || currentStatus === "READY_WITH_WARNINGS" ? (evidenceMetadata.evidence_level || "EXPERIMENTAL") : "OBSERVED",
    claim_permissions: blocking.length ? { ...permissions, can_claim_causal_effect: false, can_claim_incremental_revenue: false, can_claim_incremental_profit: false, can_recommend_scale: false } : permissions,
    contract_lineage: assessment ? { id: assessment.metric_contract_id, version: assessment.metric_contract_version, hash: assessment.metric_contract_hash } : null,
    assessment_reference: assessment ? { id: assessment.assessment_id, version: assessment.assessment_version, hash: assessment.assessment_hash } : null,
    financial_status: financialProvenance.status || "UNKNOWN",
    limitations: assessment?.checks?.filter(check => check.status !== "PASS").map(check => check.reason_code).filter(Boolean) || [],
    blocking_reasons: [...new Set([...blocking, ...(assessment?.blocking_reasons || [])])]
  };
}

module.exports = { resolveBuyerReadoutTrust };
