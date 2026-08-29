const assert = require("assert");
const fs = require("fs");

const model = JSON.parse(fs.readFileSync("commercial/common/commercial-offer-model.json", "utf8"));
assert.strictEqual(model.primary_first_sale, "PAID_DIAGNOSTIC");
assert(model.ladder.some(stage => stage.stage === "CONTROLLED_PILOT"));
assert(model.exclusions.includes("guaranteed uplift or profit"));
assert(model.scope_adjusters.includes("additional cohort"));

const files = [
  "commercial/digipay/proposal-v2.md", "commercial/digipay/diagnostic-offer.md", "commercial/digipay/pilot-offer.md", "commercial/digipay/data-request.md",
  "commercial/miligold/proposal-v2.md", "commercial/miligold/diagnostic-offer.md", "commercial/miligold/pilot-offer.md", "commercial/miligold/data-request.md"
];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  assert(text.length > 200, `${file} should contain a complete artifact`);
  assert(!/(?:we|MarginLift)\s+(?:will|can)\s+guarantee(?:d)?\s+(?:uplift|profit|ROI)/i.test(text), `${file} contains a guarantee`);
  assert(!/(?:will|guarantee|provide)\s+(?:a\s+)?turnkey\s+VPC/i.test(text), `${file} contains an unsupported turnkey VPC claim`);
}
const digi = fs.readFileSync("commercial/digipay/proposal-v2.md", "utf8");
assert(digi.includes("one product and one cohort"));
assert(digi.includes("CRM remains the execution system"));
const milli = fs.readFileSync("commercial/miligold/proposal-v2.md", "utf8");
assert(milli.includes("First Purchase to Second Purchase"));
assert(milli.includes("outcome window"));
console.log("Commercial offer consistency tests passed.");
