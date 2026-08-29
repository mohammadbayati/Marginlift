const {
  CONTRACT_STATUSES,
  getContractHash,
  validateMetricContract
} = require("./metric-contract");

const CRITICAL_FIELDS = Object.freeze([
  ["buyer_id", "PILOT_MISSING_BUYER"],
  ["use_case", "PILOT_MISSING_USE_CASE"],
  ["finance_owner", "PILOT_MISSING_FINANCE_OWNER"],
  ["CRM_owner", "PILOT_MISSING_CRM_OWNER"],
  ["data_owner", "PILOT_MISSING_DATA_OWNER"],
  ["randomization_method", "PILOT_MISSING_RANDOMIZATION"],
  ["MDE", "PILOT_MISSING_MDE"],
  ["minimum_sample", "PILOT_MISSING_MIN_SAMPLE"],
  ["outcome_window", "PILOT_MISSING_OUTCOME_WINDOW"],
  ["contamination_policy", "PILOT_MISSING_CONTAMINATION_POLICY"],
  ["stopping_rule", "PILOT_MISSING_STOPPING_RULE"]
]);

function validateLivePilotCreation({ metricContract, claimPermissions, pilotInput = {}, experimentContext = {} } = {}) {
  const blocking = [];
  if (!metricContract || typeof metricContract !== "object") {
    return result(blocking.concat("PILOT_CONTRACT_MISSING"));
  }

  if (!metricContract.contract_id) blocking.push("PILOT_CONTRACT_ID_MISSING");
  if (!Number.isInteger(Number(metricContract.version))) blocking.push("PILOT_CONTRACT_VERSION_MISSING");
  if (metricContract.status === CONTRACT_STATUSES.INVALIDATED) blocking.push("PILOT_CONTRACT_INVALIDATED");
  if (metricContract.status !== CONTRACT_STATUSES.FROZEN) blocking.push("PILOT_CONTRACT_NOT_FROZEN");

  const validation = validateMetricContract(metricContract, { target_status: CONTRACT_STATUSES.FROZEN });
  if (!validation.valid) blocking.push(...validation.blocking_reasons.map(mapMetricReason));
  for (const [field, code] of CRITICAL_FIELDS) {
    if (isMissing(metricContract[field])) blocking.push(code);
  }

  const canonicalHash = getContractHash(metricContract);
  if (!metricContract.contract_hash || metricContract.contract_hash !== canonicalHash) blocking.push("PILOT_CONTRACT_HASH_MISMATCH");
  if (pilotInput.metric_contract_id && pilotInput.metric_contract_id !== metricContract.contract_id) blocking.push("PILOT_CONTRACT_ID_MISMATCH");
  if (pilotInput.metric_contract_version && Number(pilotInput.metric_contract_version) !== Number(metricContract.version)) blocking.push("PILOT_CONTRACT_VERSION_MISMATCH");
  if (pilotInput.metric_contract_hash && pilotInput.metric_contract_hash !== canonicalHash) blocking.push("PILOT_CONTRACT_HASH_MISMATCH");
  if (experimentContext.metric_contract_hash && experimentContext.metric_contract_hash !== canonicalHash) blocking.push("PILOT_CONTRACT_HASH_MISMATCH");
  if (experimentContext.metric_contract_version && Number(experimentContext.metric_contract_version) !== Number(metricContract.version)) blocking.push("PILOT_CONTRACT_VERSION_MISMATCH");

  if (!claimPermissions || claimPermissions.can_start_live_pilot !== true) blocking.push("PILOT_CLAIM_PERMISSION_BLOCKED");

  return result(blocking, {
    metric_contract_id: metricContract.contract_id || null,
    metric_contract_version: Number.isInteger(Number(metricContract.version)) ? Number(metricContract.version) : null,
    metric_contract_hash: canonicalHash,
    pilot_eligibility: validation.pilot_eligible === true && claimPermissions?.can_start_live_pilot === true
  });
}

function mapMetricReason(code) {
  const mapping = {
    MC_INVALIDATED: "PILOT_CONTRACT_INVALIDATED",
    MC_NOT_FROZEN: "PILOT_CONTRACT_NOT_FROZEN",
    MC_MISSING_FINANCE_OWNER: "PILOT_MISSING_FINANCE_OWNER",
    MC_MISSING_CRM_OWNER: "PILOT_MISSING_CRM_OWNER",
    MC_MISSING_DATA_OWNER: "PILOT_MISSING_DATA_OWNER",
    MC_MISSING_RANDOMIZATION: "PILOT_MISSING_RANDOMIZATION",
    MC_MISSING_MDE: "PILOT_MISSING_MDE",
    MC_MISSING_MIN_SAMPLE: "PILOT_MISSING_MIN_SAMPLE",
    MC_MISSING_OUTCOME_WINDOW: "PILOT_MISSING_OUTCOME_WINDOW",
    MC_MISSING_CONTAMINATION_POLICY: "PILOT_MISSING_CONTAMINATION_POLICY",
    MC_MISSING_STOPPING_RULE: "PILOT_MISSING_STOPPING_RULE"
  };
  return mapping[code] || `PILOT_CONTRACT_INVALID_${code}`;
}

function result(reasons, metadata = {}) {
  const blocking_reasons = [...new Set(reasons.filter(Boolean))];
  return {
    allowed: blocking_reasons.length === 0,
    blocking_reasons,
    warnings: [],
    metric_contract_id: metadata.metric_contract_id || null,
    metric_contract_version: metadata.metric_contract_version || null,
    metric_contract_hash: metadata.metric_contract_hash || null,
    pilot_eligibility: metadata.pilot_eligibility === true,
    validation_timestamp: new Date().toISOString()
  };
}

function isMissing(value) {
  if (value && typeof value === "object" && value.state === "NOT_APPLICABLE" && value.reason) return false;
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

module.exports = { validateLivePilotCreation };
