const assert = require("assert");

const {
  applyMetricContractChange,
  buildDefaultMetricContract,
  createMetricContractVersion,
  metricContractReadiness
} = require("../src/metric-contract");

let contract = buildDefaultMetricContract("org_test", {
  presetKey: "super_app_packages",
  display: { channelFa: "اپلیکیشن آپ", purchaseObjectFa: "بسته اینترنت" }
});

assert.strictEqual(contract.status, "draft");
assert.ok(contract.channelChurnDefinitionFa.includes("بسته اینترنت"));
assert.strictEqual(metricContractReadiness(contract).ready, false);

contract = applyMetricContractChange(contract, {
  action: "save",
  minimumSamplePerPolicy: 20,
  samplePlanning: {
    assumedContributionProfitStdDev: 10000,
    minimumDetectableContributionProfitPerCustomer: 10000
  },
  finance: { grossMarginDefinitionFa: "کمیسیون خالص اپراتور پس از برگشت" },
  decisionRules: {
    minIncrementalNetRevenuePerAssignedCustomer: 0,
    maxIncrementalIncentiveCostPerAssignedCustomer: 2000,
    maxOptOutRateDelta: 0.005,
    maxComplaintRateDelta: 0.002,
    thresholdBasisFa: "مصوب Finance و CRM براساس baseline سود و نرخ شکایت دوره قبل"
  },
  currentPolicy: {
    descriptionFa: "سیاست فعلی CRM براساس خواب خرید و سقف تماس اجرا می‌شود.",
    ownerFa: "مالک CRM",
    actionsLogged: true,
    reproducible: true
  },
  owners: {
    crmFa: "مالک CRM",
    dataFa: "مالک داده",
    financeFa: "مالک مالی",
    experimentFa: "مالک آزمایش"
  }
});

contract = applyMetricContractChange(contract, { action: "approve_crm" }, { actorId: "crm" });
contract = applyMetricContractChange(contract, { action: "approve_data" }, { actorId: "data" });
contract = applyMetricContractChange(contract, { action: "approve_finance" }, { actorId: "finance" });
assert.strictEqual(metricContractReadiness(contract).ready, true);
assert.strictEqual(contract.samplePlanning.recommendedMinimumSamplePerPolicy, 16);

contract = applyMetricContractChange(contract, { action: "lock" }, { actorId: "owner" });
assert.strictEqual(contract.status, "locked");
assert.throws(() => applyMetricContractChange(contract, { action: "save", eligibilityFa: "changed" }), /نسخه جدید/);

const next = createMetricContractVersion(contract, { actorId: "owner" });
assert.strictEqual(next.version, 2);
assert.strictEqual(next.status, "draft");
assert.strictEqual(next.approvals.finance, null);

console.log("metric-contract.test.js passed");
