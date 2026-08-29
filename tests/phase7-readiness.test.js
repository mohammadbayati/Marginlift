const assert = require("assert");
const fs = require("fs");
const { evaluateBuyerReadiness, createBuyerMetricContract } = require("../src/buyer-productization");

const required = [
  "commercial/common/deal-lifecycle.md", "commercial/common/qualification-gate.md", "commercial/common/discovery-guide.md", "commercial/common/scoping-workshop.md", "commercial/common/buyer-questionnaire.md", "commercial/common/quote-workbook.md", "commercial/common/diagnostic-sow-template.md", "commercial/common/procurement-summary.md", "commercial/common/security-data-due-diligence.md", "commercial/common/data-intake-runbook.md", "commercial/common/kickoff-runbook.md", "commercial/common/diagnostic-runbook.md", "commercial/common/diagnostic-status.md", "commercial/common/evidence-handoff-and-readout.md", "commercial/common/pilot-entry-gate.md", "commercial/common/first-revenue-kpis.md", "commercial/common/sales-message-drafts.md", "commercial/common/first-deal-command-center.md", "commercial/common/real-buyer-handoff-inputs.md", "commercial/common/failure-war-game.md", "commercial/digipay/first-meeting-kit.md", "commercial/digipay/execution-readiness-kit.md", "commercial/digipay/data-schema.json", "commercial/miligold/first-meeting-kit.md", "commercial/miligold/execution-readiness-kit.md", "commercial/miligold/data-schema.json"
];
for (const file of required) assert(fs.existsSync(file), `${file} missing`);

const digiSchema = JSON.parse(fs.readFileSync("commercial/digipay/data-schema.json", "utf8"));
const milliSchema = JSON.parse(fs.readFileSync("commercial/miligold/data-schema.json", "utf8"));
assert(digiSchema.diagnostic_required.includes("customer_id_hash"));
assert(milliSchema.pilot_required.includes("second_purchase_at"));

const blocked = evaluateBuyerReadiness("digipay_crm_policy_optimization_v1", { missingData: ["customer_id_hash"] });
assert.strictEqual(blocked.diagnostic_ready, false);
const draft = createBuyerMetricContract("miligold_second_purchase_v1", { buyer_id: "synthetic_miligold" });
const ready = evaluateBuyerReadiness("miligold_second_purchase_v1", { metricContract: draft });
assert.strictEqual(ready.pilot_ready, false);

for (const file of ["commercial/digipay/first-meeting-kit.md", "commercial/miligold/first-meeting-kit.md"]) {
  const text = fs.readFileSync(file, "utf8");
  assert(text.includes("INTERNAL SALES PREPARATION"));
  assert(text.includes("NOT CUSTOMER EVIDENCE"));
}
console.log("Phase 7 readiness artifacts and synthetic gate checks passed.");
