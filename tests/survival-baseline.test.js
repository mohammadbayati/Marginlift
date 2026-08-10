const assert = require("assert");

const { auditPointInTimeDataset, buildSurvivalBaseline, estimateKaplanMeier } = require("../src/survival-baseline");

const simple = estimateKaplanMeier([
  episode(10, true),
  episode(20, true),
  episode(30, false)
], [10, 20, 30]);

assert.strictEqual(simple.curve.length, 4);
assert.strictEqual(simple.curve[1].atRisk, 3);
assert.strictEqual(simple.curve[1].survivalProbability, 0.666667);
assert.strictEqual(simple.curve[2].survivalProbability, 0.333333);
assert.strictEqual(simple.curve[3].survivalProbability, 0.333333);
assert.strictEqual(simple.medianTimeToRepurchaseDays, 20);
assert.strictEqual(simple.horizons[0].repurchaseProbability, 0.333333);
assert.strictEqual(simple.horizons[1].repurchaseProbability, 0.666667);

const tied = estimateKaplanMeier([
  episode(10, true),
  episode(10, false),
  episode(20, true)
], [10]);
assert.strictEqual(tied.curve[1].atRisk, 3);
assert.strictEqual(tied.curve[1].events, 1);
assert.strictEqual(tied.curve[1].censored, 1);
assert.strictEqual(tied.curve[1].survivalProbability, 0.666667);

const dataset = {
  datasetVersion: "dataset_v1",
  cutoffAt: "2025-04-01T00:00:00.000Z",
  unitOfAnalysis: "customer_channel_product_type",
  reconciliation: { reconciled: true, afterCutoffRows: 0 },
  episodes: [
    pointInTimeEpisode(10, true, "operator_a", "monthly", "2025-01-01T00:00:00.000Z"),
    pointInTimeEpisode(20, true, "operator_a", "monthly", "2025-01-20T00:00:00.000Z"),
    pointInTimeEpisode(30, false, "operator_a", "monthly", "2025-02-01T00:00:00.000Z"),
    pointInTimeEpisode(15, true, "operator_b", "weekly", "2025-03-01T00:00:00.000Z")
  ],
  snapshots: [{ indexDate: "2025-04-01T00:00:00.000Z" }]
};

const baseline = buildSurvivalBaseline(dataset, { minimumGroupEpisodes: 2 });
assert.strictEqual(baseline.datasetVersion, "dataset_v1");
assert.strictEqual(baseline.groups.length, 1);
assert.strictEqual(baseline.groups[0].key, "operator_a|monthly");
assert.strictEqual(baseline.diagnostics.excludedSmallGroups, 1);
assert.strictEqual(baseline.evidenceLevel, "observational_baseline");
assert.ok(baseline.caveatsFa.some(item => item.includes("شخصی")));
assert.strictEqual(baseline.leakageAudit.passed, true);
assert.strictEqual(baseline.modelCard.decisionPermission, "shadow_only");
assert.strictEqual(baseline.modelCard.datasetVersion, "dataset_v1");

const leakedDataset = JSON.parse(JSON.stringify(dataset));
leakedDataset.episodes[0].features.nextPurchaseDays = 10;
assert.strictEqual(auditPointInTimeDataset(leakedDataset).passed, false);

const rerun = buildSurvivalBaseline(dataset, { minimumGroupEpisodes: 2 });
assert.strictEqual(baseline.baselineVersion, rerun.baselineVersion);

assert.throws(() => estimateKaplanMeier([]), /episode/);
assert.throws(() => buildSurvivalBaseline({ datasetVersion: "x", episodes: [] }), /episode/);

function episode(durationDays, eventObserved, operator = "operator_a", packageType = "monthly") {
  return { durationDays, eventObserved, operator, packageType };
}

function pointInTimeEpisode(durationDays, eventObserved, operator, packageType, startedAt) {
  const start = new Date(startedAt);
  const end = new Date(start.getTime() + durationDays * 86400000);
  return {
    ...episode(durationDays, eventObserved, operator, packageType),
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    features: { purchaseCountToDate: 2, averageGapDaysToDate: 30 }
  };
}

console.log("survival-baseline.test.js passed");
