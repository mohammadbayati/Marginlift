const assert = require("assert");
const { validateFixtureLayer } = require("../src/fixture-strategy");

const baseUrl = String(process.env.MARGINLIFT_BASE_URL || "https://marginlift.ir").replace(/\/$/, "");
const email = String(process.env.MARGINLIFT_DEMO_EMAIL || "").trim();
const password = String(process.env.MARGINLIFT_DEMO_PASSWORD || "");
const expectedRole = String(process.env.MARGINLIFT_EXPECTED_ROLE || "viewer");
const expectedStorage = String(process.env.MARGINLIFT_EXPECTED_STORAGE || "postgres");
const requireInviteOnly = process.env.MARGINLIFT_REQUIRE_INVITE_ONLY !== "false";
const requireLicensedFont = process.env.MARGINLIFT_REQUIRE_IRANSANSX === "true";

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "manual"
  });
  const raw = await response.text();
  let payload = raw;
  try { payload = raw ? JSON.parse(raw) : null; } catch (error) { /* non-JSON response */ }
  return { response, payload };
}

function expectStatus(result, status, label) {
  assert.strictEqual(result.response.status, status, `${label}: expected ${status}, received ${result.response.status}`);
}

async function main() {
  if (!email || !password) {
    throw new Error("Set MARGINLIFT_DEMO_EMAIL and MARGINLIFT_DEMO_PASSWORD before running the production smoke test.");
  }

  const evidence = [];
  const fixtureSnapshot = validateFixtureLayer("production-smoke");
  evidence.push(`fixtures:production-smoke:${fixtureSnapshot.digest}`);

  const publicSurfaces = [
    ["/", "siteMain"],
    ["/login", "authShell"],
    ["/privacy.html", "mainContent"],
    ["/terms.html", "mainContent"],
    ["/security.html", "mainContent"],
    ["/pilot-data-request.html", "mainContent"],
    ["/pilot.html", "mainContent"],
    ["/executive-report.html", "executiveReport"],
    ["/submission.html", "mainContent"],
    ["/deck.html", "mainContent"],
    ["/vm-deployment.html", "mainContent"]
  ];
  for (const [route, mainId] of publicSurfaces) {
    const result = await request(route);
    expectStatus(result, 200, route);
    const html = String(result.payload);
    assert.match(html, /<html lang="fa" dir="rtl">/, `${route}: Persian RTL contract missing`);
    assert.match(html, new RegExp(`class="skip-link" href="#${mainId}"`), `${route}: skip link missing`);
    assert.match(html, new RegExp(`<main[^>]+id="${mainId}"[^>]+tabindex="-1"`), `${route}: focusable main landmark missing`);
  }
  evidence.push(`public-surfaces:${publicSurfaces.length}:rtl-skip-main`);
  for (const route of ["/styles-v4.css", "/brand-mark.svg", "/fonts/marginlift-font.css", "/fonts/Vazirmatn-Variable.woff2"]) {
    const result = await request(route);
    expectStatus(result, 200, route);
    evidence.push(`${route}:200`);
  }
  const loginPage = await request("/login");
  assert.match(String(loginPage.payload), /auth-product-preview/);
  assert.match(String(loginPage.payload), /topbarUser/);
  evidence.push("ui-v5:auth-preview", "ui-v5:session-identity");

  const fontStatus = await request("/api/font-status");
  expectStatus(fontStatus, 200, "font status");
  if (requireLicensedFont) {
    assert.strictEqual(fontStatus.payload.data.ready, true, "IRANSansX is required but is not ready");
    assert.strictEqual(fontStatus.payload.data.activeFamily, "IRANSansX");
  }
  if (fontStatus.payload.data.ready) {
    const licensedFont = await request("/fonts/IRANSansX-Variable.woff2");
    expectStatus(licensedFont, 200, "licensed font");
    assert.strictEqual(licensedFont.response.headers.get("content-type"), "font/woff2");
  }
  evidence.push(`typography:${fontStatus.payload.data.activeFamily}:${fontStatus.payload.data.ready ? "licensed" : "fallback"}`);

  const health = await request("/api/health");
  expectStatus(health, 200, "health");
  assert.strictEqual(health.payload.data.status, "ok");
  assert.strictEqual(health.payload.data.service, "marginlift");
  assert.strictEqual(health.payload.data.storage, undefined);
  assert.match(health.response.headers.get("content-security-policy") || "", /default-src 'self'/);
  evidence.push("health:public-liveness:ok", "security-headers:csp");

  const publicConfig = await request("/api/public-config");
  expectStatus(publicConfig, 200, "public config");
  if (requireInviteOnly) assert.strictEqual(publicConfig.payload.data.publicSignupEnabled, false);
  evidence.push(`public-signup:${publicConfig.payload.data.publicSignupEnabled ? "enabled" : "disabled"}`);

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });
  expectStatus(login, 200, "demo login");
  const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
  assert.match(cookie, /^marginlift_session=/);

  const session = await request("/api/session", { cookie });
  expectStatus(session, 200, "session");
  assert.strictEqual(session.payload.data.role, expectedRole);
  evidence.push(`login:${expectedRole}`);

  if (["owner", "admin"].includes(expectedRole)) {
    const internalHealth = await request("/api/internal/health", { cookie });
    expectStatus(internalHealth, 200, "internal health");
    assert.strictEqual(internalHealth.payload.data.checks.database.driver, expectedStorage);
    assert.ok(["ok", "degraded", "error"].includes(internalHealth.payload.data.status));
    evidence.push(`internal-health:${expectedStorage}:${internalHealth.payload.data.status}`);
  }

  const usabilityConsole = await request("/internal/usability-test", { cookie });
  if (expectedRole === "owner") {
    expectStatus(usabilityConsole, 200, "owner usability console");
    assert.match(String(usabilityConsole.payload), /سه جلسه واقعی، یک تصمیم قابل دفاع/);
    evidence.push("usability-console:owner-only:200");
  } else {
    expectStatus(usabilityConsole, 403, "viewer usability console");
    evidence.push("usability-console:viewer-forbidden:403");
  }

  const readableRoutes = [
    "/api/campaigns/current",
    "/api/decision-engine/overview",
    "/api/customers/current",
    "/api/analyses/history",
    "/api/readiness/current",
    "/api/pilot/workspace",
    "/api/model-governance/overview",
    "/api/retention/workspace",
    "/api/contact-policy/workspace",
    "/api/behavioral/workspace",
    "/api/retention/shadow-workspace"
  ];
  for (const route of readableRoutes) {
    const result = await request(route, { cookie });
    expectStatus(result, 200, route);
  }
  evidence.push(`viewer-readable-routes:${readableRoutes.length}`);

  if (expectedRole === "viewer") {
    const forbiddenChecks = [
      ["/api/retention/readout.md", { cookie }],
      ["/api/exports/audience.csv", { cookie }],
      ["/api/imports/csv", { method: "POST", cookie, body: {} }],
      ["/api/outcomes/import", { method: "POST", cookie, body: {} }]
    ];
    for (const [route, options] of forbiddenChecks) {
      const result = await request(route, options);
      expectStatus(result, 403, `${route} viewer restriction`);
    }
    evidence.push(`viewer-forbidden-routes:${forbiddenChecks.length}`);
  }

  const logout = await request("/api/auth/logout", { method: "POST", cookie, body: {} });
  expectStatus(logout, 200, "logout");
  console.log(JSON.stringify({ status: "pass", baseUrl, checkedAt: new Date().toISOString(), evidence }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
