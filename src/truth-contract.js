const crypto = require("crypto");

const METRIC_CONTRACT_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  FROZEN: "FROZEN",
  COMPLETED: "COMPLETED",
  INVALIDATED: "INVALIDATED"
});

const EVIDENCE_LEVELS = Object.freeze({
  OBSERVED: "OBSERVED",
  SIMULATED: "SIMULATED",
  SHADOW: "SHADOW",
  EXPERIMENTAL: "EXPERIMENTAL",
  VERIFIED_INCREMENTAL: "VERIFIED_INCREMENTAL"
});

const FINANCIAL_STATES = Object.freeze({
  FINANCIAL_COMPLETE: "FINANCIAL_COMPLETE",
  FINANCIAL_INCOMPLETE: "FINANCIAL_INCOMPLETE",
  FINANCIAL_ASSUMPTION_REQUIRED: "FINANCIAL_ASSUMPTION_REQUIRED",
  FINANCIAL_BUYER_APPROVAL_REQUIRED: "FINANCIAL_BUYER_APPROVAL_REQUIRED"
});

const VALID_TRANSITIONS = Object.freeze({
  DRAFT: new Set(["APPROVED", "INVALIDATED"]),
  APPROVED: new Set(["FROZEN", "INVALIDATED"]),
  FROZEN: new Set(["COMPLETED", "INVALIDATED"]),
  COMPLETED: new Set(["INVALIDATED"]),
  INVALIDATED: new Set([])
});

const REQUIRED_FOR_APPROVAL = Object.freeze([
  ["buyer_id", "MC_MISSING_BUYER"],
  ["use_case", "MC_MISSING_USE_CASE"],
  ["eligible_population", "MC_MISSING_ELIGIBLE_POPULATION"],
  ["exclusions", "MC_MISSING_EXCLUSIONS"],
  ["assignment_unit", "MC_MISSING_ASSIGNMENT_UNIT"],
  ["treatment_definition", "MC_MISSING_TREATMENT"],
  ["control_definition", "MC_MISSING_CONTROL"],
  ["primary_kpi", "MC_MISSING_PRIMARY_KPI"],
  ["outcome_window", "MC_MISSING_OUTCOME_WINDOW"],
  ["finance_owner", "MC_MISSING_FINANCE_OWNER"],
  ["CRM_owner", "MC_MISSING_CRM_OWNER"],
  ["data_owner", "MC_MISSING_DATA_OWNER"],
  ["version", "MC_MISSING_VERSION"]
]);

const REQUIRED_FOR_FREEZE = Object.freeze([
  ["randomization_method", "MC_MISSING_RANDOMIZATION"],
  ["holdout_percentage", "MC_MISSING_HOLDOUT"],
  ["exposure_definition", "MC_MISSING_EXPOSURE"],
  ["delivery_definition", "MC_MISSING_DELIVERY"],
  ["analysis_population", "MC_MISSING_ANALYSIS_POPULATION"],
  ["estimand", "MC_MISSING_ESTIMAND"],
  ["confidence_level", "MC_MISSING_CONFIDENCE_LEVEL"],
  ["MDE", "MC_MISSING_MDE"],
  ["minimum_sample", "MC_MISSING_MIN_SAMPLE"],
  ["margin_formula", "MC_MISSING_MARGIN_FORMULA"],
  ["contamination_policy", "MC_MISSING_CONTAMINATION_POLICY"],
  ["concurrent_campaign_policy", "MC_MISSING_CONCURRENT_CAMPAIGN_POLICY"],
  ["missing_data_policy", "MC_MISSING_MISSING_DATA_POLICY"],
  ["stopping_rule", "MC_MISSING_STOPPING_RULE"],
  ["outcome_owner", "MC_MISSING_OUTCOME_OWNER"],
  ["guardrails", "MC_MISSING_GUARDRAILS"]
]);

const MATERIAL_FIELDS = Object.freeze([
  "eligible_population",
  "exclusions",
  "analysis_population",
  "assignment_unit",
  "randomization_method",
  "assignment_seed",
  "holdout_percentage",
  "treatment_definition",
  "control_definition",
  "exposure_definition",
  "delivery_definition",
  "primary_kpi",
  "secondary_kpis",
  "outcome_window",
  "analysis_cutoff",
  "estimand",
  "confidence_level",
  "MDE",
  "minimum_sample",
  "margin_formula",
  "incentive_cost",
  "messaging_cost",
  "channel_cost",
  "operational_cost",
  "contamination_policy",
  "concurrent_campaign_policy",
  "missing_data_policy",
  "guardrails",
  "stopping_rule"
]);

function createMetricContract(input = {}) {
  const status = normalizeEnum(input.status, METRIC_CONTRACT_STATUSES, METRIC_CONTRACT_STATUSES.DRAFT);
  return {
    contract_id: normalizeNullableString(input.contract_id),
    buyer_id: normalizeNullableString(input.buyer_id),
    use_case: normalizeNullableString(input.use_case),
    status,
    version: normalizeVersion(input.version),
    created_at: normalizeNullableString(input.created_at),
    approved_at: normalizeNullableString(input.approved_at),
    approved_by: normalizeNullableString(input.approved_by),
    data_snapshot_id: normalizeNullableString(input.data_snapshot_id),
    eligible_population: normalizeExplicitValue(input.eligible_population),
    exclusions: normalizeExplicitValue(input.exclusions),
    index_date: normalizeExplicitValue(input.index_date),
    analysis_population: normalizeExplicitValue(input.analysis_population),
    assignment_unit: normalizeExplicitValue(input.assignment_unit),
    randomization_method: normalizeExplicitValue(input.randomization_method),
    assignment_seed: normalizeExplicitValue(input.assignment_seed),
    holdout_percentage: normalizeExplicitValue(input.holdout_percentage),
    treatment_definition: normalizeExplicitValue(input.treatment_definition),
    control_definition: normalizeExplicitValue(input.control_definition),
    exposure_definition: normalizeExplicitValue(input.exposure_definition),
    delivery_definition: normalizeExplicitValue(input.delivery_definition),
    primary_kpi: normalizeExplicitValue(input.primary_kpi),
    secondary_kpis: Array.isArray(input.secondary_kpis) ? input.secondary_kpis.map(normalizeExplicitValue) : [],
    outcome_window: normalizeExplicitValue(input.outcome_window),
    analysis_cutoff: normalizeExplicitValue(input.analysis_cutoff),
    estimand: normalizeExplicitValue(input.estimand),
    confidence_level: normalizeExplicitValue(input.confidence_level),
    MDE: normalizeExplicitValue(input.MDE),
    minimum_sample: normalizeExplicitValue(input.minimum_sample),
    margin_formula: normalizeExplicitValue(input.margin_formula),
    incentive_cost: normalizeExplicitValue(input.incentive_cost),
    messaging_cost: normalizeExplicitValue(input.messaging_cost),
    channel_cost: normalizeExplicitValue(input.channel_cost),
    operational_cost: normalizeExplicitValue(input.operational_cost),
    contamination_policy: normalizeExplicitValue(input.contamination_policy),
    concurrent_campaign_policy: normalizeExplicitValue(input.concurrent_campaign_policy),
    missing_data_policy: normalizeExplicitValue(input.missing_data_policy),
    guardrails: Array.isArray(input.guardrails) ? input.guardrails.map(normalizeExplicitValue) : normalizeExplicitValue(input.guardrails),
    stopping_rule: normalizeExplicitValue(input.stopping_rule),
    finance_owner: normalizeNullableString(input.finance_owner),
    CRM_owner: normalizeNullableString(input.CRM_owner),
    data_owner: normalizeNullableString(input.data_owner),
    outcome_owner: normalizeNullableString(input.outcome_owner),
    evidence_package_id: normalizeNullableString(input.evidence_package_id),
    previous_contract_hash: normalizeNullableString(input.previous_contract_hash)
  };
}

function validateMetricContract(input = {}, options = {}) {
  const contract = createMetricContract(input);
  const targetStatus = normalizeEnum(options.target_status || contract.status, METRIC_CONTRACT_STATUSES, contract.status);
  const blocking = [];
  const missing = [];
  const invalid = [];
  const ownershipGaps = [];
  const financialGaps = [];
  const experimentGaps = [];

  if (contract.status === METRIC_CONTRACT_STATUSES.INVALIDATED) push(blocking, "MC_INVALIDATED");
  if ([METRIC_CONTRACT_STATUSES.APPROVED, METRIC_CONTRACT_STATUSES.FROZEN, METRIC_CONTRACT_STATUSES.COMPLETED].includes(targetStatus)) {
    collectRequired(contract, REQUIRED_FOR_APPROVAL, missing, blocking);
    for (const [field, code] of REQUIRED_FOR_APPROVAL) {
      if (field.endsWith("_owner") && missing.includes(field)) push(ownershipGaps, code);
    }
    if (!contract.approved_by && targetStatus !== METRIC_CONTRACT_STATUSES.DRAFT) push(ownershipGaps, "MC_MISSING_APPROVED_BY");
    if (!contract.approved_at && targetStatus !== METRIC_CONTRACT_STATUSES.DRAFT) push(ownershipGaps, "MC_MISSING_APPROVED_AT");
  }

  if ([METRIC_CONTRACT_STATUSES.FROZEN, METRIC_CONTRACT_STATUSES.COMPLETED].includes(targetStatus)) {
    collectRequired(contract, REQUIRED_FOR_FREEZE, missing, blocking);
    if (requiresAssignmentSeed(contract.randomization_method) && isMissing(contract.assignment_seed)) {
      missing.push("assignment_seed");
      push(blocking, "MC_MISSING_ASSIGNMENT_SEED");
      push(experimentGaps, "MC_MISSING_ASSIGNMENT_SEED");
    }
    if (isMissing(contract.analysis_cutoff)) {
      missing.push("analysis_cutoff");
      push(blocking, "MC_MISSING_ANALYSIS_CUTOFF");
      push(experimentGaps, "MC_MISSING_ANALYSIS_CUTOFF");
    }
  }

  if (!isMissing(contract.margin_formula)) {
    for (const field of ["incentive_cost", "messaging_cost", "channel_cost", "operational_cost"]) {
      if (isMissing(contract[field])) {
        missing.push(field);
        push(blocking, `MC_MISSING_${field.toUpperCase()}`);
        push(financialGaps, field);
      }
    }
  }

  if (contract.status !== METRIC_CONTRACT_STATUSES.FROZEN && contract.status !== METRIC_CONTRACT_STATUSES.COMPLETED) {
    push(blocking, "MC_NOT_FROZEN");
  }
  if (contract.status === METRIC_CONTRACT_STATUSES.APPROVED) push(blocking, "MC_NOT_FROZEN");

  const uniqueBlocking = unique(blocking);
  const valid = uniqueBlocking.length === 0;
  return {
    valid,
    pilot_eligible: valid && contract.status === METRIC_CONTRACT_STATUSES.FROZEN,
    causal_claim_eligible: valid && contract.status === METRIC_CONTRACT_STATUSES.FROZEN,
    financial_claim_eligible: valid && contract.status === METRIC_CONTRACT_STATUSES.FROZEN && !financialGaps.length,
    errors: uniqueBlocking.map(code => ({ code })),
    warnings: [],
    blocking_reasons: uniqueBlocking,
    missing_required_fields: unique(missing),
    invalid_fields: invalid,
    ownership_gaps: unique(ownershipGaps),
    financial_gaps: unique(financialGaps),
    experiment_gaps: unique(experimentGaps),
    contract_hash: hashContract(contract)
  };
}

function transitionMetricContract(input, targetStatus, options = {}) {
  const contract = createMetricContract(input);
  const normalizedTarget = normalizeEnum(targetStatus, METRIC_CONTRACT_STATUSES, "");
  if (!normalizedTarget) throw domainError("MC_ILLEGAL_TRANSITION", "Metric Contract target status is invalid.");
  const patch = options.patch && typeof options.patch === "object" ? options.patch : {};
  if ([METRIC_CONTRACT_STATUSES.FROZEN, METRIC_CONTRACT_STATUSES.COMPLETED].includes(contract.status)) {
    const changedMaterial = MATERIAL_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(patch, field) && !deepEqual(contract[field], patch[field]));
    if (changedMaterial.length) throw domainError("MC_POST_FREEZE_MUTATION", "Frozen Metric Contracts require a new version for material changes.");
  }
  if (normalizedTarget === contract.status) return createMetricContract({ ...contract, ...patch });
  if (!VALID_TRANSITIONS[contract.status]?.has(normalizedTarget)) {
    throw domainError("MC_ILLEGAL_TRANSITION", `Illegal Metric Contract transition from ${contract.status} to ${normalizedTarget}.`);
  }
  const next = createMetricContract({
    ...contract,
    ...patch,
    status: normalizedTarget,
    approved_by: normalizedTarget === METRIC_CONTRACT_STATUSES.APPROVED ? normalizeNullableString(options.approved_by) || contract.approved_by : contract.approved_by,
    approved_at: normalizedTarget === METRIC_CONTRACT_STATUSES.APPROVED ? normalizeNullableString(options.approved_at) || contract.approved_at : contract.approved_at
  });
  const validation = validateMetricContract(next, { target_status: normalizedTarget });
  const transitionBlockers = validation.blocking_reasons.filter(code => code !== "MC_NOT_FROZEN");
  if (normalizedTarget !== METRIC_CONTRACT_STATUSES.INVALIDATED && transitionBlockers.length) {
    throw domainError(transitionBlockers[0], "Metric Contract transition requirements are incomplete.", { validation });
  }
  return next;
}

function createNextMetricContractVersion(input, patch = {}, options = {}) {
  const contract = createMetricContract(input);
  if (![METRIC_CONTRACT_STATUSES.FROZEN, METRIC_CONTRACT_STATUSES.COMPLETED, METRIC_CONTRACT_STATUSES.INVALIDATED].includes(contract.status)) {
    throw domainError("MC_VERSION_SOURCE_NOT_FROZEN", "New material versions must start from a frozen, completed, or invalidated contract.");
  }
  const nextVersion = normalizeVersion(options.version);
  if (!Number.isInteger(nextVersion) || nextVersion <= contract.version) {
    throw domainError("MC_VERSION_NOT_INCREMENTED", "Metric Contract version must increase.");
  }
  return createMetricContract({
    ...contract,
    ...patch,
    status: METRIC_CONTRACT_STATUSES.DRAFT,
    version: nextVersion,
    approved_at: null,
    approved_by: null,
    previous_contract_hash: hashContract(contract)
  });
}

function createEvidenceMetadata(input = {}) {
  const evidenceLevel = normalizeEnum(input.evidence_level, EVIDENCE_LEVELS, EVIDENCE_LEVELS.OBSERVED);
  const lineageComplete = Boolean(
    input.metric_contract_id &&
    input.metric_contract_version &&
    input.metric_contract_hash &&
    input.data_snapshot_id &&
    input.generated_at
  );
  const limitations = Array.isArray(input.limitations) ? input.limitations.filter(Boolean).map(String) : [];
  if (!lineageComplete) limitations.push("missing_metric_contract_lineage");
  if (!canClaimCausality(evidenceLevel)) limitations.push("no_causal_claim");
  if (evidenceLevel !== EVIDENCE_LEVELS.VERIFIED_INCREMENTAL) limitations.push("not_verified_incremental");

  return {
    evidence_level: evidenceLevel,
    source_type: normalizeNullableString(input.source_type) || "unknown",
    metric_contract_id: normalizeNullableString(input.metric_contract_id),
    metric_contract_version: normalizeVersion(input.metric_contract_version),
    metric_contract_hash: normalizeNullableString(input.metric_contract_hash),
    data_snapshot_id: normalizeNullableString(input.data_snapshot_id),
    experiment_id: normalizeNullableString(input.experiment_id),
    generated_at: normalizeNullableString(input.generated_at),
    limitations: unique(limitations),
    claim_permissions: {
      can_claim_causality: canClaimCausality(evidenceLevel),
      can_claim_verified_incremental_profit: evidenceLevel === EVIDENCE_LEVELS.VERIFIED_INCREMENTAL,
      can_show_as_estimate: evidenceLevel !== EVIDENCE_LEVELS.VERIFIED_INCREMENTAL,
      requires_disclaimer: requiresDisclaimer(evidenceLevel) || !lineageComplete
    },
    verification_status: normalizeNullableString(input.verification_status) || (lineageComplete ? "COMPLETE" : "LEGACY_INCOMPLETE")
  };
}

function createFinancialProvenance(input = {}) {
  const provenance = {
    formula_id: normalizeNullableString(input.formula_id),
    formula_version: normalizeNullableString(input.formula_version),
    currency: normalizeNullableString(input.currency),
    revenue_source: normalizeFinancialSource(input.revenue_source),
    margin_source: normalizeFinancialSource(input.margin_source),
    incentive_cost_source: normalizeFinancialSource(input.incentive_cost_source),
    messaging_cost_source: normalizeFinancialSource(input.messaging_cost_source),
    channel_cost_source: normalizeFinancialSource(input.channel_cost_source),
    operational_cost_source: normalizeFinancialSource(input.operational_cost_source),
    buyer_approved_by: normalizeNullableString(input.buyer_approved_by),
    buyer_approved_at: normalizeNullableString(input.buyer_approved_at),
    data_snapshot_id: normalizeNullableString(input.data_snapshot_id),
    as_of: normalizeNullableString(input.as_of),
    missing_components: [],
    assumptions: Array.isArray(input.assumptions) ? input.assumptions.filter(Boolean).map(String) : []
  };
  for (const field of [
    "formula_id",
    "formula_version",
    "currency",
    "revenue_source",
    "margin_source",
    "incentive_cost_source",
    "messaging_cost_source",
    "channel_cost_source",
    "operational_cost_source",
    "data_snapshot_id",
    "as_of"
  ]) {
    if (isMissing(provenance[field])) provenance.missing_components.push(field);
  }
  if (!provenance.buyer_approved_by || !provenance.buyer_approved_at) {
    provenance.status = FINANCIAL_STATES.FINANCIAL_BUYER_APPROVAL_REQUIRED;
  } else if (provenance.missing_components.length) {
    provenance.status = FINANCIAL_STATES.FINANCIAL_INCOMPLETE;
  } else if (provenance.assumptions.length) {
    provenance.status = FINANCIAL_STATES.FINANCIAL_ASSUMPTION_REQUIRED;
  } else {
    provenance.status = FINANCIAL_STATES.FINANCIAL_COMPLETE;
  }
  return provenance;
}

function evaluateClaimPermissions(metricContract, evidenceMetadata, financialProvenance, experimentState = {}) {
  const contract = createMetricContract(metricContract || {});
  const contractValidation = validateMetricContract(contract);
  const evidence = createEvidenceMetadata(evidenceMetadata || {});
  const finance = createFinancialProvenance(financialProvenance || {});
  const blocking = [...contractValidation.blocking_reasons];
  const validExperiment = isValidExperimentState(experimentState);

  if (evidence.evidence_level !== EVIDENCE_LEVELS.EXPERIMENTAL && evidence.evidence_level !== EVIDENCE_LEVELS.VERIFIED_INCREMENTAL) {
    push(blocking, "EVIDENCE_LEVEL_NOT_CAUSAL");
  }
  if (evidence.evidence_level !== EVIDENCE_LEVELS.VERIFIED_INCREMENTAL) {
    push(blocking, "EVIDENCE_NOT_VERIFIED_INCREMENTAL");
  }
  if (!lineageMatches(contractValidation.contract_hash, contract, evidence)) push(blocking, "EVIDENCE_LINEAGE_INCOMPLETE");
  if (!validExperiment) push(blocking, "EXPERIMENT_STATE_INVALID");
  if (experimentState?.blocking_integrity_failure === true || experimentState?.integrity_status === "fail") {
    push(blocking, "EXPERIMENT_INTEGRITY_FAILED");
  }
  if (finance.status !== FINANCIAL_STATES.FINANCIAL_COMPLETE) push(blocking, finance.status);

  const canRunDiagnostic = contract.status !== METRIC_CONTRACT_STATUSES.INVALIDATED;
  const canEnterShadow = canRunDiagnostic && !isMissing(contract.eligible_population) && !isMissing(contract.treatment_definition);
  const canStartLivePilot = contractValidation.pilot_eligible;
  const causalBlocked = blocking.some(code =>
    code.startsWith("MC_") ||
    code === "EVIDENCE_LEVEL_NOT_CAUSAL" ||
    code === "EXPERIMENT_STATE_INVALID" ||
    code === "EXPERIMENT_INTEGRITY_FAILED" ||
    code === "EVIDENCE_LINEAGE_INCOMPLETE"
  );
  const canClaimCausalEffect = !causalBlocked;
  const canClaimIncrementalRevenue = canClaimCausalEffect;
  const canClaimIncrementalProfit = canClaimCausalEffect &&
    evidence.evidence_level === EVIDENCE_LEVELS.VERIFIED_INCREMENTAL &&
    finance.status === FINANCIAL_STATES.FINANCIAL_COMPLETE;

  return {
    can_run_diagnostic: canRunDiagnostic,
    can_enter_shadow: canEnterShadow,
    can_start_live_pilot: canStartLivePilot,
    can_claim_causal_effect: canClaimCausalEffect,
    can_claim_incremental_revenue: canClaimIncrementalRevenue,
    can_claim_incremental_profit: canClaimIncrementalProfit,
    can_recommend_scale: canClaimIncrementalProfit,
    can_recommend_modify: canClaimCausalEffect && contract.status !== METRIC_CONTRACT_STATUSES.INVALIDATED,
    can_recommend_stop: canClaimCausalEffect && contract.status !== METRIC_CONTRACT_STATUSES.INVALIDATED,
    blocking_reasons: unique(blocking)
  };
}

function hashContract(contract) {
  const normalized = createMetricContract(contract);
  return `sha256:${crypto.createHash("sha256").update(canonicalStringify(normalized), "utf8").digest("hex")}`;
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function collectRequired(contract, required, missing, blocking) {
  for (const [field, code] of required) {
    if (isMissing(contract[field])) {
      missing.push(field);
      push(blocking, code);
    }
  }
}

function isValidExperimentState(state = {}) {
  return Boolean(
    state &&
    state.assignment_valid === true &&
    state.exposure_valid === true &&
    state.outcome_valid === true &&
    state.blocking_integrity_failure !== true &&
    state.integrity_status !== "fail"
  );
}

function lineageMatches(contractHash, contract, evidence) {
  return Boolean(
    evidence.metric_contract_id &&
    evidence.metric_contract_id === contract.contract_id &&
    evidence.metric_contract_version === contract.version &&
    evidence.metric_contract_hash === contractHash &&
    evidence.data_snapshot_id &&
    evidence.data_snapshot_id === contract.data_snapshot_id
  );
}

function canClaimCausality(level) {
  return level === EVIDENCE_LEVELS.EXPERIMENTAL || level === EVIDENCE_LEVELS.VERIFIED_INCREMENTAL;
}

function canClaimVerifiedIncrementalProfit(level) {
  return level === EVIDENCE_LEVELS.VERIFIED_INCREMENTAL;
}

function canShowAsEstimate(level) {
  return level !== EVIDENCE_LEVELS.VERIFIED_INCREMENTAL;
}

function requiresDisclaimer(level) {
  return level !== EVIDENCE_LEVELS.VERIFIED_INCREMENTAL;
}

function requiresAssignmentSeed(method) {
  const normalized = String(extractValue(method) || "").toLowerCase();
  return normalized === "randomized" || normalized === "deterministic_hash";
}

function normalizeFinancialSource(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const state = normalizeNullableString(value.state);
    if (state === "EXPLICIT_ZERO") {
      return value.approved_by ? {
        value: 0,
        state,
        approved_by: normalizeNullableString(value.approved_by),
        approved_at: normalizeNullableString(value.approved_at)
      } : null;
    }
    if (state === "NOT_APPLICABLE" && value.reason) {
      return {
        state,
        reason: normalizeNullableString(value.reason),
        approved_by: normalizeNullableString(value.approved_by)
      };
    }
    return { ...value };
  }
  return normalizeNullableString(value);
}

function normalizeExplicitValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.state === "NOT_APPLICABLE") {
      return value.reason ? { state: "NOT_APPLICABLE", reason: normalizeNullableString(value.reason) } : null;
    }
    return { ...value };
  }
  if (Array.isArray(value)) return value.map(normalizeExplicitValue);
  if (typeof value === "string") return value.trim() || null;
  return value ?? null;
}

function isMissing(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.state === "NOT_APPLICABLE" && value.reason) return false;
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function extractValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) return value.value;
  return value;
}

function normalizeEnum(value, enumObject, fallback) {
  const normalized = normalizeNullableString(value);
  if (!normalized) return fallback;
  return Object.values(enumObject).includes(normalized) ? normalized : fallback;
}

function normalizeNullableString(value) {
  if (typeof value === "string") return value.trim() || null;
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function normalizeVersion(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function push(target, code) {
  if (code && !target.includes(code)) target.push(code);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function deepEqual(left, right) {
  return canonicalStringify(left) === canonicalStringify(normalizeExplicitValue(right));
}

function domainError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

module.exports = {
  EVIDENCE_LEVELS,
  FINANCIAL_STATES,
  MATERIAL_FIELDS,
  METRIC_CONTRACT_STATUSES,
  createEvidenceMetadata,
  createFinancialProvenance,
  createMetricContract,
  createNextMetricContractVersion,
  evaluateClaimPermissions,
  canClaimCausality,
  canClaimVerifiedIncrementalProfit,
  canShowAsEstimate,
  hashContract,
  requiresDisclaimer,
  transitionMetricContract,
  validateMetricContract
};
