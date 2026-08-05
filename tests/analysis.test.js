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
assert.ok(analysis.actions.some(action => action.titleFa === "بدون پیشنهاد"));
assert.ok(analysis.actions.some(action => action.titleFa === "مشوق قوی"));

const passwordHash = hashPassword("demo1234");
assert.ok(verifyPassword("demo1234", passwordHash));
assert.ok(!verifyPassword("wrong-password", passwordHash));

console.log("analysis.test.js passed");
