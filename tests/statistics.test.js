const assert = require("assert");

const {
  analyzeExperimentOutcome,
  compareMeans,
  compareProportions,
  decideExperiment,
  studentTCdf,
  studentTQuantile
} = require("../src/statistics");
const { analyzeOutcomeRows } = require("../src/pilot");

const critical = studentTQuantile(0.975, 10);
assert.ok(Math.abs(critical - 2.228138852) < 0.000001);
assert.ok(Math.abs(studentTCdf(critical, 10) - 0.975) < 0.000001);

const meanComparison = compareMeans([2, 3, 4, 5], [0, 1, 1, 2]);
assert.strictEqual(meanComparison.valid, true);
assert.ok(meanComparison.ciLow > 0);
assert.ok(meanComparison.pValue < 0.05);

const sparseConversion = compareProportions(1, 10, 0, 10);
assert.strictEqual(sparseConversion.valid, true);
assert.ok(sparseConversion.ciLow < 0);
assert.ok(sparseConversion.ciHigh > 0);
assert.ok(sparseConversion.ciLow >= -1 && sparseConversion.ciHigh <= 1);

const positiveRows = buildRows({ controlRevenue: 100000, treatmentRevenue: 300000, treatmentCost: 10000 });
const positiveExperiment = buildExperiment(positiveRows, { baseline: false });
const positiveStatistics = analyzeExperimentOutcome(positiveRows, positiveExperiment);
assert.strictEqual(positiveStatistics.valid, true);
assert.strictEqual(positiveStatistics.primary.direction, "positive");
assert.ok(positiveStatistics.primary.ciLow > 0);
assert.strictEqual(positiveStatistics.sample.adequate, true);
assert.ok(positiveStatistics.guardrails.filter(item => item.status !== "unavailable").every(item => item.status === "pass"));

const scaleDecision = decideExperiment({
  integrity: { decisionEligible: true },
  statistics: positiveStatistics,
  observedRoi: 3,
  minimumRoi: 1
});
assert.strictEqual(scaleDecision.status, "scale");

const integratedPositive = analyzeOutcomeRows(
  positiveRows,
  { channelExport: [] },
  { decisionEligible: true },
  positiveExperiment
);
assert.strictEqual(integratedPositive.summary.decisionStatus, "scale");
assert.strictEqual(integratedPositive.summary.evidenceStatus, "decision_grade");
assert.ok(integratedPositive.summary.primaryCiLow > 0);

const harmedRows = buildRows({ controlRevenue: 300000, treatmentRevenue: 80000, treatmentCost: 10000 });
const harmedStatistics = analyzeExperimentOutcome(harmedRows, buildExperiment(harmedRows, { baseline: false }));
const stopDecision = decideExperiment({
  integrity: { decisionEligible: true },
  statistics: harmedStatistics,
  observedRoi: -2,
  minimumRoi: 1
});
assert.strictEqual(stopDecision.status, "stop");
assert.ok(harmedStatistics.guardrails.some(item => item.status === "fail"));

const uncertainRows = buildRows({ controlRevenue: 100000, treatmentRevenue: 105000, treatmentCost: 1000, users: 20 });
const uncertainStatistics = analyzeExperimentOutcome(uncertainRows, buildExperiment(uncertainRows, { baseline: false }));
const iterateDecision = decideExperiment({
  integrity: { decisionEligible: true },
  statistics: uncertainStatistics,
  observedRoi: 2,
  minimumRoi: 1
});
assert.strictEqual(iterateDecision.status, "iterate");
assert.strictEqual(uncertainStatistics.sample.adequate, false);
const integratedUncertain = analyzeOutcomeRows(
  uncertainRows,
  { channelExport: [] },
  { decisionEligible: true },
  buildExperiment(uncertainRows, { baseline: false })
);
assert.strictEqual(integratedUncertain.summary.decisionStatus, "iterate");
assert.strictEqual(integratedUncertain.summary.evidenceStatus, "descriptive_only");

const blockedDecision = decideExperiment({
  integrity: { decisionEligible: false },
  statistics: positiveStatistics,
  observedRoi: 3,
  minimumRoi: 1
});
assert.strictEqual(blockedDecision.status, "needs_review");

const cupedRows = buildRows({ controlRevenue: 120000, treatmentRevenue: 250000, treatmentCost: 8000 });
const cupedStatistics = analyzeExperimentOutcome(cupedRows, buildExperiment(cupedRows, { baseline: true }));
assert.strictEqual(cupedStatistics.primary.cupedApplied, true);
assert.ok(cupedStatistics.primary.varianceReduction >= 0);

function buildRows(options) {
  const users = options.users || 100;
  const rows = [];
  for (let index = 0; index < users; index += 1) {
    const controlRevenue = options.controlRevenue + (index % 5) * 10000;
    const treatmentRevenue = options.treatmentRevenue + (index % 7) * 12000;
    rows.push(outcomeRow(`C-${index}`, "control", controlRevenue, index % 5 < 2, 0));
    rows.push(outcomeRow(`T-${index}`, "small_discount", treatmentRevenue, index % 5 < 4, options.treatmentCost));
  }
  return rows;
}

function outcomeRow(customerId, assignedGroup, revenue, converted, cost) {
  return {
    customerId,
    assignedGroup,
    exposedAt: assignedGroup === "control" ? "" : "2026-01-10",
    converted,
    outcomeRevenue: revenue,
    actualIncentiveCost: cost,
    actualChannelCost: 0,
    grossMarginRate: 0.4
  };
}

function buildExperiment(rows, options) {
  return {
    assignments: rows.map((row, index) => ({
      customerId: row.customerId,
      assignedGroup: row.assignedGroup,
      baselineRevenue: options.baseline ? 500000 + (index % 11) * 30000 : null
    })),
    design: {
      analysisPlan: {
        estimand: "intention_to_treat_policy_vs_control",
        alpha: 0.05,
        targetPower: 0.8,
        minimumSamplePerArm: 50,
        minimumRoi: 1,
        guardrails: {
          revenueRelativeTolerance: -0.05,
          conversionAbsoluteTolerance: -0.02,
          maxCostPerAssignedCustomer: null
        }
      }
    }
  };
}

console.log("statistics.test.js passed");
