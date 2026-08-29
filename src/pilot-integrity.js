const crypto = require("crypto");
const { getContractHash, validateMetricContract, evaluateClaimPermissions, createEvidenceMetadata, createFinancialProvenance } = require("./metric-contract");
const { validateExperimentContext } = require("./metric-contract-registry");

const PHASES = Object.freeze({ PRE_LAUNCH: "PRE_LAUNCH", IN_FLIGHT: "IN_FLIGHT", READOUT: "READOUT" });
const STATUSES = Object.freeze({ READY: "READY", READY_WITH_WARNINGS: "READY_WITH_WARNINGS", BLOCKED: "BLOCKED", INVALIDATED: "INVALIDATED" });
const CHECK_STATUSES = Object.freeze({ PASS: "PASS", WARNING: "WARNING", BLOCKED: "BLOCKED", INVALID: "INVALID", NOT_EVALUATED: "NOT_EVALUATED" });

function assessPilotIntegrity(input = {}) {
  const phase = PHASES[input.phase] || PHASES.READOUT;
  const contract = input.metricContract;
  const experiment = input.experiment || {};
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const assignments = Array.isArray(experiment.assignments) ? experiment.assignments : (Array.isArray(input.assignments) ? input.assignments : []);
  const checks = [];
  const add = (id, type, status, severity, reason_code, message, observed_value = null, expected_value = null, threshold = null, remediation_hint = null) => checks.push({ check_id: id, check_type: type, status, severity, reason_code, message, observed_value, expected_value, threshold, source_reference: input.sourceReference || null, evaluated_at: input.assessedAt || new Date().toISOString(), remediation_hint });

  const contractValidation = contract ? validateMetricContract(contract, { target_status: contract.status }) : null;
  if (!contract) add("contract", "contract", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_CONTRACT_MISSING", "Metric Contract is unresolved.");
  else if (contract.status === "INVALIDATED") add("contract", "contract", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_CONTRACT_INVALIDATED", "Metric Contract is invalidated.");
  else if (!contractValidation?.valid && phase !== PHASES.PRE_LAUNCH) add("contract", "contract", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_CONTRACT_INVALID", "Metric Contract validation failed.", contractValidation?.blocking_reasons || []);
  else add("contract", "contract", CHECK_STATUSES.PASS, "INFO", null, "Metric Contract is valid for this phase.");

  const assignmentIds = assignments.map(row => row.customerId ?? row.customer_id);
  const duplicateAssignments = duplicates(assignmentIds.filter(Boolean));
  const groups = new Set(assignments.map(row => row.assignedGroup ?? row.assigned_group).filter(Boolean));
  if (!assignments.length) add("assignment", "assignment", CHECK_STATUSES.NOT_EVALUATED, "BLOCKER", "INT_ASSIGNMENT_MISSING", "Assignment data is unavailable.");
  else if (duplicateAssignments.length) add("assignment", "assignment", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_ASSIGNMENT_DUPLICATE", "Assignment unit appears more than once.", duplicateAssignments);
  else if (contract && contract.assignment_unit && String(contract.assignment_unit) !== "customer_id") add("assignment", "assignment", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_ASSIGNMENT_UNIT_MISMATCH", "Assignment unit does not match supported customer-level execution.");
  else add("assignment", "assignment", CHECK_STATUSES.PASS, "INFO", null, "Assignments are unique and structurally valid.", assignments.length);

  const expectedAllocation = experiment.design?.expectedAllocation || experiment.expectedAllocation || null;
  const srm = expectedAllocation ? sampleRatio(expectedAllocation, assignments) : null;
  if (!srm) add("srm", "sample_ratio", CHECK_STATUSES.NOT_EVALUATED, "BLOCKER", "INT_SRM_NOT_EVALUATED", "Expected allocation or assignment counts are unavailable.");
  else if (!srm.passed) add("srm", "sample_ratio", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_SAMPLE_RATIO_MISMATCH", "Observed allocation is inconsistent with expected allocation.", srm, expectedAllocation, 0.01);
  else add("srm", "sample_ratio", CHECK_STATUSES.PASS, "INFO", null, "Sample ratio is within configured significance threshold.", srm);

  const covariates = Array.isArray(input.covariates) ? input.covariates : [];
  if (!covariates.length) add("balance", "balance", CHECK_STATUSES.NOT_EVALUATED, "WARNING", "INT_BALANCE_DATA_MISSING", "No pre-treatment covariates were supplied.");
  else {
    const postTreatment = covariates.filter(item => item.postTreatment === true);
    if (postTreatment.length) add("balance", "balance", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_POST_TREATMENT_COVARIATE_REJECTED", "Post-treatment covariates cannot be used for balance assessment.", postTreatment.map(item => item.name));
    else {
      const imbalanced = covariates.filter(item => Number(item.smd) > Number(item.threshold ?? 0.1));
      add("balance", "balance", imbalanced.length ? CHECK_STATUSES.WARNING : CHECK_STATUSES.PASS, imbalanced.length ? "WARNING" : "INFO", imbalanced.length ? "INT_COVARIATE_IMBALANCE" : null, imbalanced.length ? "One or more covariates exceed the configured SMD threshold." : "Pre-treatment covariates are balanced.", covariates);
    }
  }

  const treatment = assignments.filter(row => (row.assignedGroup ?? row.assigned_group) !== "control");
  const control = assignments.filter(row => (row.assignedGroup ?? row.assigned_group) === "control");
  const exposureRows = Array.isArray(input.exposures) ? input.exposures : rows;
  if (!treatment.length || !exposureRows.length) add("exposure", "exposure", CHECK_STATUSES.NOT_EVALUATED, "BLOCKER", "INT_EXPOSURE_MISSING", "Treatment exposure data is unavailable.");
  else {
    const assignmentMap = new Map(assignments.map(row => [row.customerId ?? row.customer_id, row]));
    const missing = treatment.filter(row => !exposureRows.some(exp => (exp.customerId ?? exp.customer_id) === (row.customerId ?? row.customer_id)));
    const beforeAssignment = exposureRows.filter(exp => { const assignment = assignmentMap.get(exp.customerId ?? exp.customer_id); return assignment?.assignedAt && exp.exposedAt && new Date(exp.exposedAt) < new Date(assignment.assignedAt); });
    const controlExposed = exposureRows.filter(exp => (assignmentMap.get(exp.customerId ?? exp.customer_id)?.assignedGroup ?? assignmentMap.get(exp.customerId ?? exp.customer_id)?.assigned_group) === "control");
    if (controlExposed.length) add("exposure", "exposure", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_CONTROL_CONTAMINATION", "Control units received treatment exposure.", controlExposed.length);
    else if (beforeAssignment.length) add("exposure_timing", "exposure", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_EXPOSURE_BEFORE_ASSIGNMENT", "Exposure precedes assignment.", beforeAssignment.length);
    else if (missing.length) add("exposure", "exposure", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_EXPOSURE_COMPLETENESS_LOW", "Treatment exposure is incomplete.", missing.length, 0);
    else add("exposure", "exposure", CHECK_STATUSES.PASS, "INFO", null, "Exposure is complete for treatment units.", exposureRows.length);
  }

  const deliveries = Array.isArray(input.deliveries) ? input.deliveries : null;
  if (!deliveries) add("delivery", "delivery", CHECK_STATUSES.NOT_EVALUATED, "WARNING", "INT_DELIVERY_UNKNOWN", "Delivery evidence is unavailable.");
  else if (!deliveries.length && treatment.length) add("delivery", "delivery", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_DELIVERY_MISSING", "Treatment delivery records are missing.");
  else {
    const deliveryIds = deliveries.map(row => row.customerId ?? row.customer_id).filter(Boolean);
    const duplicateDelivery = duplicates(deliveryIds);
    const assignmentMap = new Map(assignments.map(row => [row.customerId ?? row.customer_id, row]));
    const controlDelivery = deliveries.filter(row => (assignmentMap.get(row.customerId ?? row.customer_id)?.assignedGroup ?? assignmentMap.get(row.customerId ?? row.customer_id)?.assigned_group) === "control");
    const beforeAssignment = deliveries.filter(row => { const a = assignmentMap.get(row.customerId ?? row.customer_id); return a?.assignedAt && row.deliveredAt && new Date(row.deliveredAt) < new Date(a.assignedAt); });
    const unknown = deliveries.filter(row => row.delivered === undefined && row.status === undefined && !row.deliveredAt);
    if (duplicateDelivery.length) add("delivery", "delivery", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_DELIVERY_DUPLICATE", "Delivery unit appears more than once.", duplicateDelivery);
    else if (controlDelivery.length) add("delivery", "delivery", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_CONTROL_DELIVERY", "Control units received treatment delivery.", controlDelivery.length);
    else if (beforeAssignment.length) add("delivery", "delivery", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_DELIVERY_BEFORE_ASSIGNMENT", "Delivery precedes assignment.", beforeAssignment.length);
    else if (unknown.length) add("delivery", "delivery", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_DELIVERY_UNKNOWN", "Delivery status is unknown.", unknown.length);
    else {
      const deliveredTreatment = deliveries.filter(row => (assignmentMap.get(row.customerId ?? row.customer_id)?.assignedGroup ?? assignmentMap.get(row.customerId ?? row.customer_id)?.assigned_group) !== "control").length;
      const rate = treatment.length ? deliveredTreatment / treatment.length : 0;
      const threshold = Number(input.deliveryCompletenessThreshold ?? 0.8);
      add("delivery", "delivery", rate < threshold ? CHECK_STATUSES.BLOCKED : CHECK_STATUSES.PASS, rate < threshold ? "BLOCKER" : "INFO", rate < threshold ? "INT_DELIVERY_COMPLETENESS_LOW" : null, rate < threshold ? "Treatment delivery completeness is below the configured threshold." : "Delivery is complete.", rate, 1, threshold);
    }
  }

  const eligibility = Array.isArray(input.eligibility) ? input.eligibility : [];
  if (!eligibility.length) add("eligibility", "eligibility", CHECK_STATUSES.NOT_EVALUATED, "WARNING", "INT_ELIGIBILITY_UNKNOWN", "Eligibility evidence is unavailable.");
  else {
    const invalid = eligibility.filter(item => item.eligible === false || item.excluded === true);
    add("eligibility", "eligibility", invalid.length ? CHECK_STATUSES.INVALID : CHECK_STATUSES.PASS, invalid.length ? "INVALIDATOR" : "INFO", invalid.length ? "INT_INELIGIBLE_UNIT" : null, invalid.length ? "Ineligible units entered the experiment." : "Eligibility checks passed.", invalid.length);
  }

  const outcomes = Array.isArray(input.outcomes) ? input.outcomes : rows;
  if (phase === PHASES.PRE_LAUNCH) add("outcome", "outcome", CHECK_STATUSES.NOT_EVALUATED, "INFO", "INT_OUTCOME_NOT_EVALUATED", "Outcome is not evaluated before launch.");
  else if (!outcomes.length) add("outcome", "outcome", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_OUTCOME_MISSING", "Outcome data is unavailable.");
  else {
    const outcomeIds = outcomes.map(row => row.customerId ?? row.customer_id).filter(Boolean);
    const duplicateOutcomes = duplicates(outcomeIds);
    const missingOutcome = outcomes.filter(row => row.outcomeRevenue === undefined && row.outcome_revenue === undefined && row.conversion === undefined && row.converted === undefined);
    if (duplicateOutcomes.length) add("outcome", "outcome", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_OUTCOME_DUPLICATE", "Outcome unit appears more than once.", duplicateOutcomes);
    else if (missingOutcome.length) add("outcome", "outcome", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_OUTCOME_MISSING", "Outcome values are missing and were not inferred.", missingOutcome.length);
    else add("outcome", "outcome", CHECK_STATUSES.PASS, "INFO", null, "Outcome records are structurally complete.", outcomes.length);
  }

  const minimum = Number(contract?.minimum_sample?.per_arm ?? contract?.minimum_sample ?? 0);
  if (!minimum) add("power", "power", CHECK_STATUSES.NOT_EVALUATED, "BLOCKER", "INT_POWER_NOT_EVALUATED", "Minimum sample is unavailable.");
  else if (phase !== PHASES.PRE_LAUNCH && (treatment.length < minimum || control.length < minimum)) add("power", "power", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_SAMPLE_SIZE_INSUFFICIENT", "Observed sample is below the frozen minimum per arm.", { treatment: treatment.length, control: control.length }, minimum);
  else add("power", "power", CHECK_STATUSES.PASS, "INFO", null, "Minimum sample requirement is satisfied or reserved for launch.");

  const timingRows = [...assignments, ...exposureRows, ...outcomes].filter(row => row.assignedAt || row.exposedAt || row.outcomeAt);
  const freezeAt = contract?.frozen_at || contract?.frozenAt || contract?.approved_at;
  const badTiming = timingRows.some(row => freezeAt && row.assignedAt && new Date(row.assignedAt) < new Date(freezeAt)) || timingRows.some(row => row.assignedAt && row.exposedAt && new Date(row.exposedAt) < new Date(row.assignedAt)) || timingRows.some(row => row.assignedAt && row.deliveredAt && new Date(row.deliveredAt) < new Date(row.assignedAt)) || timingRows.some(row => row.exposedAt && row.outcomeAt && new Date(row.outcomeAt) < new Date(row.exposedAt));
  add("timing", "timing", badTiming ? CHECK_STATUSES.INVALID : timingRows.length ? CHECK_STATUSES.PASS : CHECK_STATUSES.NOT_EVALUATED, badTiming ? "INVALIDATOR" : "INFO", badTiming ? "INT_TIMESTAMP_ORDER_INVALID" : null, badTiming ? "Experiment timestamps are not chronological." : "Timing evidence is consistent or not yet available.");

  const missingness = Array.isArray(input.missingness) ? input.missingness : [];
  if (!missingness.length) add("missingness", "missingness", CHECK_STATUSES.NOT_EVALUATED, "WARNING", "INT_MISSINGNESS_NOT_EVALUATED", "Missingness detail is unavailable.");
  else {
    const differential = missingness.filter(item => item.differential === true);
    add("missingness", "missingness", differential.length ? CHECK_STATUSES.INVALID : CHECK_STATUSES.PASS, differential.length ? "INVALIDATOR" : "INFO", differential.length ? "INT_DIFFERENTIAL_MISSINGNESS" : null, differential.length ? "Differential missingness requires review." : "Missingness is documented without differential failure.", missingness);
  }

  const contamination = input.contamination;
  if (contamination === "UNKNOWN" || contamination?.status === "UNKNOWN") add("contamination", "contamination", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_CONTAMINATION_UNKNOWN", "Contamination status is unknown.");
  else if (contamination === true || contamination?.status === "KNOWN") add("contamination", "contamination", CHECK_STATUSES.INVALID, "INVALIDATOR", "INT_CONTROL_CONTAMINATION", "Contamination was reported.");
  else add("contamination", "contamination", CHECK_STATUSES.NOT_EVALUATED, "WARNING", "INT_CONTAMINATION_NOT_EVALUATED", "No contamination evidence was supplied.");

  const interventions = input.concurrentInterventions;
  if (!Array.isArray(interventions)) add("concurrent", "contamination", CHECK_STATUSES.NOT_EVALUATED, "WARNING", "INT_CONCURRENT_CAMPAIGN_UNKNOWN", "Concurrent campaign history is unavailable.");
  else {
    const undeclared = interventions.filter(item => item.declared_in_contract === false || item.declaredInContract === false);
    const controlExternal = interventions.filter(item => item.treatment_group === "control" && item.external === true);
    add("concurrent", "contamination", undeclared.length || controlExternal.length ? CHECK_STATUSES.INVALID : CHECK_STATUSES.PASS, undeclared.length || controlExternal.length ? "INVALIDATOR" : "INFO", controlExternal.length ? "INT_CONTROL_EXTERNAL_INTERVENTION" : undeclared.length ? "INT_UNDECLARED_INTERVENTION" : null, controlExternal.length ? "Control received an external intervention." : undeclared.length ? "Undeclared concurrent intervention detected." : "Concurrent intervention history is clean.", interventions.length);
  }

  const contact = input.contactCap;
  if (!contact) add("contact_cap", "contact", CHECK_STATUSES.NOT_EVALUATED, "WARNING", "INT_CONTACT_CAP_UNKNOWN", "Contact-cap evidence is unavailable.");
  else if (contact.override === true) add("contact_cap", "contact", CHECK_STATUSES.WARNING, "WARNING", "INT_CONTACT_POLICY_OVERRIDE", "Contact policy override was explicitly recorded.");
  else if (Number(contact.violations || 0) > 0) add("contact_cap", "contact", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_CONTACT_CAP_VIOLATION", "Contact-cap violations were detected.", contact.violations, 0);
  else add("contact_cap", "contact", CHECK_STATUSES.PASS, "INFO", null, "Contact-cap policy passed.");

  const financial = input.financialProvenance ? createFinancialProvenance(input.financialProvenance) : null;
  if (!financial) add("financial", "financial", CHECK_STATUSES.NOT_EVALUATED, "BLOCKER", "INT_FINANCIAL_PROVENANCE_INCOMPLETE", "Financial provenance is unavailable.");
  else if (financial.status !== "FINANCIAL_COMPLETE") add("financial", "financial", CHECK_STATUSES.BLOCKED, "BLOCKER", "INT_FINANCIAL_PROVENANCE_INCOMPLETE", "Financial provenance is incomplete.", financial.status, "FINANCIAL_COMPLETE");
  else add("financial", "financial", CHECK_STATUSES.PASS, "INFO", null, "Financial provenance is complete.");

  const lineage = assessLineage(input, contract);
  add("lineage", "lineage", lineage.valid ? CHECK_STATUSES.PASS : CHECK_STATUSES.BLOCKED, lineage.valid ? "INFO" : "BLOCKER", lineage.valid ? null : "INT_LINEAGE_UNRESOLVED", lineage.message, lineage);
  if (input.registry && contract) {
    const context = validateExperimentContext({ registry: input.registry, metricContract: contract, pilot: input.pilot || {}, experiment });
    if (!context.valid) add("experiment_context", "lineage", CHECK_STATUSES.BLOCKED, "BLOCKER", context.blocking_reasons[0] || "INT_EXPERIMENT_LINEAGE_MISMATCH", "Experiment context does not match the frozen Metric Contract.", context.blocking_reasons);
    else add("experiment_context", "lineage", CHECK_STATUSES.PASS, "INFO", null, "Experiment context matches the frozen Metric Contract.");
  }

  const fatal = checks.filter(check => check.status === CHECK_STATUSES.INVALID).length;
  const blockers = checks.filter(check => check.status === CHECK_STATUSES.BLOCKED || (check.status === CHECK_STATUSES.NOT_EVALUATED && check.severity === "BLOCKER")).length;
  const causalChecks = checks.filter(check => check.check_type !== "financial");
  const causalFatal = causalChecks.some(check => check.status === CHECK_STATUSES.INVALID);
  const causalBlocked = causalChecks.some(check => check.status === CHECK_STATUSES.BLOCKED || (check.status === CHECK_STATUSES.NOT_EVALUATED && check.severity === "BLOCKER"));
  const warnings = checks.filter(check => check.status === CHECK_STATUSES.WARNING || check.severity === "WARNING").length;
  const overall_status = fatal ? STATUSES.INVALIDATED : blockers ? STATUSES.BLOCKED : warnings ? STATUSES.READY_WITH_WARNINGS : STATUSES.READY;
  const assessment = { assessment_id: input.assessmentId || `pia_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`, pilot_id: input.pilotId || null, experiment_id: input.experimentId || experiment.id || null, metric_contract_id: contract?.contract_id || null, metric_contract_version: contract?.version || null, metric_contract_hash: contract ? getContractHash(contract) : null, data_snapshot_id: input.dataSnapshotId || contract?.data_snapshot_id || null, assessed_at: input.assessedAt || new Date().toISOString(), phase, overall_status, claim_validity: { causal: overall_status === STATUSES.READY || overall_status === STATUSES.READY_WITH_WARNINGS, financial: overall_status === STATUSES.READY || overall_status === STATUSES.READY_WITH_WARNINGS }, checks, blockers: checks.filter(check => check.status === CHECK_STATUSES.BLOCKED || check.severity === "BLOCKER"), warnings: checks.filter(check => check.status === CHECK_STATUSES.WARNING), informational: checks.filter(check => check.severity === "INFO"), assignment_integrity: statusOf(checks, "assignment"), sample_ratio_integrity: statusOf(checks, "srm"), balance_integrity: statusOf(checks, "balance"), exposure_integrity: statusOf(checks, "exposure"), delivery_integrity: statusOf(checks, "delivery"), contamination_integrity: statusOf(checks, "contamination"), eligibility_integrity: statusOf(checks, "eligibility"), outcome_integrity: statusOf(checks, "outcome"), missing_data_integrity: statusOf(checks, "missingness"), statistical_power_integrity: statusOf(checks, "power"), timing_integrity: statusOf(checks, "timing"), financial_integrity: statusOf(checks, "financial"), lineage_integrity: lineage.valid ? CHECK_STATUSES.PASS : CHECK_STATUSES.BLOCKED };
  assessment.assessment_hash = `sha256:${crypto.createHash("sha256").update(canonical(assessment), "utf8").digest("hex")}`;
  const evidence = createEvidenceMetadata({ evidence_level: !causalFatal && !causalBlocked ? "EXPERIMENTAL" : "OBSERVED", metric_contract_id: assessment.metric_contract_id, metric_contract_version: assessment.metric_contract_version, metric_contract_hash: assessment.metric_contract_hash, data_snapshot_id: assessment.data_snapshot_id, experiment_id: assessment.experiment_id, generated_at: assessment.assessed_at, limitations: checks.filter(check => check.status !== CHECK_STATUSES.PASS).map(check => check.reason_code) });
  assessment.claim_permissions = evaluateClaimPermissions(contract || {}, evidence, financial || {}, { assignment_valid: assessment.assignment_integrity === CHECK_STATUSES.PASS, exposure_valid: assessment.exposure_integrity === CHECK_STATUSES.PASS, outcome_valid: assessment.outcome_integrity === CHECK_STATUSES.PASS, integrity_status: causalFatal ? "fail" : causalBlocked ? "blocked" : "pass", blocking_integrity_failure: causalFatal });
  assessment.integrity_status = assessment.overall_status;
  assessment.assessment_timestamp = assessment.assessed_at;
  assessment.blocking_reasons = assessment.blockers.map(check => check.reason_code).filter(Boolean);
  assessment.lineage_status = lineage.valid ? "VALID" : "BLOCKED";
  assessment.claim_impact = {
    can_report_descriptive: true,
    can_report_experimental: assessment.claim_permissions.can_claim_causal_effect,
    can_report_causal: assessment.claim_permissions.can_claim_causal_effect,
    can_report_incremental_revenue: assessment.claim_permissions.can_claim_incremental_revenue,
    can_report_incremental_profit: assessment.claim_permissions.can_claim_incremental_profit,
    can_recommend_scale: assessment.claim_permissions.can_recommend_scale,
    can_recommend_modify: assessment.claim_permissions.can_recommend_modify,
    can_recommend_stop: assessment.claim_permissions.can_recommend_stop
  };
  return assessment;
}

function assessLineage(input, contract) {
  if (!contract) return { valid: false, message: "Metric Contract lineage is unresolved." };
  const expected = getContractHash(contract);
  if (input.metricContractId && input.metricContractId !== contract.contract_id) return { valid: false, message: "Metric Contract ID mismatch." };
  if (input.metricContractVersion && Number(input.metricContractVersion) !== Number(contract.version)) return { valid: false, message: "Metric Contract version mismatch." };
  if (input.metricContractHash && input.metricContractHash !== expected) return { valid: false, message: "Metric Contract hash mismatch." };
  if (input.experimentId && input.experiment?.metricContractHash && input.experiment.metricContractHash !== expected) return { valid: false, message: "Experiment lineage mismatch." };
  if (input.dataSnapshotId && contract.data_snapshot_id && input.dataSnapshotId !== contract.data_snapshot_id) return { valid: false, message: "Data snapshot mismatch." };
  return { valid: true, message: "Contract and supplied lineage are consistent." };
}

function sampleRatio(expectedAllocation, assignments) {
  const groups = Object.keys(expectedAllocation).filter(key => Number(expectedAllocation[key]) > 0);
  if (groups.length < 2 || !assignments.length) return null;
  const total = assignments.length;
  const observed = groups.map(group => assignments.filter(row => (row.assignedGroup ?? row.assigned_group) === group).length);
  const expected = groups.map(group => total * Number(expectedAllocation[group]) / groups.reduce((sum, key) => sum + Number(expectedAllocation[key]), 0));
  const chiSquare = expected.reduce((sum, value, index) => sum + ((observed[index] - value) ** 2) / value, 0);
  const pValue = groups.length === 2 ? erfc(Math.sqrt(chiSquare / 2)) : Math.exp(-chiSquare / 2);
  return { passed: pValue >= 0.01, pValue: Number(pValue.toFixed(6)), chiSquare: Number(chiSquare.toFixed(6)), observed, expected };
}
function statusOf(checks, id) { return checks.find(check => check.check_id === id || check.check_type === id)?.status || CHECK_STATUSES.NOT_EVALUATED; }
function erfc(value) { const t = 1 / (1 + Math.abs(value) / 2); const a = t * Math.exp(-value * value - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return value >= 0 ? a : 2 - a; }
function duplicates(values) { const counts = new Map(); values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1)); return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }

module.exports = { CHECK_STATUSES, PHASES, STATUSES, assessPilotIntegrity, sampleRatio };
