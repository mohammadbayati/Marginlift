const assert = require("assert");

const {
  buildModelGovernance,
  buildOutcomeMonitor,
  toPublicModelGovernance
} = require("../src/model-governance");
const { appendDecision, verifyDecisionLedger } = require("../src/decision-ledger");

const baselineRows = buildRows(240, 1);
const baseline = buildModelGovernance(baselineRows, null, { generatedAt: "2026-01-01T00:00:00.000Z" });
assert.strictEqual(baseline.backtest.status, "diagnostic");
assert.strictEqual(baseline.backtest.candidates.length, 2);
assert.ok(baseline.backtest.candidates.every(item => item.status === "evaluated"));
assert.strictEqual(baseline.registry.promotionGate.eligible, false);
assert.ok(baseline.registry.promotionGate.checks.some(item => item.key === "decision_grade_pilot" && !item.passed));
assert.strictEqual(baseline.drift.status, "baseline_pending");

const shifted = buildModelGovernance(buildRows(240, 8), baseline, { generatedAt: "2026-02-01T00:00:00.000Z" });
assert.ok(["warning", "critical"].includes(shifted.drift.status));
assert.ok(shifted.drift.features.some(item => item.status !== "stable"));

const publicGovernance = toPublicModelGovernance(shifted);
assert.strictEqual(publicGovernance.dataSnapshot.profile, undefined);
assert.strictEqual(publicGovernance.backtest.candidates.length, 2);

const outcomeMonitor = buildOutcomeMonitor({
  summary: {
    predictedIncrementalProfit: 1000000,
    observedIncrementalProfit: 200000,
    decisionStatus: "iterate",
    evidenceStatus: "decision_grade"
  }
});
assert.strictEqual(outcomeMonitor.status, "critical");
assert.strictEqual(outcomeMonitor.absoluteGap, -800000);

const db = { decisionLedger: [] };
appendDecision(db, ledgerInput("led_1", "data_imported", null));
appendDecision(db, ledgerInput("led_2", "experiment_registered", db.decisionLedger[0].hash));
const verification = verifyDecisionLedger(db.decisionLedger, "org_1");
assert.strictEqual(verification.valid, true);
assert.strictEqual(verification.checked, 2);
db.decisionLedger[0].decisionFa = "دستکاری";
assert.strictEqual(verifyDecisionLedger(db.decisionLedger, "org_1").valid, false);

function buildRows(count, scale) {
  return Array.from({ length: count }, (_, index) => {
    const treatment = index % 2 === 0 ? "control" : "small_discount";
    const risk = index % 100;
    const converted = treatment !== "control" ? risk > 35 : risk > 60;
    return {
      customerId: `C-${scale}-${index}`,
      segmentFa: index % 3 === 0 ? "وفادار" : "در معرض ریزش",
      daysSinceLastPurchase: (10 + risk) * scale,
      orders90d: index % 6,
      revenue90d: (500000 + index * 15000) * scale,
      grossMarginRate: 0.4,
      treatment,
      exposed: treatment !== "control",
      converted,
      outcomeRevenue: converted ? (800000 + risk * 12000) * scale : 0,
      incentiveCost: treatment === "control" ? 0 : 50000 * scale,
      channelCost: treatment === "control" ? 0 : 3000,
      churned: risk > 75,
      channel: index % 2 ? "push" : "sms",
      sourcePresence: {
        customerId: true,
        treatment: true,
        exposure: true,
        outcome: true,
        revenue: true,
        grossMargin: true,
        incentiveCost: true,
        channelCost: true
      }
    };
  });
}

function ledgerInput(id, eventType) {
  return {
    id,
    organizationId: "org_1",
    eventType,
    entityType: "test",
    entityId: id,
    decision: "recorded",
    decisionFa: "ثبت شد",
    rationaleFa: "تست زنجیره تصمیم",
    evidence: { rows: 100 },
    createdAt: `2026-01-0${id.endsWith("1") ? "1" : "2"}T00:00:00.000Z`
  };
}

console.log("model-governance.test.js passed");
