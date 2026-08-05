const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { analyzeCampaign } = require("../src/analysis");
const { normalizeCampaignRows, parseCSV } = require("../src/csv");
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
assert.ok(analysis.campaign.revenuePreserved >= 80);
assert.ok(analysis.policy.delta.savings > 0);
assert.strictEqual(analysis.quality.score, 100);
assert.strictEqual(analysis.quality.issues.length, 0);
assert.strictEqual(analysis.guardrails.length, 4);
assert.ok(analysis.guardrails.every(item => item.status === "pass"));
assert.ok(analysis.actions.some(action => action.titleFa === "بدون پیشنهاد"));
assert.ok(analysis.actions.some(action => action.titleFa === "مشوق قوی"));

const loyalSegment = analysis.segments.find(segment => segment.nameFa === "کاربران وفادار اخیر");
const sleepingSegment = analysis.segments.find(segment => segment.nameFa === "کاربران خاموش اما قابل‌فعال‌سازی");
const discountSegment = analysis.segments.find(segment => segment.nameFa === "کاربران حساس به تخفیف");
const dormantSegment = analysis.segments.find(segment => segment.nameFa === "کاربران غیرفعال باارزش بالا");

assert.strictEqual(loyalSegment.actionFa, "بدون پیشنهاد");
assert.strictEqual(sleepingSegment.actionFa, "فقط پوش");
assert.strictEqual(discountSegment.actionFa, "تخفیف کوچک");
assert.strictEqual(dormantSegment.actionFa, "مشوق قوی");
assert.ok(discountSegment.ciLow > 0);
assert.ok(dormantSegment.incrementalProfit > 0);

const passwordHash = hashPassword("demo1234");
assert.ok(verifyPassword("demo1234", passwordHash));
assert.ok(!verifyPassword("wrong-password", passwordHash));

console.log("analysis.test.js passed");
