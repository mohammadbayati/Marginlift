const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles-v4.css"), "utf8");
const smoke = fs.readFileSync(path.join(root, "scripts", "verify-production.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function assertContains(source, expected, label = expected) {
  assert(source.includes(expected), `${label} missing`);
}

function assertNotContains(source, unexpected, label = unexpected) {
  assert(!source.includes(unexpected), `${label} should not be present`);
}

function run() {
  assertContains(indexHtml, 'id="pilotOperabilityWorkbench"', "pilot lifecycle panel");
  assertContains(indexHtml, 'id="pilotLifecycleWorkbench"', "pilot lifecycle target");
  assertContains(indexHtml, 'id="operationalHealthConsole"', "operational health console");
  assertContains(indexHtml, 'id="operationalHealthChecks"', "operational health checks");

  for (const route of [
    "/api/pilot/decision-contract",
    "/api/pilot/business-impact",
    "/api/pilot/control-room",
    "/api/pilot/acceptance",
    "/api/pilot/acceptance/package.md",
    "/api/pilot/readout.md",
    "/api/internal/health"
  ]) {
    assertContains(appJs, route);
  }

  for (const action of [
    "contract_next",
    "business_submit",
    "business_verify",
    "control_create",
    "control_next",
    "control_resolve_blocker",
    "acceptance_create",
    "acceptance_verify",
    "acceptance_waive",
    "acceptance_request_customer",
    "acceptance_record_customer",
    "acceptance_request_executive",
    "acceptance_record_executive",
    "acceptance_generate_package",
    "acceptance_certify",
    "acceptance_reject"
  ]) {
    assertContains(appJs, action);
  }

  assertContains(appJs, '["owner", "admin"].includes(currentSession?.role)', "owner/admin lifecycle gating");
  assertContains(appJs, "This role is read-only for pilot lifecycle actions.", "read-only lifecycle message");
  assertContains(appJs, 'source: "pilot_lifecycle_ui"', "pilot lifecycle evidence provenance");
  assertContains(appJs, "renderOperationalHealthConsole", "health console renderer");
  assertContains(appJs, "release.commitSha", "release identity in UI");

  for (const roadmapNav of [
    'data-enterprise-section-link="strategy"',
    'data-enterprise-section-link="transformation"',
    'data-enterprise-section-link="data-integrations"'
  ]) {
    assertNotContains(indexHtml, roadmapNav, roadmapNav);
  }

  assertContains(styles, ".pilot-lifecycle-workbench", "pilot lifecycle CSS");
  assertContains(styles, ".health-check-grid", "health check CSS");
  assertContains(styles, "@media (max-width: 980px)", "tablet breakpoint");
  assertContains(styles, "@media (max-width: 720px)", "mobile breakpoint");

  assertContains(smoke, "MARGINLIFT_EXPECTED_SHA", "production SHA assertion");
  assertContains(smoke, "health.payload.data.release.commitSha", "smoke release identity assertion");

  assertContains(packageJson.scripts.test, "node tests/scorer-auth.test.js", "scorer auth in npm test");
  assertContains(packageJson.scripts.test, "python -m unittest tests/test_scorer_internal_auth.py", "python scorer auth in npm test");
  assertContains(packageJson.scripts.test, "python -m unittest tests/test_survival_model.py", "survival model in npm test");
}

run();
console.log("pilot-operability-ui tests passed");
