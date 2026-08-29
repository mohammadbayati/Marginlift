const assert = require("assert");
const { buildBuyerEvidenceMarkdown, buildBuyerEvidencePackage, STATUSES } = require("../src/buyer-evidence-package");

const trust = { trust_status:"TRUSTED", verification_status:"CURRENT_VALID", evidence_level:"VERIFIED_INCREMENTAL", claim_permissions:{ can_claim_causal_effect:true, can_claim_incremental_revenue:true, can_claim_incremental_profit:true, can_recommend_scale:true, can_recommend_modify:true, can_recommend_stop:true }, contract_lineage:{id:"mc",version:1,hash:"h"}, assessment_reference:{id:"a",version:1,hash:"ah"}, blocking_reasons:[], limitations:[] };
const contract = { contract_id:"mc", version:1, contract_hash:"h", buyer_id:"synthetic", use_case:"synthetic", eligible_population:"all", exclusions:["none"], assignment_unit:"customer_id", randomization_method:"hash", primary_kpi:"conversion", outcome_window:"30d", minimum_sample:10, MDE:.1, estimand:"itt", margin_formula:"revenue-cost", stopping_rule:"window", status:"FROZEN", finance_owner:"f", CRM_owner:"c", data_owner:"d", outcome_owner:"o" };
const pkg = buildBuyerEvidencePackage({ generatedAt:"2026-01-01T00:00:00Z", buyerReadoutTrust:trust, integrityAssessment:{assessment_id:"a",assessment_version:1,assessment_hash:"ah",overall_status:"READY",checks:[]}, metricContract:contract, pilotId:"p", experimentId:"e", dataReadiness:{status:"DATA_READY",missing_fields:[]}, outcomeSummary:{conversion:0.2}, businessImpact:{realizedImpact:{measuredImpact:100},roi:{netValue:20}}, financialProvenance:{status:"FINANCIAL_COMPLETE",formula_id:"f"} });
assert.strictEqual(pkg.package_status, STATUSES.COMPLETE);
assert.strictEqual(pkg.claim_summary.claims_we_can_make.some(item=>item.claim_type === "INCREMENTAL_PROFIT"), true);
assert.ok(pkg.package_hash.startsWith("sha256:"));
assert.ok(buildBuyerEvidenceMarkdown(pkg).includes("Executive Decision"));
const blocked = buildBuyerEvidencePackage({ buyerReadoutTrust:{ trust_status:"UNRESOLVED", verification_status:"BLOCKED", claim_permissions:{}, blocking_reasons:["TRUST_ASSESSMENT_MISSING"] }, metricContract:contract, pilotId:"p", experimentId:"e" });
assert.strictEqual(blocked.package_status, STATUSES.BLOCKED);
assert.strictEqual(blocked.claim_summary.claims_we_cannot_make.length > 0, true);
assert.strictEqual(blocked.executive_decision.decision, "NO_VERIFIED_DECISION");
console.log("buyer evidence package tests passed");
