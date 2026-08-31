const assert = require("assert");
const { evidenceMeta } = require("../src/evidence");
const {
  buildRetentionDecisionReceipt,
  buildRetentionPreviewContract,
  buildRetentionReadout,
  buildRetentionToday,
  enrichRetentionWorkspace,
  matchesExpectedDatasetHash
} = require("../src/retention-ux");

function fixtureRecord() {
  return {
    id: "ret_1",
    name: "تحلیل نمونه",
    source: "customer_upload",
    isDemoScenario: false,
    datasetHash: "abc123",
    rowCount: 12,
    cutoffAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
    readiness: { status: "ready", score: 100 },
    baseline: {
      baselineVersion: "km-v1",
      modelCard: { datasetVersion: "data-v1", modelVersion: "km-v1" },
      overall: { curve: [{ timeDays: 0, atRisk: 10, survivalProbability: 1, confidenceLower: 1, confidenceUpper: 1 }] }
    },
    workspace: {
      headlineFa: "خط مبنا آماده است",
      nextActionFa: "Shadow Run بسازید.",
      policyVersion: "policy-v1",
      metrics: { medianRepurchaseDays: 21, queueSize: 1 },
      queue: []
    },
    decisionQueue: [{
      decisionId: "dec_1",
      customerIdHash: "customer_hash",
      recommendedAction: "no_action",
      recommendedActionFa: "بدون اقدام",
      decisionReasonFa: "اثر اقدام هنوز قابل برآورد نیست.",
      evidenceLevel: "observational_estimate",
      confidenceFa: "پایین",
      riskProbability: null,
      saveabilityByAction: null,
      expectedIncrementalProfit: null,
      actionCost: null,
      actionAlternatives: [],
      guardrails: ["human_review"],
      policyVersion: "policy-v1"
    }]
  };
}

function run() {
  const csvText = "customer_id,event_at,amount\nc1,2026-01-01,100";
  const preview = buildRetentionPreviewContract({
    readyForImport: true,
    missingRequired: [],
    privacy: { blocked: false },
    readiness: { checks: [], warnings: [] }
  }, { csvText });
  assert.strictEqual(preview.canImport, true);
  assert.match(preview.datasetHash, /^sha256:[a-f0-9]{64}$/);
  assert.strictEqual(matchesExpectedDatasetHash(preview.datasetHash, preview.datasetHash), true);
  assert.strictEqual(matchesExpectedDatasetHash("different", preview.datasetHash), false);

  const blocked = buildRetentionPreviewContract({
    readyForImport: true,
    missingRequired: [],
    privacy: { blocked: true, piiHeaders: ["mobile"] },
    readiness: { checks: [], warnings: [] }
  }, { csvText });
  assert.strictEqual(blocked.canImport, false);
  assert.ok(blocked.quality.groups.critical.some(item => item.code === "direct_identifier"));

  const record = fixtureRecord();
  const base = {
    evidence: evidenceMeta("observational_estimate"),
    stale: false,
    workspace: record.workspace,
    experiment: null,
    outcome: null
  };
  const contract = enrichRetentionWorkspace(base, { record });
  assert.strictEqual(contract.today.state, "observational_ready");
  assert.strictEqual(contract.today.primaryMetric.value, 21);
  assert.strictEqual(contract.visualizations.retentionCohort.available, true);
  assert.strictEqual(contract.visualizations.treatmentControl.available, false);
  assert.strictEqual(contract.visualizations.profitWaterfall.available, false);

  assert.strictEqual(buildRetentionToday({ record: null, workspace: {}, evidence: evidenceMeta("none") }).state, "awaiting_data");
  assert.strictEqual(buildRetentionToday({ record, stale: true, workspace: record.workspace, evidence: evidenceMeta("observational_estimate") }).state, "needs_data_fix");
  assert.strictEqual(buildRetentionToday({ record, workspace: record.workspace, evidence: evidenceMeta("shadow_result"), shadowRun: { id: "shadow_1" } }).state, "shadow_ready");
  assert.strictEqual(buildRetentionToday({ record, workspace: record.workspace, evidence: evidenceMeta("pilot_estimate"), experiment: { id: "exp_1" } }).state, "pilot_registered");
  assert.strictEqual(buildRetentionToday({ record, workspace: record.workspace, evidence: evidenceMeta("pilot_estimate"), outcome: { summary: {} } }).state, "needs_review");
  assert.strictEqual(buildRetentionToday({ record, workspace: record.workspace, evidence: evidenceMeta("verified_incremental"), outcome: { summary: { incrementalContributionProfitPerAssignedCustomer: 1500 } } }).state, "verified");

  const receipt = buildRetentionDecisionReceipt({ record, contract, decisionId: "dec_1" });
  assert.deepStrictEqual(receipt.unknowns.sort(), ["expected_incremental_profit", "risk_probability", "saveability_by_action"].sort());
  assert.strictEqual(receipt.decision.expectedIncrementalProfit, null);

  for (const role of ["executive", "crm", "finance", "data"]) {
    const readout = buildRetentionReadout({ contract, organization: { id: "org_1", name: "MarginLift" }, record }, role);
    assert.strictEqual(readout.role, role);
    assert.strictEqual(readout.evidence.key, "observational_estimate");
    assert.strictEqual(readout.owners.length, 3);
  }

  console.log("retention-ux-contract.test.js passed");
}

run();
