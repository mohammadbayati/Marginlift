const assert = require("assert");
const { assessPilotIntegrity, STATUSES, CHECK_STATUSES } = require("../src/pilot-integrity");
const { persistIntegrityAssessment, getLatestIntegrityAssessment, verifyAssessmentHash } = require("../src/pilot-integrity-store");
const { resolveBuyerReadoutTrust } = require("../src/buyer-readout-trust");
const { freezeMetricContract, transitionMetricContract, createMetricContract } = require("../src/metric-contract");

const base = { contract_id:"mc_h", buyer_id:"b", use_case:"u", version:1, data_snapshot_id:"s", eligible_population:"e", exclusions:["none"], analysis_population:"a", assignment_unit:"customer_id", randomization_method:"hash", assignment_seed:"seed", holdout_percentage:50, treatment_definition:"t", control_definition:"c", exposure_definition:"e", delivery_definition:"d", primary_kpi:"conversion", outcome_window:"30d", analysis_cutoff:"2026-10-01T00:00:00Z", estimand:"itt", confidence_level:.95, MDE:.1, minimum_sample:1, margin_formula:"r-c", incentive_cost:"i", messaging_cost:{state:"NOT_APPLICABLE", reason:"included"}, channel_cost:"c", operational_cost:"o", contamination_policy:"none", concurrent_campaign_policy:"exclude", missing_data_policy:"fail", stopping_rule:"window", guardrails:["none"], finance_owner:"f", CRM_owner:"c", data_owner:"d", outcome_owner:"o", approved_by:"a", approved_at:"2026-08-30T00:00:00Z" };
const contract = freezeMetricContract(transitionMetricContract(createMetricContract(base), "APPROVED"));
const assignments = [{ customerId:"1", assignedGroup:"control", assignedAt:"2026-08-31T00:00:00Z" }, { customerId:"2", assignedGroup:"treatment", assignedAt:"2026-08-31T00:00:00Z" }];
const assessment = assessPilotIntegrity({ phase:"READOUT", pilotId:"p", experimentId:"e", metricContract:contract, assignments, experiment:{ id:"e", design:{ expectedAllocation:{control:.5,treatment:.5} } }, exposures:[{customerId:"2", exposedAt:"2026-09-01T00:00:00Z"}], deliveries:[{customerId:"2", delivered:true, deliveredAt:"2026-09-01T01:00:00Z"}], outcomes:assignments.map(row=>({...row,outcomeRevenue:1})), financialProvenance:{ formula_id:"f",formula_version:"1",currency:"IRR",revenue_source:"r",margin_source:"m",incentive_cost_source:"i",messaging_cost_source:"m",channel_cost_source:"c",operational_cost_source:"o",buyer_approved_by:"f",buyer_approved_at:"2026-08-30",data_snapshot_id:"s",as_of:"2026-09-01" }, metricContractHash:contract.contract_hash, dataSnapshotId:"s" });
assert.ok(assessment.checks.some(check => check.check_id === "delivery"));
assert.ok(assessment.checks.some(check => check.reason_code === "INT_CONCURRENT_CAMPAIGN_UNKNOWN"));
assert.ok(assessment.checks.some(check => check.reason_code === "INT_CONTACT_CAP_UNKNOWN"));

const db = {};
const first = persistIntegrityAssessment(db, assessment);
const second = persistIntegrityAssessment(db, { ...assessment, assessed_at:"2026-09-02T00:00:00Z" });
assert.strictEqual(db.pilotIntegrityAssessments.length, 2);
assert.strictEqual(first.assessment_version, 1);
assert.strictEqual(second.assessment_version, 2);
assert.strictEqual(verifyAssessmentHash(first), true);
assert.strictEqual(getLatestIntegrityAssessment(db, "p", "e").assessment_id, second.assessment_id);
const trust = resolveBuyerReadoutTrust({ db, pilotId:"p", experimentId:"e" });
assert.ok(["CURRENT_VALID", "BLOCKED"].includes(trust.verification_status));
assert.ok(trust.claim_permissions);
console.log("phase2.5 hardening tests passed");
