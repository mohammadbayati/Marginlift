const truth = require("./truth-contract");

const CONTRACT_STATUSES = truth.METRIC_CONTRACT_STATUSES;

const FINANCIAL_STATES = Object.freeze({
  COMPLETE: "FINANCIAL_COMPLETE",
  INCOMPLETE: "FINANCIAL_INCOMPLETE",
  ASSUMPTION_REQUIRED: "FINANCIAL_ASSUMPTION_REQUIRED",
  BUYER_APPROVAL_REQUIRED: "FINANCIAL_BUYER_APPROVAL_REQUIRED"
});

const CLAIM_PERMISSION = Object.freeze({
  DIAGNOSTIC: "DIAGNOSTIC",
  SHADOW: "SHADOW",
  LIVE_PILOT: "LIVE_PILOT",
  CAUSAL_EFFECT: "CAUSAL_EFFECT",
  INCREMENTAL_REVENUE: "INCREMENTAL_REVENUE",
  VERIFIED_INCREMENTAL_PROFIT: "VERIFIED_INCREMENTAL_PROFIT",
  RECOMMEND_SCALE: "RECOMMEND_SCALE",
  RECOMMEND_MODIFY: "RECOMMEND_MODIFY",
  RECOMMEND_STOP: "RECOMMEND_STOP"
});

function normalizeFinancialProvenance(input) {
  return truth.createFinancialProvenance(input);
}

function validateMetricContract(input, options = {}) {
  const result = truth.validateMetricContract(input, options);
  return {
    ...result,
    errors: result.blocking_reasons || result.errors.map(error => error.code || error)
  };
}

function validateFinancialProvenance(input) {
  const provenance = truth.createFinancialProvenance(input);
  return {
    state: provenance.status,
    valid: provenance.status === truth.FINANCIAL_STATES.FINANCIAL_COMPLETE,
    missing_components: provenance.missing_components,
    assumptions: provenance.assumptions,
    approval_gaps: provenance.status === truth.FINANCIAL_STATES.FINANCIAL_BUYER_APPROVAL_REQUIRED
      ? ["FINANCE_BUYER_APPROVAL_REQUIRED"]
      : []
  };
}

function validateMetricContract(input, options = {}) {
  const normalized = truth.createMetricContract(input);
  const targetStatus = options.target_status;
  const validationInput = targetStatus === CONTRACT_STATUSES.FROZEN && normalized.status !== CONTRACT_STATUSES.FROZEN
    ? { ...normalized, status: CONTRACT_STATUSES.FROZEN }
    : normalized;
  const result = truth.validateMetricContract(validationInput, targetStatus === CONTRACT_STATUSES.FROZEN ? {} : options);
  result.errors = result.errors.map(error => typeof error === "string" ? error : error.code).filter(Boolean);
  for (const field of truth.MATERIAL_FIELDS) {
    const value = input && input[field];
    if (value && typeof value === "object" && value.state === "NOT_APPLICABLE" && !value.reason) {
      result.valid = false;
      result.pilot_eligible = false;
      result.causal_claim_eligible = false;
      result.financial_claim_eligible = false;
      if (!result.invalid_fields.includes("MC_INVALID_NOT_APPLICABLE")) result.invalid_fields.push("MC_INVALID_NOT_APPLICABLE");
      if (!result.blocking_reasons.includes("MC_INVALID_NOT_APPLICABLE")) result.blocking_reasons.push("MC_INVALID_NOT_APPLICABLE");
      if (!result.errors.includes("MC_INVALID_NOT_APPLICABLE")) result.errors.push("MC_INVALID_NOT_APPLICABLE");
    }
  }
  return result;
}

function freezeMetricContract(input, metadata = {}) {
  if (input && input.status === CONTRACT_STATUSES.FROZEN && input.frozen_material_hash) {
    const currentHash = getMaterialHash(input);
    if (currentHash !== input.frozen_material_hash) {
      const error = new Error("Frozen Metric Contracts require a new version for material changes.");
      error.code = "MC_POST_FREEZE_MUTATION";
      throw error;
    }
    return {
      ...truth.createMetricContract(input),
      contract_hash: input.contract_hash || truth.hashContract(input),
      frozen_material_hash: input.frozen_material_hash
    };
  }
  const frozen = truth.transitionMetricContract(input, CONTRACT_STATUSES.FROZEN, metadata);
  return {
    ...frozen,
    contract_hash: truth.hashContract(frozen),
    frozen_material_hash: getMaterialHash(frozen)
  };
}

function getContractHash(input) {
  return truth.hashContract(input);
}

function createNextMetricContractVersion(input, patch = {}, options = {}) {
  const current = truth.createMetricContract(input);
  return truth.createNextMetricContractVersion(current, patch, {
    ...options,
    version: options.version || ((current.version || 0) + 1)
  });
}

function getMaterialHash(input) {
  const contract = truth.createMetricContract(input);
  const material = truth.MATERIAL_FIELDS.reduce((result, field) => {
    result[field] = contract[field];
    return result;
  }, {});
  return `sha256:${require("crypto").createHash("sha256").update(canonicalSerialize(material), "utf8").digest("hex")}`;
}

function createEvidenceMetadata(input = {}) {
  if (!input.metric_contract) return truth.createEvidenceMetadata(input);
  const contract = truth.createMetricContract(input.metric_contract);
  return truth.createEvidenceMetadata({
    ...input,
    metric_contract_id: input.metric_contract_id || contract.contract_id,
    metric_contract_version: input.metric_contract_version || contract.version,
    metric_contract_hash: input.metric_contract_hash || truth.hashContract(contract),
    data_snapshot_id: input.data_snapshot_id || contract.data_snapshot_id
  });
}

function evaluateClaimPermissions(inputOrContract, evidenceMetadata, financialProvenance, experimentState) {
  if (inputOrContract && typeof inputOrContract === "object" && "metric_contract" in inputOrContract) {
    const input = inputOrContract;
    const result = truth.evaluateClaimPermissions(
      input.metric_contract,
      input.evidence_metadata,
      input.financial_provenance,
      normalizeExperimentState(input.experiment_state)
    );
    return withClaimPermissionList(result);
  }
  return withClaimPermissionList(truth.evaluateClaimPermissions(
    inputOrContract,
    evidenceMetadata,
    financialProvenance,
    normalizeExperimentState(experimentState)
  ));
}

function normalizeExperimentState(state = {}) {
  if (!state || typeof state !== "object") return state;
  return {
    ...state,
    exposure_valid: state.exposure_valid ?? state.assignment_valid,
    outcome_valid: state.outcome_valid ?? state.outcome_window_closed
  };
}

function withClaimPermissionList(result) {
  return {
    ...result,
    claim_permissions: [
      result.can_run_diagnostic && CLAIM_PERMISSION.DIAGNOSTIC,
      result.can_enter_shadow && CLAIM_PERMISSION.SHADOW,
      result.can_start_live_pilot && CLAIM_PERMISSION.LIVE_PILOT,
      result.can_claim_causal_effect && CLAIM_PERMISSION.CAUSAL_EFFECT,
      result.can_claim_incremental_revenue && CLAIM_PERMISSION.INCREMENTAL_REVENUE,
      result.can_claim_incremental_profit && CLAIM_PERMISSION.VERIFIED_INCREMENTAL_PROFIT,
      result.can_recommend_scale && CLAIM_PERMISSION.RECOMMEND_SCALE,
      result.can_recommend_modify && CLAIM_PERMISSION.RECOMMEND_MODIFY,
      result.can_recommend_stop && CLAIM_PERMISSION.RECOMMEND_STOP
    ].filter(Boolean)
  };
}

function canonicalSerialize(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = sortKeys(value[key]);
    return result;
  }, {});
}

module.exports = {
  ...truth,
  CLAIM_PERMISSION,
  CONTRACT_STATUSES,
  FINANCIAL_STATES,
  canonicalSerialize,
  createEvidenceMetadata,
  createNextMetricContractVersion,
  evaluateClaimPermissions,
  freezeMetricContract,
  getContractHash,
  getMaterialHash,
  normalizeFinancialProvenance,
  validateMetricContract,
  validateFinancialProvenance
};
