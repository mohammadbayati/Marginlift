const assert = require("assert");
const { applyBuyerReadoutTrust, resolveBuyerReadoutTrust } = require("../src/buyer-readout-trust");
const { persistIntegrityAssessment } = require("../src/pilot-integrity-store");

const db = { pilotIntegrityAssessments: [] };
const base = { assessment_id:"a1", pilot_id:"p", experiment_id:"e", assessment_version:1, assessment_hash:null, overall_status:"READY", metric_contract_id:"mc", metric_contract_version:1, metric_contract_hash:"h", checks:[], blocking_reasons:[], claim_permissions:{ can_claim_causal_effect:true, can_claim_incremental_revenue:true, can_claim_incremental_profit:true, can_recommend_scale:true, can_recommend_modify:true, can_recommend_stop:true } };
const ready = persistIntegrityAssessment(db, base);
const invalid = persistIntegrityAssessment(db, { ...base, assessment_id:"a2", assessment_version:2, overall_status:"INVALIDATED", blocking_reasons:["INT_CONTROL_CONTAMINATION"], claim_permissions:{ can_claim_causal_effect:false, can_claim_incremental_revenue:false, can_claim_incremental_profit:false, can_recommend_scale:false, can_recommend_modify:false, can_recommend_stop:false } });
const trust = resolveBuyerReadoutTrust({ db, pilotId:"p", experimentId:"e" });
assert.strictEqual(trust.verification_status, "BLOCKED");
assert.strictEqual(trust.trust_status, "INVALIDATED");
assert.ok(trust.blocking_reasons.includes("INT_CONTROL_CONTAMINATION"));
const safe = applyBuyerReadoutTrust({ verified: true, causal: true, totalRealizedValue: 10, observedRevenue: 10 }, trust);
assert.strictEqual(safe.verified, false); // legacy input cannot escalate trust
assert.strictEqual(safe.buyerReadoutTrust.claim_permissions.can_claim_profit, undefined);
assert.strictEqual(safe.verified_claims_suppressed, true);
assert.strictEqual(safe.observedRevenue, 10);
assert.notStrictEqual(ready.assessment_id, invalid.assessment_id);
console.log("phase2.6 universal trust tests passed");
