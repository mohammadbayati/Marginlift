const assert = require("assert");

const { buildChurnValueCase } = require("../src/churn-value-case");

const input = {
  eligibleCustomersPerMonth: 10000,
  observedAtRiskRate: 0.2,
  contributionMarginPerRetainedCustomer: 400000,
  monthlyIncentiveSpend: 100000000,
  pilotFee: 50000000,
  sourceWindowFa: "سه ماه منتهی به تیر ۱۴۰۵",
  scenarios: {
    conservative: { incrementalSaveRate: 0.01, avoidableIncentiveRate: 0.02, policyCoverageRate: 0.5 },
    base: { incrementalSaveRate: 0.03, avoidableIncentiveRate: 0.08, policyCoverageRate: 0.7 },
    upside: { incrementalSaveRate: 0.05, avoidableIncentiveRate: 0.15, policyCoverageRate: 0.8 }
  }
};

const forecast = buildChurnValueCase(input);
assert.strictEqual(forecast.scenarios.length, 3);
assert.ok(forecast.scenarios[0].monthlyValue < forecast.scenarios[1].monthlyValue);
assert.ok(forecast.scenarios[1].monthlyValue < forecast.scenarios[2].monthlyValue);
assert.ok(forecast.assumptions.caveatFa.includes("holdout"));
assert.throws(() => buildChurnValueCase({ ...input, observedAtRiskRate: 4 }), /بین صفر و یک/);
assert.throws(() => buildChurnValueCase({ ...input, scenarios: { ...input.scenarios, conservative: null } }), /لازم است/);

console.log("churn-value-case.test.js passed");
