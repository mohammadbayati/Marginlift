const assert = require("assert");
const { buildEnterpriseProductSurface } = require("../src/enterprise-product-surface");

function baseInput(role = "viewer") {
  return {
    organization: { id: "org_1", name: "Acme" },
    role,
    pilotState: {
      customerAnalysis: { id: "cust_1" },
      experiment: { id: "exp_1" },
      readiness: { score: 83, statusFa: "ready" },
      savingsSnapshot: {
        avoidableIncentiveCost: 120000,
        claimLevelFa: "pilot observation",
        evidenceTagFa: "observed"
      },
      pilotControlSummary: {
        id: "workflow_1",
        persisted: true,
        lifecycleStatus: "decision_ready",
        blockersCount: 0,
        completedStagesCount: 4,
        totalStagesCount: 4,
        evidenceRefs: ["evidence_1"]
      },
      pilotAcceptanceSummary: {
        id: "accept_1",
        persisted: true,
        lifecycleStatus: "accepted",
        certificationStatus: "certified",
        evidenceRefs: ["package_1"],
        auditEventIds: ["audit_1"]
      }
    },
    enterpriseIntelligence: {
      portfolio: {
        pilotsTotal: 1,
        activeBlockersCount: 0,
        portfolioHealth: "strong"
      },
      financialBenchmarks: {
        totalRealizedValue: 36000,
        verifiedImpactRate: 1
      },
      decisionPatterns: {
        lifecycleBottlenecks: [{ key: "decision_ready", count: 1 }],
        evidenceGaps: []
      },
      executiveIntelligence: {
        interventionRequired: []
      },
      sourceRefs: {
        pilotContractIds: ["contract_1"],
        businessImpactLedgerIds: ["ledger_1"],
        pilotWorkflowIds: ["workflow_1"]
      }
    },
    modelGovernance: {
      modelGovernance: {
        claimLevel: "pilot_observation",
        claimLevelFa: "pilot observation",
        registry: {
          championId: "model_1",
          candidates: [{ id: "model_1" }],
          promotionGate: { blocked: false }
        }
      },
      outcomeMonitor: { status: "ok", summaryFa: "healthy" }
    },
    decisionLedger: {
      integrity: {
        valid: true,
        checked: 2,
        latestHash: "hash_1"
      },
      entries: [{ id: "decision_1" }]
    }
  };
}

function run() {
  const viewerSurface = buildEnterpriseProductSurface(baseInput("viewer"));
  assert.strictEqual(viewerSurface.boundary.autonomousDecisions, false);
  assert.strictEqual(viewerSurface.boundary.autonomousRecommendations, false);
  assert.strictEqual(viewerSurface.permissions.readOnly, true);
  assert(!viewerSurface.navigation.some(item => item.key === "settings"));
  assert(!viewerSurface.navigation.some(item => item.key === "strategy"));
  assert(!viewerSurface.navigation.some(item => item.key === "transformation"));
  assert(!viewerSurface.navigation.some(item => item.key === "data-integrations"));
  assert(!viewerSurface.sections.some(item => item.key === "settings"));
  assert(!viewerSurface.sections.some(item => item.key === "strategy"));
  assert(!viewerSurface.sections.some(item => item.key === "transformation"));
  assert(!viewerSurface.sections.some(item => item.key === "data-integrations"));
  assert.deepStrictEqual(viewerSurface.capabilityGaps, []);
  assert.strictEqual(viewerSurface.internalCapabilityMap, null);

  const adminSurface = buildEnterpriseProductSurface(baseInput("admin"));
  assert(adminSurface.navigation.some(item => item.key === "settings"));
  assert.strictEqual(adminSurface.permissions.canApprove, true);
  assert(adminSurface.internalCapabilityMap.entries.some(item => item.key === "enterprise-replication"));
  assert(adminSurface.capabilityGaps.every(item => item.customerVisible === false));

  const cards = viewerSurface.controlCenter.cards;
  assert(cards.length >= 10);
  assert(!cards.some(item => item.status === "unavailable"));
  assert(!cards.some(item => item.key === "active-transformations"));
  assert(!cards.some(item => item.key === "capability-maturity"));
  assert(!cards.some(item => item.key === "integration-health"));
  for (const card of cards) {
    assert(card.trace.sourceModule, `${card.key} must expose a source module`);
    assert("sourceRecordId" in card.trace, `${card.key} must expose a source record field`);
    assert("evidenceRefs" in card.trace, `${card.key} must expose evidence refs`);
    assert("reportRoute" in card.trace, `${card.key} must expose report route field`);
    assert("why" in card.trace, `${card.key} must explain why`);
  }

  const realizedValue = cards.find(item => item.key === "verified-realized-value");
  assert.strictEqual(realizedValue.value, 36000);
  assert.strictEqual(realizedValue.trace.sourceRecordId, "ledger_1");
  assert.strictEqual(realizedValue.status, "healthy");

  const reports = viewerSurface.sections.find(item => item.key === "reports");
  assert(reports.entries.some(item => item.sourceRoute === "/api/pilot/acceptance/package.md"));
  const pilot = viewerSurface.sections.find(item => item.key === "pilot");
  assert(pilot.entries.some(item => item.key === "production-acceptance"));

  const blockedSurface = buildEnterpriseProductSurface({
    ...baseInput("analyst"),
    enterpriseIntelligence: {
      ...baseInput("analyst").enterpriseIntelligence,
      portfolio: {
        pilotsTotal: 1,
        activeBlockersCount: 2,
        portfolioHealth: "at_risk"
      },
      executiveIntelligence: {
        interventionRequired: [{ reasons: ["high_or_critical_blocker", "stale_lifecycle"] }]
      }
    }
  });
  assert.strictEqual(blockedSurface.controlCenter.state, "blocked");
  assert.strictEqual(blockedSurface.controlCenter.cards.find(item => item.key === "critical-blockers").status, "blocked");
  assert.strictEqual(blockedSurface.controlCenter.cards.find(item => item.key === "evidence-freshness").status, "stale_evidence");

  const emptySurface = buildEnterpriseProductSurface({ organization: { id: "org_1" }, role: "viewer" });
  assert(emptySurface.controlCenter.cards.some(item => item.status === "empty"));
}

run();
console.log("enterprise product surface tests passed");
