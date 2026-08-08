const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { analyzeCampaign } = require("../src/analysis");
const { analyzeCustomers } = require("../src/customer-analysis");
const { normalizeCampaignRows, parseCSV } = require("../src/csv");
const { buildReadinessAudit, buildSavingsSnapshot } = require("../src/pilot");
const { hashPassword, verifyPassword } = require("../src/auth");

const csvPath = path.join(__dirname, "..", "synthetic-campaign-data.csv");
const rows = normalizeCampaignRows(parseCSV(fs.readFileSync(csvPath, "utf8")));
const analysis = analyzeCampaign(rows, { name: "تست کمپین" });

assert.strictEqual(rows.length, 16);
assert.strictEqual(analysis.segments.length, 4);
assert.strictEqual(analysis.treatments.length, 4);
assert.ok(analysis.campaign.audience > 0);
assert.ok(analysis.campaign.totalSpend > 0);
assert.ok(analysis.campaign.nextSavings > 0);
assert.ok(analysis.campaign.observedSavings > 0);
assert.ok(analysis.campaign.baselineSpend > analysis.campaign.observedSpend);
assert.ok(analysis.campaign.recommendedContributionProfit > analysis.campaign.baselineContributionProfit);
assert.ok(analysis.campaign.revenuePreserved >= 80);
assert.ok(analysis.policy.delta.savings > 0);
assert.ok(analysis.policy.delta.observedSavings > 0);
assert.strictEqual(analysis.policy.baseline.labelFa, "مشوق قوی");
assert.strictEqual(analysis.policy.observed.sourceFa, "واقعی");
assert.strictEqual(analysis.quality.score, 100);
assert.strictEqual(analysis.quality.issues.length, 0);
assert.strictEqual(analysis.guardrails.length, 5);
assert.ok(analysis.guardrails.some(item => item.status === "warn"));
assert.ok(analysis.actions.some(action => action.titleFa === "بدون پیشنهاد"));
assert.ok(analysis.actions.some(action => action.titleFa === "مشوق قوی"));

const loyalSegment = analysis.segments.find(segment => segment.nameFa === "کاربران وفادار اخیر");
const sleepingSegment = analysis.segments.find(segment => segment.nameFa === "کاربران خاموش اما قابل فعال‌سازی");
const discountSegment = analysis.segments.find(segment => segment.nameFa === "کاربران حساس به تخفیف");
const dormantSegment = analysis.segments.find(segment => segment.nameFa === "کاربران غیرفعال باارزش بالا");

assert.strictEqual(loyalSegment.actionFa, "بدون پیشنهاد");
assert.strictEqual(sleepingSegment.actionFa, "فقط پوش");
assert.strictEqual(discountSegment.actionFa, "تخفیف کوچک");
assert.strictEqual(dormantSegment.actionFa, "مشوق قوی");
assert.ok(discountSegment.ciLow > 0);
assert.ok(dormantSegment.incrementalProfit > 0);
assert.strictEqual(loyalSegment.decisionStatusFa, "اجرا");
assert.strictEqual(discountSegment.decisionStatusFa, "آزمایش بیشتر");
assert.ok(discountSegment.projectedContributionProfit > 0);

const passwordHash = hashPassword("demo1234");
assert.ok(verifyPassword("demo1234", passwordHash));
assert.ok(!verifyPassword("wrong-password", passwordHash));

const noControlCustomerAnalysis = analyzeCustomers([
  {
    customerId: "C-NO-1",
    segmentFa: "مشتریان تست",
    daysSinceLastPurchase: 55,
    orders90d: 1,
    revenue90d: 1000000,
    grossMarginRate: 0.35,
    treatment: "small_discount",
    exposed: true,
    converted: true,
    outcomeRevenue: 500000,
    incentiveCost: 25000,
    channelCost: 2000,
    churned: false
  }
]);
const noControlReadiness = buildReadinessAudit(noControlCustomerAnalysis, analysis, null);
assert.strictEqual(noControlReadiness.status, "diagnostic_only");

const lowConfidenceAnalysis = analyzeCustomers([
  {
    customerId: "C-LOW-1",
    segmentFa: "مشتریان ناقص",
    daysSinceLastPurchase: 30,
    orders90d: 1,
    revenue90d: 0,
    grossMarginRate: 0,
    treatment: "control",
    exposed: false,
    converted: false,
    outcomeRevenue: 0,
    incentiveCost: 0,
    channelCost: 0,
    churned: false
  },
  {
    customerId: "C-LOW-2",
    segmentFa: "مشتریان ناقص",
    daysSinceLastPurchase: 45,
    orders90d: 1,
    revenue90d: 0,
    grossMarginRate: 0,
    treatment: "small_discount",
    exposed: true,
    converted: false,
    outcomeRevenue: 0,
    incentiveCost: 25000,
    channelCost: 2000,
    churned: true
  }
]);
const lowConfidenceReadiness = buildReadinessAudit(lowConfidenceAnalysis, analysis, null);
const lowConfidenceSnapshot = buildSavingsSnapshot(lowConfidenceAnalysis, analysis, lowConfidenceReadiness, null);
assert.ok(lowConfidenceSnapshot.expectedIncrementalProfit >= 0);
assert.strictEqual(lowConfidenceSnapshot.confidenceFa, "پایین تا متوسط");

console.log("analysis.test.js passed");
