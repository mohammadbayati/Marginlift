const assert = require("assert");

const {
  buildRetentionExperimentBrief,
  buildRetentionShadowRun,
  estimateTwoArmSampleSize
} = require("../src/retention-shadow");

const record = {
  id: "ret_1",
  workspace: { policyVersion: "policy_1", queue: [] },
  baseline: { modelCard: { datasetVersion: "dataset_1", modelVersion: "model_1" } },
  decisionQueue: [
    decision("hash_1", "lapsed", "channel_nudge_test"),
    decision("hash_2", "dormant", "offer_eligibility_review"),
    decision("hash_3", "long_term_lost", "no_action")
  ]
};

const run = buildRetentionShadowRun(record, { capacity: 2, excludedCustomerIds: ["hash_3"] });
assert.strictEqual(run.liveActionAllowed, false);
assert.strictEqual(run.status, "ready");
assert.strictEqual(run.summary.selectedCustomers, 2);
assert.strictEqual(run.summary.excludedCustomers, 1);
assert.ok(run.checks.every(item => item.passed));

const duplicateRecord = JSON.parse(JSON.stringify(record));
duplicateRecord.decisionQueue.push(decision("hash_1", "due", "reminder_test"));
const duplicateRun = buildRetentionShadowRun(duplicateRecord, { capacity: 10 });
assert.strictEqual(duplicateRun.status, "needs_review");
assert.strictEqual(duplicateRun.summary.duplicateCustomers, 1);

const sample = estimateTwoArmSampleSize(0.2, 0.03);
assert.ok(sample >= 50);
const brief = buildRetentionExperimentBrief({ name: "شرکت نمونه" }, record, run, {
  baselineRate: 0.2,
  minimumDetectableEffect: 0.03,
  outcomeWindowDays: 30,
  holdoutRate: 0.2
});
assert.match(brief, /Intention-To-Treat/);
assert.match(brief, /مرز ادعا/);

function decision(customerIdHash, state, recommendedAction) {
  return {
    customerIdHash,
    state,
    recommendedAction,
    recommendedActionFa: recommendedAction,
    averageContributionMargin: 10000,
    policyVersion: "policy_1"
  };
}

console.log("retention-shadow.test.js passed");
