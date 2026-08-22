const assert = require("assert");

const {
  calculateROI,
  createBusinessImpactLedger,
  getBusinessImpactLedger,
  normalizeBusinessImpactLedger,
  updateBusinessImpactLifecycle,
  validateFinanceVerification
} = require("../src/business-impact-ledger");

const context = Object.freeze({
  organizationId: "org_marginlift",
  actorId: "usr_finance",
  actorRole: "owner",
  now: "2026-08-22T00:00:00.000Z"
});

function validInput(overrides = {}) {
  return {
    pilotContractId: "pdc_123",
    financialObjective: "Prove retention pilot profit lift is worth scaling.",
    impactModel: {
      metric: "incremental_profit",
      baselineValue: 1000000,
      observedValue: 1300000,
      unit: "toman",
      calculationMethod: "observed_minus_baseline"
    },
    forecast: {
      predictedImpact: 300000,
      confidenceLevel: "medium",
      assumptions: ["Holdout assignment remains stable", "No major pricing changes"]
    },
    realizedImpact: {
      measuredImpact: 0,
      measurementWindow: { days: 30 },
      evidenceSource: null
    },
    roi: {
      investmentCost: 100000,
      grossValue: 300000
    },
    ...overrides
  };
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

function run() {
  assert.deepStrictEqual(calculateROI({ investmentCost: 100, grossValue: 250 }), {
    investmentCost: 100,
    grossValue: 250,
    netValue: 150,
    roiPercentage: 150
  });
  assert.strictEqual(calculateROI({ investmentCost: 0, grossValue: 250 }).roiPercentage, null);

  const normalized = normalizeBusinessImpactLedger({
    organizationId: context.organizationId,
    financialObjective: "Normalize financial proof.",
    impactModel: { baselineValue: 10, observedValue: 15 },
    roi: { investmentCost: 2, grossValue: 7 }
  });
  assert.strictEqual(normalized.impactModel.incrementalValue, 5);
  assert.strictEqual(normalized.forecast.predictedImpact, null);
  assert.strictEqual(normalized.realizedImpact.measuredImpact, null);
  assert.strictEqual(normalized.roi.netValue, 5);

  const emptyDb = {};
  const fallback = getBusinessImpactLedger(emptyDb, context);
  assert.strictEqual(fallback.persisted, false);
  assert.strictEqual(fallback.organizationId, context.organizationId);

  const db = {};
  const created = createBusinessImpactLedger(db, context, validInput());
  assert.strictEqual(created.persisted, true);
  assert.strictEqual(created.organizationId, context.organizationId);
  assert.strictEqual(created.lifecycleStatus, "draft");
  assert.strictEqual(created.financeValidation.status, "not_verified");
  assert.strictEqual(created.forecast.predictedImpact, 300000);
  assert.strictEqual(created.realizedImpact.measuredImpact, 0);
  assert.strictEqual(created.roi.netValue, 200000);
  assert.ok(created.auditEvents.some(event => event.action === "business_impact_created"));

  assertThrowsCode(
    () => createBusinessImpactLedger(db, context, validInput({ organizationId: "org_other" })),
    "CROSS_ORGANIZATION_BUSINESS_IMPACT_ACCESS"
  );
  assert.strictEqual(getBusinessImpactLedger(db, { ...context, organizationId: "org_other" }).persisted, false);

  assertThrowsCode(
    () => updateBusinessImpactLifecycle(db, context, {
      action: "verify",
      financeValidation: { verifiedBy: context.actorId, verifiedAt: context.now }
    }),
    "INVALID_BUSINESS_IMPACT_TRANSITION"
  );

  const submitted = updateBusinessImpactLifecycle(db, context, {
    action: "submit",
    metadata: { reason: "Finance evidence package ready for review." }
  });
  assert.strictEqual(submitted.lifecycleStatus, "submitted");
  assert.strictEqual(submitted.financeValidation.status, "submitted");
  assert.ok(submitted.auditEvents.some(event => event.action === "finance_validation_transition" && event.from === "draft" && event.to === "submitted"));

  assertThrowsCode(
    () => updateBusinessImpactLifecycle(db, context, {
      action: "update",
      financialObjective: "Late objective mutation"
    }),
    "BUSINESS_IMPACT_LOCKED"
  );

  assertThrowsCode(
    () => updateBusinessImpactLifecycle(db, context, {
      action: "verify",
      financeValidation: { verifiedBy: context.actorId, verifiedAt: context.now }
    }),
    "FINANCE_EVIDENCE_SOURCE_REQUIRED"
  );

  const invalidVerified = normalizeBusinessImpactLedger({
    organizationId: context.organizationId,
    financialObjective: "Invalid verified proof.",
    lifecycleStatus: "verified",
    realizedImpact: { evidenceSource: "finance_upload.csv" },
    financeValidation: { status: "verified" },
    roi: { investmentCost: 1, grossValue: 2 }
  });
  assertThrowsCode(() => validateFinanceVerification(invalidVerified), "FINANCE_VERIFIER_REQUIRED");

  const verified = updateBusinessImpactLifecycle(db, context, {
    action: "verify",
    realizedImpact: {
      measuredImpact: 280000,
      measurementWindow: { days: 30 },
      evidenceSource: "finance-reviewed-outcome-v1.csv"
    },
    roi: {
      investmentCost: 100000,
      grossValue: 280000
    },
    financeValidation: {
      verifiedBy: "finance_lead",
      verifiedAt: "2026-09-22T00:00:00.000Z",
      notes: "Matched finance export."
    },
    metadata: { evidenceSource: "finance-reviewed-outcome-v1.csv" }
  });
  assert.strictEqual(verified.lifecycleStatus, "verified");
  assert.strictEqual(verified.financeValidation.status, "verified");
  assert.strictEqual(verified.realizedImpact.evidenceSource, "finance-reviewed-outcome-v1.csv");
  assert.strictEqual(verified.roi.netValue, 180000);
  assert.ok(verified.auditEvents.some(event => event.from === "submitted" && event.to === "verified"));

  assertThrowsCode(
    () => updateBusinessImpactLifecycle(db, context, { action: "reject" }),
    "INVALID_BUSINESS_IMPACT_TRANSITION"
  );

  const firstId = created.id;
  const second = createBusinessImpactLedger(db, { ...context, now: "2026-08-23T00:00:00.000Z" }, validInput({
    financialObjective: "Second financial proof record for a new pilot cycle.",
    roi: { investmentCost: 50000, grossValue: 120000 }
  }));
  assert.notStrictEqual(second.id, firstId);
  assert.strictEqual(db.businessImpactLedgers.length, 2);
  assert.strictEqual(db.businessImpactLedgers.find(item => item.id === firstId).lifecycleStatus, "verified");
  assert.strictEqual(getBusinessImpactLedger(db, context).id, second.id);

  const rejected = updateBusinessImpactLifecycle(db, { ...context, now: "2026-08-24T00:00:00.000Z" }, { action: "submit" });
  assert.strictEqual(rejected.lifecycleStatus, "submitted");
  const finalRejected = updateBusinessImpactLifecycle(db, { ...context, now: "2026-08-25T00:00:00.000Z" }, {
    action: "reject",
    financeValidation: { notes: "Evidence failed finance review." }
  });
  assert.strictEqual(finalRejected.lifecycleStatus, "rejected");
  assert.strictEqual(finalRejected.financeValidation.status, "rejected");
}

run();
console.log("business-impact-ledger tests passed");
