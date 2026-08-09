const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.MARGINLIFT_DB = path.join(os.tmpdir(), `marginlift-test-${Date.now()}.json`);
process.env.ARTIFACT_STORAGE_PATH = path.join(os.tmpdir(), `marginlift-artifacts-${Date.now()}`);
process.env.ARTIFACT_ENCRYPTION_KEY = "22".repeat(32);
process.env.MARGINLIFT_LOG_LEVEL = "silent";

const { start } = require("../src/server");

function waitForListening(server) {
  if (server.listening) return Promise.resolve();
  return new Promise(resolve => server.once("listening", resolve));
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

async function run() {
  const server = start(0);
  await waitForListening(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(route, options = {}) {
    const headers = {};
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.cookie) headers.Cookie = options.cookie;

    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    return {
      response,
      payload: await readResponse(response),
      cookie: response.headers.get("set-cookie")
    };
  }

  try {
    const health = await request("/api/health");
    assert.strictEqual(health.response.status, 200);
    assert.strictEqual(health.response.headers.get("x-content-type-options"), "nosniff");
    assert.strictEqual(health.response.headers.get("x-frame-options"), "DENY");

    const healthHead = await request("/api/health", { method: "HEAD" });
    assert.strictEqual(healthHead.response.status, 200);

    for (const page of ["/", "/login", "/signup", "/sales.html", "/styles-v2.css", "/styles-v3.css", "/executive-report-v3.css", "/motion.js", "/executive-report.html", "/executive-report.js", "/privacy.html", "/terms.html", "/security.html", "/pilot-data-request.html", "/vm-deployment.html", "/docs/vm-deployment.md", "/docs/model-governance.md"]) {
      const pageResponse = await request(page);
      assert.strictEqual(pageResponse.response.status, 200, `${page} should be public`);
    }

    const executiveReport = await request("/executive-report.html");
    assert.match(String(executiveReport.payload), /یادداشت تصمیم/);
    assert.match(String(executiveReport.payload), /evidencePassport/);

    const executiveReportStyles = await request("/executive-report-v3.css");
    assert.match(String(executiveReportStyles.payload), /\.report-sheet/);
    assert.match(String(executiveReportStyles.payload), /A4 portrait/);

    const publicHome = await request("/");
    assert(publicHome.payload.includes("تخفیف کمتر"));
    assert(publicHome.payload.includes("/marginlift-command-center.png"));

    const productLogin = await request("/login");
    assert(productLogin.payload.includes('id="authShell"'));
    assert(productLogin.payload.includes('id="appShell"'));

    const fontAsset = await request("/fonts/Estedad-Variable.woff2");
    assert.strictEqual(fontAsset.response.status, 200);
    assert.strictEqual(fontAsset.response.headers.get("content-type"), "font/woff2");

    const signup = await request("/api/auth/signup", {
      method: "POST",
      body: {
        email: `founder-${Date.now()}@marginlift.ir`,
        password: "pilotready"
      }
    });
    assert.strictEqual(signup.response.status, 201);
    assert.strictEqual(signup.payload.data.organization.name, "marginlift");
    assert.ok(signup.cookie);

    const login = await request("/api/auth/login", {
      method: "POST",
      body: {
        email: "growth@example.com",
        password: "demo1234"
      }
    });
    assert.strictEqual(login.response.status, 200);
    assert.ok(login.cookie);

    const cookie = login.cookie.split(";")[0];
    assert.match(cookie, /marginlift_session=[^.]+\.[A-Za-z0-9_-]+/);
    const tamperedCookie = `${cookie.slice(0, -1)}${cookie.endsWith("a") ? "b" : "a"}`;
    const tamperedSession = await request("/api/session", { cookie: tamperedCookie });
    assert.strictEqual(tamperedSession.response.status, 200);
    assert.strictEqual(tamperedSession.payload.data, null);

    const memberEmail = `viewer-${Date.now()}@marginlift.ir`;
    const member = await request("/api/access/members", {
      method: "POST",
      cookie,
      body: { email: memberEmail, password: "viewer-password-2026", role: "viewer", name: "QA Viewer" }
    });
    assert.strictEqual(member.response.status, 201);
    assert.strictEqual(member.payload.data.role, "viewer");

    const viewerLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email: memberEmail, password: "viewer-password-2026" }
    });
    const viewerCookie = viewerLogin.cookie.split(";")[0];
    const viewerRead = await request("/api/customers/current", { cookie: viewerCookie });
    assert.strictEqual(viewerRead.response.status, 200);
    const viewerWrite = await request("/api/imports/csv", {
      method: "POST",
      cookie: viewerCookie,
      body: { csvText: "customer_id,treatment,outcome_revenue_toman\n1,control,0" }
    });
    assert.strictEqual(viewerWrite.response.status, 403);
    assert.strictEqual(viewerWrite.payload.error.code, "INSUFFICIENT_ROLE");
    const viewerOps = await request("/api/ops/metrics", { cookie: viewerCookie });
    assert.strictEqual(viewerOps.response.status, 403);

    const members = await request("/api/access/members", { cookie });
    assert.strictEqual(members.response.status, 200);
    assert.ok(members.payload.data.some(item => item.id === member.payload.data.id));
    const promoteMember = await request(`/api/access/members/${member.payload.data.id}`, {
      method: "PATCH",
      cookie,
      body: { role: "analyst" }
    });
    assert.strictEqual(promoteMember.response.status, 200);
    assert.strictEqual(promoteMember.payload.data.role, "analyst");

    const auditLog = await request("/api/audit-log", { cookie });
    assert.strictEqual(auditLog.response.status, 200);
    assert.strictEqual(auditLog.payload.data.integrity.valid, true);
    assert.ok(auditLog.payload.data.entries.some(item => item.action === "workspace_member_role_changed"));

    const opsMetrics = await request("/api/ops/metrics", { cookie });
    assert.strictEqual(opsMetrics.response.status, 200);
    assert.ok(opsMetrics.payload.data.requests > 0);
    const artifacts = await request("/api/artifacts", { cookie });
    assert.strictEqual(artifacts.response.status, 200);
    assert.deepStrictEqual(artifacts.payload.data, []);
    const event = await request("/api/events", {
      method: "POST",
      cookie,
      body: {
        event: "campaign_imported",
        properties: {
          campaign_name: "Integration test",
          has_file: true
        }
      }
    });
    assert.strictEqual(event.response.status, 201);

    const summary = await request("/api/events/summary", { cookie });
    assert.strictEqual(summary.response.status, 200);
    assert.ok(summary.payload.data.totalEvents >= 1);
    assert.ok(summary.payload.data.funnel.some(item => item.event === "campaign_imported" && item.count >= 1));
    assert.ok(summary.payload.data.latest.some(item => item.event === "campaign_imported"));

    const overview = await request("/api/decision-engine/overview", { cookie });
    assert.strictEqual(overview.response.status, 200);
    assert.strictEqual(overview.payload.data.decisionQueue.length, 4);
    assert.match(overview.payload.data.contract.churnDefinitionFa, /۳۰ روز/);
    assert.ok(overview.payload.data.upliftLab);
    assert.ok(overview.payload.data.upliftLab.qiniCurve.length >= 1);
    assert.ok(overview.payload.data.upliftLab.reactionMix.some(item => item.label === "Persuadables"));
    assert.ok(overview.payload.data.upliftLab.treatmentComparison.some(item => item.key === "control"));

    const customers = await request("/api/customers/current", { cookie });
    assert.strictEqual(customers.response.status, 200);
    assert.ok(customers.payload.data.customer360.length >= 1);
    assert.ok(customers.payload.data.summary.targetableCustomers >= 1);
    assert.strictEqual(customers.payload.data.model.unitFa, "customer_id");

    const experiment = await request("/api/experiments/plan", { cookie });
    assert.strictEqual(experiment.response.status, 200);
    assert.ok(experiment.payload.data.sampleSize.perGroup >= 50);
    assert.ok(experiment.payload.data.guardrailsFa.length >= 3);

    const finance = await request("/api/finance/summary", { cookie });
    assert.strictEqual(finance.response.status, 200);
    assert.ok(finance.payload.data.expectedIncrementalProfit >= 0);

    const audienceExport = await request("/api/exports/audience.csv", { cookie });
    assert.strictEqual(audienceExport.response.status, 200);
    assert.ok(String(audienceExport.payload).includes("customer_id"));

    const customerCsv = fs.readFileSync(path.join(__dirname, "..", "synthetic-customer-events.csv"), "utf8");
    const preview = await request("/api/imports/preview", {
      method: "POST",
      cookie,
      body: {
        csvText: customerCsv
      }
    });
    assert.strictEqual(preview.response.status, 200);
    assert.strictEqual(preview.payload.data.detectedType, "customer");
    assert.strictEqual(preview.payload.data.ready, true);

    const smartImport = await request("/api/imports/csv", {
      method: "POST",
      cookie,
      body: {
        name: "Customer import test",
        csvText: customerCsv
      }
    });
    assert.strictEqual(smartImport.response.status, 201);
    assert.strictEqual(smartImport.payload.data.type, "customer");
    assert.ok(smartImport.payload.data.analysis.summary.targetableCustomers >= 1);
    assert.ok(smartImport.payload.data.analysis.experimentId);
    assert.strictEqual(smartImport.payload.data.analysis.modelGovernance.backtest.status, "insufficient_sample");

    const storedArtifacts = await request("/api/artifacts", { cookie });
    assert.strictEqual(storedArtifacts.response.status, 200);
    assert.strictEqual(storedArtifacts.payload.data.length, 1);
    assert.strictEqual(storedArtifacts.payload.data[0].encryption, "aes-256-gcm");
    const artifactDownload = await request(`/api/artifacts/${storedArtifacts.payload.data[0].id}/download`, { cookie });
    assert.strictEqual(artifactDownload.response.status, 200);
    assert.ok(String(artifactDownload.payload).includes("customer_id"));
    const artifactDelete = await request(`/api/artifacts/${storedArtifacts.payload.data[0].id}`, {
      method: "DELETE",
      cookie
    });
    assert.strictEqual(artifactDelete.response.status, 200);
    assert.strictEqual(artifactDelete.payload.data.deleted, true);

    const governanceAfterImport = await request("/api/model-governance/overview", { cookie });
    assert.strictEqual(governanceAfterImport.response.status, 200);
    assert.strictEqual(governanceAfterImport.payload.data.modelGovernance.dataSnapshot.rowCount, 12);
    assert.strictEqual(governanceAfterImport.payload.data.modelGovernance.dataSnapshot.profile, undefined);
    assert.strictEqual(governanceAfterImport.payload.data.modelGovernance.registry.promotionGate.eligible, false);
    assert.strictEqual(governanceAfterImport.payload.data.decisionLedger.integrity.valid, true);
    assert.ok(governanceAfterImport.payload.data.decisionLedger.entries.some(item => item.eventType === "model_evaluation_completed"));

    const currentExperiment = await request("/api/experiments/current", { cookie });
    assert.strictEqual(currentExperiment.response.status, 200);
    assert.strictEqual(currentExperiment.payload.data.id, smartImport.payload.data.analysis.experimentId);
    assert.ok(currentExperiment.payload.data.dataset.hash.startsWith("sha256:"));
    assert.strictEqual(currentExperiment.payload.data.assignmentSummary.total, 12);
    assert.strictEqual(currentExperiment.payload.data.assignments, undefined);
    assert.strictEqual(currentExperiment.payload.data.assignmentIntegrity.duplicateCustomerIds, undefined);
    assert.strictEqual(currentExperiment.payload.data.design.randomizationEvidence.verified, false);

    const history = await request("/api/analyses/history", { cookie });
    assert.strictEqual(history.response.status, 200);
    assert.ok(history.payload.data.some(item => item.type === "customer"));

    const pilotPackage = await request("/api/pilot/package.md", { cookie });
    assert.strictEqual(pilotPackage.response.status, 200);
    assert.ok(String(pilotPackage.payload).includes("# بسته پایلوت MarginLift"));

    const readiness = await request("/api/readiness/current", { cookie });
    assert.strictEqual(readiness.response.status, 200);
    assert.strictEqual(readiness.payload.data.status, "ready");
    assert.ok(readiness.payload.data.checks.some(item => item.key === "control" && item.passed));

    const pilotWorkspaceBeforeOutcome = await request("/api/pilot/workspace", { cookie });
    assert.strictEqual(pilotWorkspaceBeforeOutcome.response.status, 200);
    assert.ok(pilotWorkspaceBeforeOutcome.payload.data.savingsSnapshot.expectedIncrementalProfit >= 0);
    assert.ok(pilotWorkspaceBeforeOutcome.payload.data.workspace.steps.some(item => item.key === "outcome_received" && !item.complete));

    const outcomeCsv = fs.readFileSync(path.join(__dirname, "..", "synthetic-outcome-data.csv"), "utf8");
    const unlinkedOutcome = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: { name: "Unlinked outcome", csvText: outcomeCsv }
    });
    assert.strictEqual(unlinkedOutcome.response.status, 400);
    assert.strictEqual(unlinkedOutcome.payload.error.code, "EXPERIMENT_ID_REQUIRED");

    const outcomeLines = outcomeCsv.trim().split(/\r?\n/);
    const duplicateOutcomeCsv = `${outcomeLines.join("\n")}\n${outcomeLines[1]}\n`;
    const duplicateOutcome = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: {
        name: "Duplicate outcome",
        csvText: duplicateOutcomeCsv,
        experimentId: currentExperiment.payload.data.id
      }
    });
    assert.strictEqual(duplicateOutcome.response.status, 422);
    assert.strictEqual(duplicateOutcome.payload.error.code, "OUTCOME_INTEGRITY_REJECTED");

    const outcomeImport = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: {
        name: "Outcome import test",
        csvText: outcomeCsv,
        experimentId: currentExperiment.payload.data.id
      }
    });
    assert.strictEqual(outcomeImport.response.status, 201);
    assert.strictEqual(outcomeImport.payload.data.summary.decisionStatus, "needs_review");
    assert.strictEqual(outcomeImport.payload.data.experimentId, currentExperiment.payload.data.id);
    assert.strictEqual(outcomeImport.payload.data.version, 1);
    assert.strictEqual(outcomeImport.payload.data.supersedesOutcomeId, null);
    assert.strictEqual(outcomeImport.payload.data.integrity.status, "needs_review");
    assert.ok(outcomeImport.payload.data.integrity.checks.some(item => item.key === "randomization" && !item.passed));

    const revisedOutcomeImport = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: {
        name: "Outcome import revision",
        csvText: outcomeCsv,
        experimentId: currentExperiment.payload.data.id
      }
    });
    assert.strictEqual(revisedOutcomeImport.response.status, 201);
    assert.strictEqual(revisedOutcomeImport.payload.data.version, 2);
    assert.strictEqual(revisedOutcomeImport.payload.data.supersedesOutcomeId, outcomeImport.payload.data.id);

    const pilotWorkspaceAfterOutcome = await request("/api/pilot/workspace", { cookie });
    assert.strictEqual(pilotWorkspaceAfterOutcome.response.status, 200);
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.workspace.steps.some(item => item.key === "outcome_received" && item.complete));
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.workspace.steps.some(item => item.key === "scale_stop" && item.statusFa === "نیازمند اصلاح شواهد"));
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.savingsSnapshot.claimLevel, "pilot_observation");
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.savingsSnapshot.revenueAtRisk, null);
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.readiness.claimLadder.length, 4);
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.outcome.summary.evidenceStatus, "descriptive_only");
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.outcome.version, 2);
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.outcome.provenance.outcomeVersion, 2);
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.outcome.statistics.primary);
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.outcome.summary.primaryEstimatePerCustomer !== undefined, true);
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.outcome.integrity.checks.some(item => item.key === "preregistration" && !item.passed));

    const readout = await request("/api/pilot/readout.md", { cookie });
    assert.strictEqual(readout.response.status, 200);
    assert.ok(String(readout.payload).includes("# گزارش پایلوت MarginLift"));
    assert.ok(String(readout.payload).includes("## شناسنامه و سلامت آزمایش"));
    assert.ok(String(readout.payload).includes("## نتیجه آماری و عدم‌قطعیت"));
    assert.ok(String(readout.payload).includes("## سلامت و حاکمیت مدل"));
    assert.ok(String(readout.payload).includes(currentExperiment.payload.data.id));
    assert.ok(String(readout.payload).includes("بازبینی"));
    assert.ok(String(readout.payload).includes("تأییدنشده"));

    const report = await request("/api/campaigns/current/report", { cookie });
    assert.strictEqual(report.response.status, 200);
    assert.ok(String(report.payload).includes("# گزارش MarginLift"));

    const registeredExperiment = await request("/api/experiments/register", {
      method: "POST",
      cookie,
      body: { name: "Prospective server-generated pilot", holdoutRate: 0.2, outcomeWindowDays: 30 }
    });
    assert.strictEqual(registeredExperiment.response.status, 201);
    assert.strictEqual(registeredExperiment.payload.data.status, "registered");
    assert.strictEqual(registeredExperiment.payload.data.design.randomizationEvidence.verified, true);
    assert.strictEqual(registeredExperiment.payload.data.design.randomizationEvidence.source, "server_generated");
    assert.strictEqual(registeredExperiment.payload.data.assignments, undefined);
    assert.strictEqual(registeredExperiment.payload.data.randomizationSeed, undefined);
    const persistedExperiment = JSON.parse(fs.readFileSync(process.env.MARGINLIFT_DB, "utf8"))
      .experiments.find(item => item.id === registeredExperiment.payload.data.id);
    assert.match(persistedExperiment.randomizationSeed, /^[a-f0-9]{64}$/);
    assert.strictEqual(
      `sha256:${require("crypto").createHash("sha256").update(persistedExperiment.randomizationSeed).digest("hex")}`,
      persistedExperiment.design.randomizationEvidence.seedHash
    );

    const governanceAfterRegistration = await request("/api/model-governance/overview", { cookie });
    assert.strictEqual(governanceAfterRegistration.response.status, 200);
    assert.strictEqual(governanceAfterRegistration.payload.data.decisionLedger.integrity.valid, true);
    assert.ok(governanceAfterRegistration.payload.data.decisionLedger.entries.some(item => item.eventType === "experiment_registered"));

    const ledger = await request("/api/decision-ledger", { cookie });
    assert.strictEqual(ledger.response.status, 200);
    assert.strictEqual(ledger.payload.data.integrity.valid, true);
    assert.ok(ledger.payload.data.entries.some(item => item.eventType === "outcome_evaluated"));

    const assignmentExport = await request("/api/experiments/current/assignments.csv", { cookie });
    assert.strictEqual(assignmentExport.response.status, 200);
    assert.ok(String(assignmentExport.payload).includes("experiment_id,customer_id,assigned_group"));
    assert.ok(String(assignmentExport.payload).includes(registeredExperiment.payload.data.id));

    const duplicateRegistration = await request("/api/experiments/register", {
      method: "POST",
      cookie,
      body: { holdoutRate: 0.2 }
    });
    assert.strictEqual(duplicateRegistration.response.status, 409);
    assert.strictEqual(duplicateRegistration.payload.error.code, "ACTIVE_EXPERIMENT_EXISTS");
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (fs.existsSync(process.env.MARGINLIFT_DB)) fs.unlinkSync(process.env.MARGINLIFT_DB);
    fs.rmSync(process.env.ARTIFACT_STORAGE_PATH, { recursive: true, force: true });
  }
}

run()
  .then(() => console.log("server.test.js passed"))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
