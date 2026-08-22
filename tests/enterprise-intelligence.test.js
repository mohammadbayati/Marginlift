const assert = require("assert");

const {
  buildEnterpriseIntelligence,
  calculateFinancialBenchmarks,
  calculatePortfolioHealth,
  extractDecisionPatterns,
  identifyInterventionRequired,
  identifyScaleCandidates
} = require("../src/enterprise-intelligence");

const organizationId = "org_marginlift";
const generatedAt = "2026-10-01T00:00:00.000Z";

function contract(id, overrides = {}) {
  return {
    id,
    organizationId,
    lifecycleStatus: "locked",
    primaryKpi: {
      key: "incremental_profit_per_customer",
      label: "Incremental profit per customer",
      targetValue: 150000
    },
    guardrails: [
      { metric: "refund_rate", threshold: "<= 3%" }
    ],
    ...overrides
  };
}

function ledger(id, pilotContractId, overrides = {}) {
  return {
    id,
    organizationId,
    pilotContractId,
    lifecycleStatus: "verified",
    forecast: {
      predictedImpact: 300000
    },
    realizedImpact: {
      measuredImpact: 250000
    },
    roi: {
      netValue: 180000,
      roiPercentage: 180
    },
    financeValidation: {
      status: "verified"
    },
    ...overrides
  };
}

function workflow(id, pilotContractId, businessImpactLedgerId, overrides = {}) {
  return {
    id,
    organizationId,
    pilotContractId,
    businessImpactLedgerId,
    lifecycleStatus: "decision_ready",
    executiveReadiness: {
      decisionContractReady: true,
      dataReady: true,
      experimentReady: true,
      financialProofReady: true
    },
    stages: [
      { key: "draft", status: "completed", evidence: [{ label: "contract" }] },
      { key: "kickoff", status: "completed", evidence: [{ label: "kickoff" }] },
      { key: "data_ready", status: "completed", evidence: [{ label: "data" }] },
      { key: "experiment_running", status: "completed", evidence: [{ label: "experiment" }] },
      { key: "outcome_pending", status: "completed", evidence: [{ label: "outcome" }] },
      { key: "decision_ready", status: "active", evidence: [{ label: "readout" }] }
    ],
    blockers: [],
    audit: {
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z"
    },
    ...overrides
  };
}

function run() {
  const empty = buildEnterpriseIntelligence({}, { organizationId, generatedAt });
  assert.strictEqual(empty.persisted, false);
  assert.strictEqual(empty.portfolio.pilotsTotal, 0);
  assert.strictEqual(empty.portfolio.portfolioHealth, "empty");
  assert.deepStrictEqual(empty.sourceRefs.pilotContractIds, []);

  assert.throws(
    () => buildEnterpriseIntelligence({}, {}),
    error => error && error.code === "AUTH_REQUIRED"
  );

  const db = {
    pilotContracts: [
      contract("pdc_1"),
      contract("pdc_2", {
        lifecycleStatus: "approved",
        primaryKpi: { key: "retention_lift", label: "Retention lift", targetValue: 0.04 },
        guardrails: [{ metric: "unsubscribe_rate", threshold: "<= 2%" }]
      }),
      contract("pdc_other", { organizationId: "org_other" })
    ],
    businessImpactLedgers: [
      ledger("bil_1", "pdc_1"),
      ledger("bil_2", "pdc_2", {
        lifecycleStatus: "submitted",
        forecast: { predictedImpact: 120000 },
        realizedImpact: { measuredImpact: null },
        roi: { netValue: null, roiPercentage: null },
        financeValidation: { status: "submitted" }
      }),
      ledger("bil_other", "pdc_other", { organizationId: "org_other", roi: { netValue: 999999, roiPercentage: 999 } })
    ],
    pilotWorkflows: [
      workflow("pwf_1", "pdc_1", "bil_1"),
      workflow("pwf_2", "pdc_2", "bil_2", {
        lifecycleStatus: "outcome_pending",
        executiveReadiness: {
          decisionContractReady: true,
          dataReady: true,
          experimentReady: false,
          financialProofReady: false
        },
        stages: [
          { key: "outcome_pending", status: "active", dueDate: "2026-09-01", evidence: [] }
        ],
        blockers: [
          { description: "Finance export delayed", severity: "high", status: "open" }
        ],
        audit: {
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z"
        }
      }),
      workflow("pwf_other", "pdc_other", "bil_other", { organizationId: "org_other" })
    ]
  };

  const intelligence = buildEnterpriseIntelligence(db, { organizationId, generatedAt });
  assert.strictEqual(intelligence.organizationId, organizationId);
  assert.strictEqual(intelligence.portfolio.pilotsTotal, 2);
  assert.strictEqual(intelligence.portfolio.verifiedFinancialProofCount, 1);
  assert.strictEqual(intelligence.portfolio.activeBlockersCount, 1);
  assert.strictEqual(intelligence.financialBenchmarks.totalForecastValue, 420000);
  assert.strictEqual(intelligence.financialBenchmarks.totalRealizedValue, 250000);
  assert.strictEqual(intelligence.financialBenchmarks.totalNetValue, 180000);
  assert.strictEqual(intelligence.financialBenchmarks.verifiedImpactRate, 0.5);
  assert.strictEqual(intelligence.financialBenchmarks.topPerformingPilots[0].pilotId, "pwf_1");
  assert.deepStrictEqual(intelligence.sourceRefs.pilotContractIds, ["pdc_1", "pdc_2"]);
  assert.deepStrictEqual(intelligence.sourceRefs.businessImpactLedgerIds, ["bil_1", "bil_2"]);
  assert.deepStrictEqual(intelligence.sourceRefs.pilotWorkflowIds, ["pwf_1", "pwf_2"]);

  assert.ok(intelligence.decisionPatterns.commonBlockers.some(item => item.key === "Finance export delayed"));
  assert.ok(intelligence.decisionPatterns.commonGuardrails.some(item => item.key === "refund_rate"));
  assert.ok(intelligence.decisionPatterns.strongestKpis.some(item => item.key === "incremental_profit_per_customer"));
  assert.ok(intelligence.decisionPatterns.evidenceGaps.some(item => item.gap === "financial_verification_missing"));

  const candidates = identifyScaleCandidates([
    {
      id: "candidate",
      contract: db.pilotContracts[0],
      ledger: db.businessImpactLedgers[0],
      workflow: db.pilotWorkflows[0]
    },
    {
      id: "blocked",
      contract: db.pilotContracts[1],
      ledger: db.businessImpactLedgers[1],
      workflow: db.pilotWorkflows[1]
    }
  ]);
  assert.strictEqual(candidates.length, 1);
  assert.strictEqual(candidates[0].pilotId, "candidate");

  const interventions = identifyInterventionRequired([
    {
      id: "blocked",
      contract: db.pilotContracts[1],
      ledger: db.businessImpactLedgers[1],
      workflow: db.pilotWorkflows[1]
    }
  ], generatedAt);
  assert.strictEqual(interventions.length, 1);
  assert.ok(interventions[0].reasons.includes("high_or_critical_blocker"));
  assert.ok(interventions[0].reasons.includes("missing_financial_verification_near_decision"));
  assert.ok(interventions[0].reasons.includes("stale_lifecycle"));

  const portfolio = calculatePortfolioHealth([
    { workflow: db.pilotWorkflows[0], ledger: db.businessImpactLedgers[0] },
    { workflow: db.pilotWorkflows[1], ledger: db.businessImpactLedgers[1] }
  ]);
  assert.strictEqual(portfolio.pilotsTotal, 2);
  assert.strictEqual(portfolio.decisionReadyCount, 1);

  const benchmarks = calculateFinancialBenchmarks([
    { id: "a", ledger: db.businessImpactLedgers[0] },
    { id: "b", ledger: db.businessImpactLedgers[1] }
  ]);
  assert.strictEqual(benchmarks.totalForecastValue, 420000);
  assert.strictEqual(benchmarks.totalRealizedValue, 250000);

  const patterns = extractDecisionPatterns([
    { id: "a", contract: db.pilotContracts[0], workflow: db.pilotWorkflows[1], ledger: db.businessImpactLedgers[1] }
  ]);
  assert.ok(patterns.lifecycleBottlenecks.some(item => item.key === "outcome_pending"));
}

run();
console.log("enterprise-intelligence tests passed");
