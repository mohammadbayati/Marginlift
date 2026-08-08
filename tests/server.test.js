const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.MARGINLIFT_DB = path.join(os.tmpdir(), `marginlift-test-${Date.now()}.json`);

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

    for (const page of ["/", "/login", "/signup", "/sales.html", "/styles-v2.css", "/styles-v3.css", "/motion.js", "/privacy.html", "/terms.html", "/security.html", "/pilot-data-request.html", "/vm-deployment.html", "/docs/vm-deployment.md"]) {
      const pageResponse = await request(page);
      assert.strictEqual(pageResponse.response.status, 200, `${page} should be public`);
    }

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
    const outcomeImport = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: {
        name: "Outcome import test",
        csvText: outcomeCsv
      }
    });
    assert.strictEqual(outcomeImport.response.status, 201);
    assert.strictEqual(outcomeImport.payload.data.summary.decisionStatus, "needs_review");

    const pilotWorkspaceAfterOutcome = await request("/api/pilot/workspace", { cookie });
    assert.strictEqual(pilotWorkspaceAfterOutcome.response.status, 200);
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.workspace.steps.some(item => item.key === "outcome_received" && item.complete));
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.workspace.steps.some(item => item.key === "scale_stop" && item.statusFa === "نیازمند اصلاح"));
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.savingsSnapshot.claimLevel, "verified_incremental");

    const readout = await request("/api/pilot/readout.md", { cookie });
    assert.strictEqual(readout.response.status, 200);
    assert.ok(String(readout.payload).includes("# گزارش پایلوت MarginLift"));
    assert.ok(String(readout.payload).includes("نیازمند بازبینی"));

    const report = await request("/api/campaigns/current/report", { cookie });
    assert.strictEqual(report.response.status, 200);
    assert.ok(String(report.payload).includes("# گزارش MarginLift"));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (fs.existsSync(process.env.MARGINLIFT_DB)) fs.unlinkSync(process.env.MARGINLIFT_DB);
  }
}

run()
  .then(() => console.log("server.test.js passed"))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
