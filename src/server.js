const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const { analyzeCampaign } = require("./analysis");
const { analyzeCustomers } = require("./customer-analysis");
const { normalizeRole, requireRole } = require("./access-control");
const { appendAudit, verifyAuditLog } = require("./audit-log");
const { deleteArtifact, isEnabled: isArtifactStorageEnabled, persistArtifact, readArtifact } = require("./artifact-store");
const {
  SESSION_COOKIE,
  buildSessionCookie,
  clearSessionCookie,
  createId,
  hashPassword,
  parseCookies,
  verifyPassword,
  verifySessionCookie
} = require("./auth");
const { looksLikeCustomerRows, normalizeCampaignRows, normalizeCustomerRows, normalizeOutcomeRows, parseCSV } = require("./csv");
const { closeStorage, enqueueJob, initializeStorage, listJobs, readDb, storageDriver, storageHealth, transact } = require("./storage");
const { startJobWorker } = require("./job-worker");
const { beginRequest, getMetrics, log } = require("./observability");
const { buildDecisionOverview } = require("./decision-engine");
const { buildBehavioralWorkspace } = require("./behavioral-policy");
const { buildContactSafetyWorkspace } = require("./contact-policy");
const { appendDecision, toPublicDecision, verifyDecisionLedger } = require("./decision-ledger");
const { auditOutcomeRows, buildExperimentRecord, hashDataset, toPublicExperiment } = require("./experiment");
const { buildModelGovernance, buildOutcomeMonitor, toPublicModelGovernance } = require("./model-governance");
const {
  analyzeRetentionRows,
  buildRetentionWorkspace,
  getRetentionPreset,
  listRetentionPresets,
  normalizeRetentionConfig,
  previewRetentionRows
} = require("./retention-product");
const { buildRetentionExperimentBrief, buildRetentionShadowRun } = require("./retention-shadow");
const { evidenceMeta, resolveRetentionEvidence } = require("./evidence");
const {
  analyzeRetentionOutcome,
  auditRetentionOutcome,
  buildRetentionExperiment,
  normalizeRetentionOutcomeRows,
  publicRetentionExperiment,
  retentionAssignmentCsv,
  verifyRetentionFinance
} = require("./retention-experiment");
const {
  applyMetricContractChange,
  buildDefaultMetricContract,
  createMetricContractVersion
} = require("./metric-contract");
const {
  buildRetentionDecisionReceipt,
  buildRetentionPreviewContract,
  buildRetentionReadout,
  enrichRetentionWorkspace,
  matchesExpectedDatasetHash
} = require("./retention-ux");
const { FONT_FILENAME, inspectTypography, renderTypographyCss } = require("./typography");
const {
  analyzeOutcomeRows,
  buildPilotReadout,
  buildPilotWorkspace,
  buildReadinessAudit,
  buildSavingsSnapshot
} = require("./pilot");
const { appOrigin, assertProductionConfig, isProduction, maxBodyBytes, port: defaultPort, publicSignupEnabled, trustProxy } = require("./config");

const publicRoot = path.join(__dirname, "..");
const webDistRoot = path.join(publicRoot, "web", "dist");
const webAssetRoot = path.join(webDistRoot, "assets");
const privateFontRoot = path.resolve(process.env.MARGINLIFT_FONT_DIR || path.join(publicRoot, "private", "fonts"));
const sampleCsvPath = path.join(publicRoot, "synthetic-campaign-data.csv");
const sampleCustomerCsvPath = path.join(publicRoot, "synthetic-customer-events.csv");
const sampleOutcomeCsvPath = path.join(publicRoot, "synthetic-outcome-data.csv");
const retentionDemoScenarios = Object.freeze({
  generic_ecommerce: { file: path.join(publicRoot, "synthetic-ecommerce-transactions.csv"), cutoff: "2025-12-01", name: "سناریوی نمایشی فروشگاه اینترنتی" },
  super_app_packages: { file: path.join(publicRoot, "synthetic-package-transactions.csv"), cutoff: "2026-02-01", name: "سناریوی نمایشی خرید بسته اینترنت" },
  subscription_services: { file: path.join(publicRoot, "synthetic-subscription-transactions.csv"), cutoff: "2026-05-01", name: "سناریوی نمایشی تمدید اشتراک" }
});
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;
const authAttempts = new Map();
const rateLimits = Object.freeze({
  signup: { max: 5, windowMs: 15 * 60 * 1000 },
  login: { max: 10, windowMs: 15 * 60 * 1000 },
  events: { max: 60, windowMs: 15 * 60 * 1000 }
});

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function start(port = defaultPort) {
  assertProductionConfig();
  const server = http.createServer(handleRequest);
  server.ready = initializeStorage()
    .then(() => seedDemoAccount())
    .then(() => new Promise(resolve => {
      server.jobWorker = startJobWorker();
      server.listen(port, () => {
        console.log(`MarginLift is running on http://localhost:${port}`);
        resolve();
      });
    }));
  server.ready.catch(error => server.emit("error", error));
  server.on("close", () => {
    server.jobWorker?.stop();
    closeStorage().catch(() => undefined);
  });
  return server;
}

async function handleRequest(req, res) {
  const finishRequest = beginRequest(req, res);
  res.once("finish", finishRequest);
  addSecurityHeaders(res);

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method !== "GET" && req.method !== "HEAD") {
      enforceSameOrigin(req);
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname === "/internal/usability-test" || url.pathname === "/internal/usability-session.js") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "این مسیر فقط برای مشاهده است." } });
        return;
      }
      const auth = await requireSession(req);
      requireRole(auth, "owner");
      serveInternalUsability(url.pathname, req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "این مسیر فقط برای خواندن فایل‌های دمو است." } });
      return;
    }

    serveStatic(url.pathname, req, res);
  } catch (error) {
    log((error.status || 500) >= 500 ? "error" : "info", (error.status || 500) >= 500 ? "request_failed" : "request_rejected", {
      requestId: req.requestId,
      code: error.code || "INTERNAL_ERROR",
      status: error.status || 500,
      message: error.message
    });
    sendJson(res, error.status || 500, {
      error: {
        code: error.code || "INTERNAL_ERROR",
        message: error.status ? error.message : "خطای داخلی رخ داد.",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message
      }
    });
  }
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health" && (req.method === "GET" || req.method === "HEAD")) {
    const storage = await storageHealth();
    sendJson(res, storage.status === "ok" ? 200 : 503, { data: { status: storage.status, storage } });
    return;
  }

  if (url.pathname === "/api/public-config" && req.method === "GET") {
    sendJson(res, 200, { data: { publicSignupEnabled } });
    return;
  }

  if (url.pathname === "/api/font-status" && req.method === "GET") {
    const typography = inspectTypography(privateFontRoot);
    sendJson(res, 200, { data: {
      activeFamily: typography.activeFamily,
      ready: typography.ready,
      licensed: typography.licensed,
      webEmbeddingConfirmed: typography.webEmbeddingConfirmed,
      fontSha256: typography.fontSha256,
      reason: typography.reason
    } });
    return;
  }

  if (url.pathname === "/api/auth/signup" && req.method === "POST") {
    if (!publicSignupEnabled) {
      throw httpError(403, "SIGNUP_DISABLED", "ساخت فضای کاری جدید فقط با هماهنگی تیم MarginLift انجام می‌شود.");
    }
    checkRateLimit(req, "signup");
    const body = await readJson(req);
    const result = await signup(body, requestContext(req));
    sendJson(res, 201, { data: result.session }, {
      "Set-Cookie": buildSessionCookie(result.session.id, Math.floor(sessionTtlMs / 1000))
    });
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    checkRateLimit(req, "login");
    const body = await readJson(req);
    const result = await login(body, requestContext(req));
    sendJson(res, 200, { data: result.session }, {
      "Set-Cookie": buildSessionCookie(result.session.id, Math.floor(sessionTtlMs / 1000))
    });
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const session = await getRequestSession(req);
    if (session) {
      await transact(db => {
        appendOperationalAudit(db, requestContext(req, session), "session_logout", "session", session.session.id);
        db.sessions = db.sessions.filter(item => item.id !== session.session.id);
      });
    }
    sendJson(res, 200, { data: { ok: true } }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (url.pathname === "/api/session" && req.method === "GET") {
    const session = await getRequestSession(req);
    sendJson(res, 200, { data: session ? session.publicSession : null });
    return;
  }

  if (url.pathname === "/api/events" && req.method === "POST") {
    checkRateLimit(req, "events");
    const body = await readJson(req);
    const event = await trackEvent(req, body);
    sendJson(res, 201, { data: { id: event.id, accepted: true } });
    return;
  }

  const auth = await requireSession(req);

  if (url.pathname === "/api/access/members" && req.method === "GET") {
    requireRole(auth, "admin");
    sendJson(res, 200, { data: await getWorkspaceMembers(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/access/members" && req.method === "POST") {
    requireRole(auth, "owner");
    const body = await readJson(req);
    sendJson(res, 201, { data: await createWorkspaceMember(auth, body, requestContext(req, auth)) });
    return;
  }

  const membershipRoute = url.pathname.match(/^\/api\/access\/members\/([^/]+)$/);
  if (membershipRoute && req.method === "PATCH") {
    requireRole(auth, "owner");
    const body = await readJson(req);
    sendJson(res, 200, { data: await updateWorkspaceMemberRole(auth, membershipRoute[1], body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/audit-log" && req.method === "GET") {
    requireRole(auth, "admin");
    sendJson(res, 200, { data: await getOperationalAudit(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/artifacts" && req.method === "GET") {
    requireRole(auth, "analyst");
    sendJson(res, 200, { data: await getArtifacts(auth.organization.id) });
    return;
  }

  const artifactRoute = url.pathname.match(/^\/api\/artifacts\/([^/]+)(\/download)?$/);
  if (artifactRoute && req.method === "GET" && artifactRoute[2]) {
    requireRole(auth, "analyst");
    await downloadArtifact(auth, artifactRoute[1], req, res);
    return;
  }

  if (artifactRoute && req.method === "DELETE" && !artifactRoute[2]) {
    requireRole(auth, "admin");
    sendJson(res, 200, { data: await removeArtifact(auth, artifactRoute[1], requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/ops/metrics" && req.method === "GET") {
    requireRole(auth, "admin");
    sendJson(res, 200, { data: { ...getMetrics(), storageDriver, artifactStorage: isArtifactStorageEnabled() } });
    return;
  }

  if (url.pathname === "/api/ops/jobs" && req.method === "GET") {
    requireRole(auth, "admin");
    sendJson(res, 200, { data: await listJobs(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/campaigns/current" && req.method === "GET") {
    sendJson(res, 200, { data: await getCurrentCampaign(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/decision-engine/overview" && req.method === "GET") {
    const campaign = await getCurrentCampaign(auth.organization.id);
    sendJson(res, 200, { data: buildDecisionOverview(campaign) });
    return;
  }

  if (url.pathname === "/api/customers/current" && req.method === "GET") {
    sendJson(res, 200, { data: await getCurrentCustomerAnalysis(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/customers/import" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    const analysis = await importCustomerAnalysis(auth.organization.id, body, requestContext(req, auth));
    sendJson(res, 201, { data: analysis });
    return;
  }

  if (url.pathname === "/api/retention/configuration" && req.method === "GET") {
    sendJson(res, 200, { data: await getRetentionConfiguration(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/retention/configuration" && req.method === "PATCH") {
    requireRole(auth, "admin");
    const body = await readJson(req);
    sendJson(res, 200, { data: await updateRetentionConfiguration(auth, body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/retention/metric-contract" && req.method === "GET") {
    sendJson(res, 200, { data: await getRetentionMetricContract(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/retention/metric-contract" && req.method === "PATCH") {
    requireRole(auth, "admin");
    const body = await readJson(req);
    sendJson(res, 200, { data: await updateRetentionMetricContract(auth, body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/retention/workspace" && req.method === "GET") {
    sendJson(res, 200, { data: await getRetentionWorkspace(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/retention/decisions" && req.method === "GET") {
    sendJson(res, 200, { data: await getRetentionDecisions(auth.organization.id, url.searchParams) });
    return;
  }

  const retentionOverrideMatch = url.pathname.match(/^\/api\/retention\/decisions\/([^/]+)\/override$/);
  if (retentionOverrideMatch && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 200, { data: await overrideRetentionDecision(auth, retentionOverrideMatch[1], body, requestContext(req, auth)) });
    return;
  }

  const retentionReceiptMatch = url.pathname.match(/^\/api\/retention\/decisions\/([^/]+)\/receipt$/);
  if (retentionReceiptMatch && req.method === "GET") {
    sendJson(res, 200, { data: await getRetentionDecisionReceipt(auth.organization.id, retentionReceiptMatch[1]) });
    return;
  }

  if (url.pathname === "/api/behavioral/workspace" && req.method === "GET") {
    sendJson(res, 200, { data: await getBehavioralWorkspace(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/contact-policy/workspace" && req.method === "GET") {
    sendJson(res, 200, { data: await getContactPolicyWorkspace(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/retention/preview" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 200, { data: await previewRetentionImport(auth.organization.id, body) });
    return;
  }

  if (url.pathname === "/api/retention/import" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    const imported = await importRetentionAnalysis(auth.organization.id, body, requestContext(req, auth));
    sendJson(res, 201, { data: { ...(await getRetentionWorkspace(auth.organization.id)), id: imported.id, import: imported } });
    return;
  }

  if (url.pathname === "/api/retention/audience.csv" && req.method === "GET") {
    requireRole(auth, "analyst");
    const record = await getLatestRetentionRecord(auth.organization.id);
    if (!record) throw httpError(404, "RETENTION_ANALYSIS_NOT_FOUND", "ابتدا داده نگهداشت را تحلیل کنید.");
    const contactSafety = record.contactSafety || record.workspace?.contactSafety || buildContactSafetyWorkspace(record.decisionQueue || []);
    if (!contactSafety.contractReady) {
      throw httpError(409, "CONTACT_SAFETY_CONTRACT_REQUIRED", "خروجی CRM مسدود است؛ رضایت، عدم تماس، کانال ترجیحی و تعداد تماس ۳۰ روزه را برای همه مشتریان تکمیل کنید.");
    }
    if (!contactSafety.summary.actionAllowed) {
      throw httpError(409, "NO_CONTACT_SAFE_AUDIENCE", "هیچ مشتری از دروازه ایمنی تماس عبور نکرده است.");
    }
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-retention-audience.csv"'
    });
    res.end(buildRetentionAudienceCsv(record));
    return;
  }

  if (url.pathname === "/api/retention/readout.md" && req.method === "GET") {
    requireRole(auth, "analyst");
    const record = await getLatestRetentionRecord(auth.organization.id);
    if (!record) throw httpError(404, "RETENTION_ANALYSIS_NOT_FOUND", "ابتدا داده نگهداشت را تحلیل کنید.");
    const role = normalizeRetentionReadoutRole(url.searchParams.get("role"));
    const retentionState = await getRetentionWorkspace(auth.organization.id);
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="marginlift-retention-${role}-readout.md"`
    });
    res.end(buildRetentionRoleReadout(auth.organization, record, role, retentionState));
    return;
  }

  if (url.pathname === "/api/retention/readout.json" && req.method === "GET") {
    const record = await getLatestRetentionRecord(auth.organization.id);
    if (!record) throw httpError(404, "RETENTION_ANALYSIS_NOT_FOUND", "ابتدا داده نگهداشت را تحلیل کنید.");
    const role = normalizeRetentionReadoutRole(url.searchParams.get("role"));
    const contract = await getRetentionWorkspace(auth.organization.id);
    sendJson(res, 200, { data: buildRetentionReadout({ contract, organization: auth.organization, record }, role) });
    return;
  }

  if (url.pathname === "/api/retention/shadow-runs" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 201, { data: await createRetentionShadowRun(auth.organization.id, body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/retention/shadow-workspace" && req.method === "GET") {
    sendJson(res, 200, { data: await getRetentionShadowWorkspace(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/retention/experiments/current" && req.method === "GET") {
    sendJson(res, 200, { data: publicRetentionExperiment(await getLatestRetentionExperiment(auth.organization.id)) });
    return;
  }

  if (url.pathname === "/api/retention/experiments/register" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 201, { data: await registerRetentionExperiment(auth, body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/retention/experiments/current/assignments.csv" && req.method === "GET") {
    requireRole(auth, "analyst");
    const experiment = await getLatestRetentionExperiment(auth.organization.id);
    if (!experiment || !["registered", "outcome_received"].includes(experiment.status)) {
      throw httpError(404, "RETENTION_EXPERIMENT_NOT_FOUND", "ابتدا آزمایش Retention را ثبت کنید.");
    }
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-retention-policy-assignments.csv"'
    });
    res.end(retentionAssignmentCsv(experiment));
    return;
  }

  if (url.pathname === "/api/retention/outcomes/preview" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 200, { data: await previewRetentionOutcome(auth.organization.id, body) });
    return;
  }

  if (url.pathname === "/api/retention/outcomes/import" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 201, { data: await importRetentionOutcome(auth, body, requestContext(req, auth)) });
    return;
  }

  const retentionFinanceMatch = url.pathname.match(/^\/api\/retention\/outcomes\/([^/]+)\/verify-finance$/);
  if (retentionFinanceMatch && req.method === "POST") {
    requireRole(auth, "admin");
    const body = await readJson(req);
    sendJson(res, 200, { data: await verifyRetentionOutcomeFinance(auth, retentionFinanceMatch[1], body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/retention/experiment-brief.md" && req.method === "GET") {
    requireRole(auth, "analyst");
    const record = await getLatestRetentionRecord(auth.organization.id);
    if (!record) throw httpError(404, "RETENTION_ANALYSIS_NOT_FOUND", "ابتدا داده نگهداشت را تحلیل کنید.");
    const shadow = (await getRetentionShadowWorkspace(auth.organization.id)).latestRun;
    const brief = buildRetentionExperimentBrief(auth.organization, record, shadow, {
      baselineRate: url.searchParams.get("baselineRate"),
      minimumDetectableEffect: url.searchParams.get("minimumDetectableEffect"),
      outcomeWindowDays: url.searchParams.get("outcomeWindowDays"),
      holdoutRate: url.searchParams.get("holdoutRate")
    });
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-retention-experiment-brief.md"'
    });
    res.end(brief);
    return;
  }

  if (url.pathname === "/api/retention/demo/reset" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 201, { data: await loadRetentionDemoScenario(auth, body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/experiments/plan" && req.method === "GET") {
    sendJson(res, 200, { data: (await getCurrentCustomerAnalysis(auth.organization.id)).experimentPlan });
    return;
  }

  if (url.pathname === "/api/experiments/current" && req.method === "GET") {
    const customerAnalysis = await getCurrentCustomerAnalysis(auth.organization.id);
    sendJson(res, 200, { data: toPublicExperiment(await getCurrentExperiment(auth.organization.id, customerAnalysis.id)) });
    return;
  }

  if (url.pathname === "/api/experiments/register" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 201, { data: await registerProspectiveExperiment(auth.organization.id, body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/experiments/current/assignments.csv" && req.method === "GET") {
    requireRole(auth, "analyst");
    const customerAnalysis = await getCurrentCustomerAnalysis(auth.organization.id);
    const experiment = await getCurrentExperiment(auth.organization.id, customerAnalysis.id);
    if (!experiment || experiment.design?.randomizationEvidence?.verified !== true) {
      throw httpError(404, "REGISTERED_EXPERIMENT_NOT_FOUND", "ابتدا پایلوت تصادفی را ثبت کنید.");
    }
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-experiment-assignments.csv"'
    });
    res.end(buildExperimentAssignmentCsv(experiment));
    return;
  }

  if (url.pathname === "/api/finance/summary" && req.method === "GET") {
    sendJson(res, 200, { data: (await getCurrentCustomerAnalysis(auth.organization.id)).finance });
    return;
  }

  if (url.pathname === "/api/readiness/current" && req.method === "GET") {
    sendJson(res, 200, { data: (await getCurrentPilotState(auth.organization.id)).readiness });
    return;
  }

  if (url.pathname === "/api/pilot/workspace" && req.method === "GET") {
    sendJson(res, 200, { data: await getCurrentPilotState(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/model-governance/overview" && req.method === "GET") {
    sendJson(res, 200, { data: await getModelGovernanceOverview(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/decision-ledger" && req.method === "GET") {
    sendJson(res, 200, { data: await getDecisionLedger(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/outcomes/import" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 201, { data: await importOutcomeAnalysis(auth.organization.id, body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/pilot/readout.md" && req.method === "GET") {
    const state = await getCurrentPilotState(auth.organization.id);
    const governance = await getModelGovernanceOverview(auth.organization.id);
    const readout = buildPilotReadout(auth.organization, state.readiness, state.savingsSnapshot, state.workspace, state.outcome, governance);
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-pilot-readout.md"'
    });
    res.end(readout);
    return;
  }

  if (url.pathname === "/api/exports/audience.csv" && req.method === "GET") {
    requireRole(auth, "analyst");
    throw httpError(409, "CONTACT_SAFETY_CONTRACT_REQUIRED", "این خروجی قدیمی مجوز تماس ندارد؛ از مسیر نگهداشت و خروجی CRM ایمن استفاده کنید.");
  }

  if (url.pathname === "/api/events/summary" && req.method === "GET") {
    sendJson(res, 200, { data: await getEventSummary(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/campaigns/import" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    const campaign = await importCampaign(auth.organization.id, body, requestContext(req, auth));
    sendJson(res, 201, { data: campaign });
    return;
  }

  if (url.pathname === "/api/imports/preview" && req.method === "POST") {
    const body = await readJson(req);
    sendJson(res, 200, { data: previewCsvImport(body) });
    return;
  }

  if (url.pathname === "/api/imports/csv" && req.method === "POST") {
    requireRole(auth, "analyst");
    const body = await readJson(req);
    sendJson(res, 201, { data: await importCsvAnalysis(auth.organization.id, body, requestContext(req, auth)) });
    return;
  }

  if (url.pathname === "/api/analyses/history" && req.method === "GET") {
    sendJson(res, 200, { data: await getAnalysisHistory(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/pilot/package.md" && req.method === "GET") {
    const state = await getCurrentPilotState(auth.organization.id);
    const packageMarkdown = buildPilotPackage(auth.organization, state.campaign, state.customerAnalysis, state);
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-pilot-package.md"'
    });
    res.end(packageMarkdown);
    return;
  }

  if (url.pathname === "/api/campaigns/current/report" && req.method === "GET") {
    const analysis = await getCurrentCampaign(auth.organization.id);
    const report = buildMarkdownReport(analysis, auth.organization);
    await trackEvent(req, {
      event: "report_exported",
      properties: {
        campaign_id: analysis.id,
        campaign_name: analysis.campaign.name
      }
    });
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-campaign-report.md"'
    });
    res.end(report);
    return;
  }

  sendJson(res, 404, { error: { code: "NOT_FOUND", message: "مسیر API پیدا نشد." } });
}

async function signup(body, context = {}) {
  const email = normalizeEmail(body.email);
  const submittedCompany = cleanText(body.companyName || body.company);
  const emailDomain = email.includes("@") ? email.split("@")[1].split(".")[0] : "";
  const companyName = submittedCompany || emailDomain || "فضای کاری جدید";
  const password = String(body.password || "");

  if (submittedCompany && submittedCompany.length < 2) {
    throw httpError(400, "VALIDATION_ERROR", "نام کسب‌وکار باید حداقل ۲ کاراکتر باشد.");
  }
  validateEmailAndPassword(email, password);
  if (isProduction && password.length < 12) {
    throw httpError(400, "VALIDATION_ERROR", "رمز عبور باید حداقل ۱۲ کاراکتر باشد.");
  }
  if (password.length < 8) {
    throw httpError(400, "VALIDATION_ERROR", "رمز عبور باید حداقل ۸ کاراکتر باشد.");
  }

  return transact(db => {
    if (db.users.some(user => user.email === email)) {
      throw httpError(409, "EMAIL_EXISTS", "این ایمیل قبلاً ثبت شده است.");
    }

    const now = new Date().toISOString();
    const organization = {
      id: createId("org"),
      name: companyName,
      plan: "pilot",
      retentionConfig: getRetentionPreset("generic_ecommerce"),
      createdAt: now,
      updatedAt: now
    };
    const user = {
      id: createId("usr"),
      email,
      name: email.split("@")[0],
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now
    };
    const session = createSession(user.id, now);

    db.organizations.push(organization);
    db.users.push(user);
    db.memberships.push({
      id: createId("mem"),
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
      createdAt: now
    });
    db.sessions.push(session);
    appendOperationalAudit(db, {
      ...context,
      organizationId: organization.id,
      actorId: user.id,
      actorRole: "owner"
    }, "workspace_created", "organization", organization.id);

    return {
      session: publicSession(session, user, organization, "owner")
    };
  });
}

async function login(body, context = {}) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  validateEmailAndPassword(email, password);

  return transact(db => {
    const user = db.users.find(item => item.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw httpError(401, "INVALID_CREDENTIALS", "ایمیل یا رمز عبور درست نیست.");
    }
    if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now()) {
      db.sessions = db.sessions.filter(item => item.userId !== user.id);
      throw httpError(403, "ACCESS_EXPIRED", "دسترسی آزمایشی این حساب پایان یافته است. برای تمدید با تیم MarginLift تماس بگیرید.");
    }

    const membership = db.memberships.find(item => item.userId === user.id);
    const organization = db.organizations.find(item => item.id === membership?.organizationId);
    if (!membership || !organization) {
      throw httpError(403, "NO_WORKSPACE", "برای این کاربر فضای کاری پیدا نشد.");
    }

    const session = createSession(user.id, new Date().toISOString());
    db.sessions.push(session);
    appendOperationalAudit(db, {
      ...context,
      organizationId: organization.id,
      actorId: user.id,
      actorRole: membership.role
    }, "session_login", "session", session.id);

    return {
      session: publicSession(session, user, organization, membership.role)
    };
  });
}

async function getRequestSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const sessionId = verifySessionCookie(cookies[SESSION_COOKIE]);
  if (!sessionId) return null;

  const db = await readDb();
  const session = db.sessions.find(item => item.id === sessionId);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;

  const user = db.users.find(item => item.id === session.userId);
  if (user?.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now()) return null;
  const membership = db.memberships.find(item => item.userId === user?.id);
  const organization = db.organizations.find(item => item.id === membership?.organizationId);
  if (!user || !membership || !organization) return null;

  return {
    session,
    user,
    organization,
    membership,
    publicSession: publicSession(session, user, organization, membership.role)
  };
}

async function requireSession(req) {
  const session = await getRequestSession(req);
  if (!session) {
    throw httpError(401, "AUTH_REQUIRED", "برای دسترسی به این بخش وارد شوید.");
  }
  return session;
}

async function getCurrentCampaign(organizationId) {
  const db = await readDb();
  const campaign = db.campaigns
    .filter(item => item.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  if (campaign) {
    return {
      id: campaign.id,
      isDemo: false,
      ...campaign.analysis
    };
  }

  return {
    id: "demo_campaign",
    isDemo: true,
    ...loadSampleAnalysis()
  };
}

async function importCampaign(organizationId, body, context = {}) {
  const name = cleanText(body.name) || "کمپین واردشده";
  const csvText = extractCsvText(body);
  if (csvText.length < 20) {
    throw httpError(400, "CSV_REQUIRED", "فایل CSV معتبر ارسال نشده است.");
  }

  const rows = normalizeCampaignRows(parseCSV(csvText));
  const analysis = analyzeCampaign(rows, { name });
  const campaign = {
    id: createId("cmp"),
    organizationId,
    name,
    rowCount: rows.length,
    analysis,
    createdAt: new Date().toISOString()
  };
  const artifact = await persistCsvArtifact(organizationId, context, "campaign_csv", name, csvText, campaign.createdAt);

  try {
    await transact(db => {
      db.campaigns.push(campaign);
      if (artifact) db.artifacts.push(artifact);
      appendOperationalAudit(db, context, "campaign_imported", "campaign", campaign.id, {
        rows: rows.length,
        artifactId: artifact?.id || null
      });
    });
  } catch (error) {
    if (artifact) await deleteArtifact(artifact);
    throw error;
  }
  await enqueueIntegrityCheck(organizationId, campaign.id);

  return {
    id: campaign.id,
    isDemo: false,
    ...analysis
  };
}

function previewCsvImport(body) {
  const csvText = extractCsvText(body);
  if (csvText.length < 20) {
    throw httpError(400, "CSV_REQUIRED", "فایل CSV معتبر ارسال نشده است.");
  }
  const parsedRows = parseCSV(csvText);
  const columns = Object.keys(parsedRows[0] || {});
  const isCustomerLevel = looksLikeCustomerRows(parsedRows);
  const requiredColumns = isCustomerLevel
    ? ["customer_id", "treatment", "converted", "outcome_revenue_toman", "gross_margin_rate"]
    : ["segment_fa", "campaign_group", "users", "conversion_rate", "estimated_revenue_toman"];
  const missing = requiredColumns.filter(column => !columns.includes(column));

  return {
    detectedType: isCustomerLevel ? "customer" : "campaign",
    detectedTypeFa: isCustomerLevel ? "داده مشتری‌محور" : "داده سگمنتی کمپین",
    rowCount: parsedRows.length,
    columns,
    missing,
    ready: missing.length === 0,
    nextActionFa: isCustomerLevel ? "ساخت Customer 360 و برنامه پایلوت" : "ساخت صف تصمیم سگمنتی"
  };
}

async function importCsvAnalysis(organizationId, body, context = {}) {
  const csvText = extractCsvText(body);
  const parsedRows = parseCSV(csvText);
  if (looksLikeCustomerRows(parsedRows)) {
    return {
      type: "customer",
      analysis: await importCustomerAnalysis(organizationId, body, context)
    };
  }

  return {
    type: "campaign",
    analysis: await importCampaign(organizationId, body, context)
  };
}

async function getCurrentCustomerAnalysis(organizationId) {
  const db = await readDb();
  const stored = db.customerAnalyses
    .filter(item => item.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  if (stored) {
    return {
      id: stored.id,
      isDemo: false,
      experimentId: stored.experimentId || null,
      ...stored.analysis
    };
  }

  return {
    id: "demo_customer_analysis",
    isDemo: true,
    ...loadSampleCustomerAnalysis()
  };
}

async function getRetentionConfiguration(organizationId) {
  const db = await readDb();
  const organization = db.organizations.find(item => item.id === organizationId);
  const configuration = normalizeRetentionConfig(organization?.retentionConfig || getRetentionPreset());
  return { configuration, presets: listRetentionPresets() };
}

async function getRetentionMetricContract(organizationId) {
  const db = await readDb();
  const configuration = normalizeRetentionConfig(
    db.organizations.find(item => item.id === organizationId)?.retentionConfig || getRetentionPreset()
  );
  return latestMetricContract(db, organizationId) || buildDefaultMetricContract(organizationId, configuration);
}

async function updateRetentionMetricContract(auth, body, context = {}) {
  let updated;
  await transact(db => {
    const organization = db.organizations.find(item => item.id === auth.organization.id);
    if (!organization) throw httpError(404, "WORKSPACE_NOT_FOUND", "فضای کاری پیدا نشد.");
    const configuration = normalizeRetentionConfig(organization.retentionConfig || getRetentionPreset());
    const current = latestMetricContract(db, auth.organization.id) || buildDefaultMetricContract(auth.organization.id, configuration);
    try {
      updated = body.action === "new_version"
        ? createMetricContractVersion(current, context)
        : applyMetricContractChange(current, body, context);
    } catch (error) {
      throw httpError(409, "METRIC_CONTRACT_NOT_READY", error.message);
    }

    const existingIndex = db.retentionMetricContracts.findIndex(item => item.id === updated.id);
    if (existingIndex === -1) db.retentionMetricContracts.push(updated);
    else db.retentionMetricContracts[existingIndex] = updated;

    if (updated.status === "locked" && current.status !== "locked") {
      appendDecision(db, {
        id: createId("led"),
        organizationId: auth.organization.id,
        eventType: "metric_contract_locked",
        entityType: "metric_contract",
        entityId: updated.id,
        decision: "metric_contract_locked",
        decisionFa: "قرارداد معیار و سیاست فعلی قفل شد",
        rationaleFa: "مالک‌های CRM، داده و مالی تعریف‌ها را تأیید کرده‌اند.",
        evidence: { version: updated.version, primaryMetric: updated.primaryMetric, outcomeWindowDays: updated.outcomeWindowDays },
        createdAt: updated.lockedAt
      });
    }
    appendOperationalAudit(db, context, "retention_metric_contract_updated", "metric_contract", updated.id, {
      version: updated.version,
      status: updated.status,
      action: body.action || "save"
    });
  });
  return updated;
}

function latestMetricContract(db, organizationId) {
  return (db.retentionMetricContracts || [])
    .filter(item => item.organizationId === organizationId)
    .sort((left, right) => Number(right.version || 1) - Number(left.version || 1))[0] || null;
}

async function updateRetentionConfiguration(auth, body, context = {}) {
  const current = (await getRetentionConfiguration(auth.organization.id)).configuration;
  const changesPreset = body.presetKey && body.presetKey !== current.presetKey;
  const candidate = changesPreset ? body : {
    ...current,
    ...body,
    display: { ...current.display, ...(body.display || {}) },
    mapping: { ...current.mapping, ...(body.mapping || {}) },
    defaults: { ...current.defaults, ...(body.defaults || {}) },
    lifecycle: { ...current.lifecycle, ...(body.lifecycle || {}) },
    readiness: { ...current.readiness, ...(body.readiness || {}) }
  };
  let configuration;
  try {
    configuration = normalizeRetentionConfig(candidate, candidate.presetKey);
  } catch (error) {
    throw httpError(400, "INVALID_RETENTION_CONFIGURATION", error.message);
  }

  await transact(db => {
    const organization = db.organizations.find(item => item.id === auth.organization.id);
    if (!organization) throw httpError(404, "WORKSPACE_NOT_FOUND", "فضای کاری پیدا نشد.");
    organization.retentionConfig = configuration;
    organization.updatedAt = new Date().toISOString();
    appendOperationalAudit(db, context, "retention_configuration_updated", "organization", organization.id, {
      presetKey: configuration.presetKey,
      lifecycle: configuration.lifecycle
    });
  });
  return { configuration, presets: listRetentionPresets() };
}

async function getRetentionWorkspace(organizationId) {
  const db = await readDb();
  const organization = db.organizations.find(item => item.id === organizationId);
  const configuration = normalizeRetentionConfig(organization?.retentionConfig || getRetentionPreset());
  const record = db.retentionAnalyses
    .filter(item => item.organizationId === organizationId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
  const configurationHash = hashRetentionConfiguration(configuration);
  const metricContract = latestMetricContract(db, organizationId) || buildDefaultMetricContract(organizationId, configuration);
  const shadowRuns = db.retentionShadowRuns
    .filter(item => item.organizationId === organizationId && (!record || item.analysisId === record.id))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const shadowRun = shadowRuns[0] || null;
  const shadow = {
    latestRun: shadowRun,
    healthyConsecutiveRuns: countHealthyConsecutiveRuns(shadowRuns),
    readyForExperiment: countHealthyConsecutiveRuns(shadowRuns) >= 2
  };
  const experiment = db.experiments
    .filter(item => item.organizationId === organizationId && item.sourceType === "retention_analysis" && (!record || item.sourceId === record.id))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
  const outcomeRecord = experiment ? db.outcomes
    .filter(item => item.organizationId === organizationId && item.sourceType === "retention_analysis" && item.experimentId === experiment.id)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null : null;
  const outcome = outcomeRecord?.analysis || null;
  const evidenceLevel = resolveRetentionEvidence({ analysis: record, shadowRun, outcome });
  const evidence = evidenceMeta(evidenceLevel);

  if (!record) {
    return enrichRetentionWorkspace({
      configuration,
      metricContract,
      evidence,
      experiment: null,
      outcome: null,
      shadow,
      analysis: null,
      stale: false,
      workspace: { ...buildRetentionWorkspace(configuration), evidenceLevel, evidenceLabelFa: evidence.labelFa }
    }, { record: null, shadowRun, experiment, outcome });
  }

  const stale = record.configurationHash !== configurationHash;
  const contract = {
    configuration,
    metricContract,
    evidence,
    experiment: publicRetentionExperiment(experiment),
    outcome: outcomeRecord ? { id: outcomeRecord.id, version: outcomeRecord.version, ...outcome } : null,
    shadow,
    analysis: {
      id: record.id,
      name: record.name,
      rowCount: record.rowCount,
      cutoffAt: record.cutoffAt,
      readiness: record.readiness,
      baseline: record.baseline,
      datasetHash: record.datasetHash || null,
      createdAt: record.createdAt
    },
    stale,
    workspace: stale ? {
      ...record.workspace,
      evidenceLevel,
      evidenceLabelFa: evidence.labelFa,
      status: "configuration_changed",
      statusFa: "نیازمند تحلیل مجدد",
      nextActionFa: "تنظیمات چرخه مشتری تغییر کرده است؛ فایل را دوباره تحلیل کنید."
    } : { ...record.workspace, evidenceLevel, evidenceLabelFa: evidence.labelFa }
  };
  return enrichRetentionWorkspace(contract, { record, shadowRun, experiment, outcome });
}

async function getRetentionDecisions(organizationId, searchParams) {
  const record = await getLatestRetentionRecord(organizationId);
  if (!record) return { analysisId: null, total: 0, page: 1, pageSize: 50, items: [] };
  const page = boundedInteger(searchParams.get("page"), 1, 1000000, 1);
  const pageSize = boundedInteger(searchParams.get("pageSize"), 1, 200, 50);
  const action = cleanText(searchParams.get("action"));
  const evidence = cleanText(searchParams.get("evidence"));
  const source = record.decisionQueue || [];
  const filtered = source.filter(item => (!action || effectiveRetentionAction(item) === action) && (!evidence || item.evidenceLevel === evidence));
  const offset = (page - 1) * pageSize;
  return {
    analysisId: record.id,
    total: filtered.length,
    page,
    pageSize,
    items: filtered.slice(offset, offset + pageSize)
  };
}

async function getRetentionDecisionReceipt(organizationId, decisionId) {
  const [record, db, contract] = await Promise.all([
    getLatestRetentionRecord(organizationId),
    readDb(),
    getRetentionWorkspace(organizationId)
  ]);
  if (!record) throw httpError(404, "RETENTION_ANALYSIS_NOT_FOUND", "ابتدا داده نگهداشت را تحلیل کنید.");
  const receipt = buildRetentionDecisionReceipt({
    record,
    contract,
    decisionId,
    ledgerEntries: (db.decisionLedger || []).filter(item => item.organizationId === organizationId)
  });
  if (!receipt) throw httpError(404, "RETENTION_DECISION_NOT_FOUND", "تصمیم انتخاب‌شده پیدا نشد.");
  return receipt;
}

async function overrideRetentionDecision(auth, decisionId, body, context = {}) {
  const allowedActions = new Set(["no_action", "message_no_discount", "targeted_discount"]);
  const overrideAction = cleanText(body.overrideAction);
  const reasonFa = cleanText(body.reasonFa);
  if (!allowedActions.has(overrideAction)) {
    throw httpError(400, "INVALID_OVERRIDE_ACTION", "اقدام جایگزین معتبر نیست.");
  }
  if (reasonFa.length < 12) {
    throw httpError(400, "OVERRIDE_REASON_REQUIRED", "دلیل Override باید حداقل ۱۲ نویسه و قابل حسابرسی باشد.");
  }

  let updated;
  await transact(db => {
    const record = db.retentionAnalyses
      .filter(item => item.organizationId === auth.organization.id)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0];
    if (!record) throw httpError(404, "RETENTION_ANALYSIS_NOT_FOUND", "ابتدا داده نگهداشت را تحلیل کنید.");
    const decision = (record.decisionQueue || []).find(item => item.decisionId === decisionId);
    if (!decision) throw httpError(404, "RETENTION_DECISION_NOT_FOUND", "تصمیم انتخاب‌شده پیدا نشد.");
    const createdAt = new Date().toISOString();
    decision.override = {
      action: overrideAction,
      reasonFa: reasonFa.slice(0, 500),
      actorId: auth.user.id,
      actorRole: auth.membership.role,
      createdAt
    };
    const workspaceDecision = (record.workspace?.queue || []).find(item => item.decisionId === decisionId);
    if (workspaceDecision) workspaceDecision.override = decision.override;
    appendDecision(db, {
      id: createId("led"),
      organizationId: auth.organization.id,
      eventType: "retention_decision_overridden",
      entityType: "retention_decision",
      entityId: decisionId,
      decision: overrideAction,
      decisionFa: "تصمیم نگهداشت با ثبت دلیل Override شد",
      rationaleFa: reasonFa.slice(0, 500),
      evidence: {
        analysisId: record.id,
        originalAction: decision.recommendedAction,
        evidenceLevel: decision.evidenceLevel,
        policyVersion: decision.policyVersion
      },
      createdAt
    });
    appendOperationalAudit(db, context, "retention_decision_overridden", "retention_decision", decisionId, {
      analysisId: record.id,
      originalAction: decision.recommendedAction,
      overrideAction
    });
    updated = { ...decision, effectiveAction: overrideAction };
  });
  return updated;
}

function effectiveRetentionAction(decision) {
  return decision.override?.action || decision.recommendedAction;
}

async function getBehavioralWorkspace(organizationId) {
  const [retentionState, campaign] = await Promise.all([
    getRetentionWorkspace(organizationId),
    getCurrentCampaign(organizationId)
  ]);
  return buildBehavioralWorkspace({
    retentionState,
    overview: buildDecisionOverview(campaign),
    contactSafety: retentionState.workspace?.contactSafety || null
  });
}

async function getContactPolicyWorkspace(organizationId) {
  const record = await getLatestRetentionRecord(organizationId);
  if (!record) return buildContactSafetyWorkspace([]);
  return record.contactSafety || record.workspace?.contactSafety || buildContactSafetyWorkspace(record.decisionQueue || []);
}

async function importRetentionAnalysis(organizationId, body, context = {}) {
  const csvText = extractCsvText(body);
  if (csvText.length < 20) throw httpError(400, "CSV_REQUIRED", "فایل تراکنش معتبر ارسال نشده است.");
  const rows = parseCSV(csvText);
  const currentConfiguration = (await getRetentionConfiguration(organizationId)).configuration;
  const preview = buildRetentionPreviewContract(
    previewRetentionRows(rows, currentConfiguration, body.mapping || {}, { cutoff: body.cutoff }),
    { csvText }
  );
  if (!matchesExpectedDatasetHash(body.expectedDatasetHash, preview.datasetHash)) {
    throw httpError(409, "RETENTION_DATASET_HASH_MISMATCH", "فایل از زمان پیش‌نمایش تغییر کرده است؛ دوباره پیش‌نمایش بگیرید.");
  }
  if (!preview.canImport) {
    const message = preview.privacy.blocked
      ? preview.nextActionFa
      : `نگاشت ستون‌های الزامی کامل نیست: ${preview.missingRequired.join("، ")}`;
    throw httpError(400, "RETENTION_MAPPING_REQUIRED", message);
  }
  const configuration = normalizeRetentionConfig({
    ...currentConfiguration,
    mapping: preview.mapping
  }, currentConfiguration.presetKey);
  let result;
  try {
    result = analyzeRetentionRows(rows, configuration, { cutoff: body.cutoff });
  } catch (error) {
    throw httpError(400, "RETENTION_ANALYSIS_FAILED", error.message);
  }

  const createdAt = new Date().toISOString();
  const record = {
    id: createId("ret"),
    organizationId,
    name: cleanText(body.name) || `تحلیل نگهداشت ${configuration.display.purchaseObjectFa}`,
    source: body.source === "demo_scenario" ? "demo_scenario" : "customer_upload",
    isDemoScenario: body.source === "demo_scenario",
    rowCount: rows.length,
    datasetHash: preview.datasetHash,
    cutoffAt: result.cutoffAt,
    configurationHash: hashRetentionConfiguration(configuration),
    configurationSnapshot: configuration,
    readiness: result.readiness,
    baseline: result.baseline ? {
      baselineVersion: result.baseline.baselineVersion,
      evidenceLevel: result.baseline.evidenceLevel,
      overall: result.baseline.overall,
      diagnostics: result.baseline.diagnostics,
      leakageAudit: result.baseline.leakageAudit,
      modelCard: result.baseline.modelCard,
      caveatsFa: result.baseline.caveatsFa
    } : null,
    decisionQueue: result.decisionQueue,
    contactSafety: result.contactSafety,
    workspace: result.workspace,
    createdAt
  };
  const artifact = await persistCsvArtifact(organizationId, context, "retention_transactions_csv", record.name, csvText, createdAt);

  try {
    await transact(db => {
      const organization = db.organizations.find(item => item.id === organizationId);
      if (!organization) throw httpError(404, "WORKSPACE_NOT_FOUND", "فضای کاری پیدا نشد.");
      organization.retentionConfig = configuration;
      organization.updatedAt = createdAt;
      db.retentionAnalyses.push(record);
      if (artifact) db.artifacts.push(artifact);
      appendOperationalAudit(db, context, "retention_analysis_imported", "retention_analysis", record.id, {
        rows: rows.length,
        readinessStatus: result.readiness.status,
        configurationHash: record.configurationHash,
        mapping: configuration.mapping,
        datasetHash: record.datasetHash,
        artifactId: artifact?.id || null
      });
    });
  } catch (error) {
    if (artifact) await deleteArtifact(artifact);
    throw error;
  }

  return {
    id: record.id,
    name: record.name,
    source: record.source,
    isDemoScenario: record.isDemoScenario,
    rowCount: record.rowCount,
    datasetHash: record.datasetHash,
    cutoffAt: record.cutoffAt,
    readiness: record.readiness,
    baseline: record.baseline,
    contactSafety: record.contactSafety,
    workspace: record.workspace,
    configuration,
    onboarding: {
      columns: preview.columns,
      mapping: preview.mapping,
      privacy: preview.privacy,
      quality: preview.quality,
      datasetHash: preview.datasetHash
    }
  };
}

async function createRetentionShadowRun(organizationId, body, context = {}) {
  const record = await getLatestRetentionRecord(organizationId);
  if (!record) throw httpError(404, "RETENTION_ANALYSIS_NOT_FOUND", "ابتدا داده نگهداشت را تحلیل کنید.");
  let run;
  try {
    run = buildRetentionShadowRun(record, {
      name: cleanText(body.name),
      capacity: body.capacity,
      excludedCustomerIds: Array.isArray(body.excludedCustomerIds) ? body.excludedCustomerIds : []
    });
  } catch (error) {
    throw httpError(400, "RETENTION_SHADOW_FAILED", error.message);
  }
  const dbSnapshot = await readDb();
  const previousRuns = dbSnapshot.retentionShadowRuns
    .filter(item => item.organizationId === organizationId && item.analysisId === record.id && item.status === "ready")
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const previous = previousRuns[0] || null;
  run.evidenceLevel = "shadow_result";
  run.evidenceLabelFa = evidenceMeta("shadow_result").labelFa;
  run.cycleNumber = previousRuns.length + 1;
  run.stability = compareRetentionShadowRuns(previous, run);
  const stored = { ...run, organizationId };
  await transact(db => {
    db.retentionShadowRuns.push(stored);
    appendOperationalAudit(db, context, "retention_shadow_run_created", "retention_shadow_run", run.id, {
      analysisId: run.analysisId,
      selectedCustomers: run.summary.selectedCustomers,
      cycleNumber: run.cycleNumber,
      stableWithPrevious: run.stability.passed,
      liveActionAllowed: false
    });
  });
  return run;
}

async function getRetentionShadowWorkspace(organizationId) {
  const db = await readDb();
  const runs = db.retentionShadowRuns
    .filter(item => item.organizationId === organizationId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  return {
    latestRun: runs[0] || null,
    healthyConsecutiveRuns: countHealthyConsecutiveRuns(runs),
    readyForExperiment: countHealthyConsecutiveRuns(runs) >= 2,
    recentRuns: runs.slice(0, 5).map(run => ({
      id: run.id,
      name: run.name,
      status: run.status,
      statusFa: run.statusFa,
      selectedCustomers: run.summary.selectedCustomers,
      createdAt: run.createdAt
    }))
  };
}

function compareRetentionShadowRuns(previous, current) {
  if (!previous) {
    return { passed: false, status: "needs_second_run", statusFa: "برای سنجش پایداری، اجرای دوم لازم است.", selectedCountDeltaRate: null };
  }
  const previousCount = Number(previous.summary?.selectedCustomers || 0);
  const currentCount = Number(current.summary?.selectedCustomers || 0);
  const deltaRate = previousCount ? Math.abs(currentCount - previousCount) / previousCount : currentCount ? 1 : 0;
  const sameSource = previous.source?.datasetVersion === current.source?.datasetVersion && previous.source?.policyVersion === current.source?.policyVersion;
  const passed = previous.status === "ready" && current.status === "ready" && sameSource && deltaRate <= 0.2;
  return {
    passed,
    status: passed ? "stable" : "needs_review",
    statusFa: passed ? "دو اجرای متوالی پایدار است." : "نسخه منبع یا ترکیب مخاطب بین دو اجرا تغییر معنادار دارد.",
    comparedRunId: previous.id,
    selectedCountDeltaRate: Math.round(deltaRate * 10000) / 10000
  };
}

function countHealthyConsecutiveRuns(runs) {
  if (!runs.length) return 0;
  const latestAnalysisId = runs[0].analysisId;
  let count = 0;
  for (const run of runs) {
    if (run.analysisId !== latestAnalysisId || run.status !== "ready") break;
    count += 1;
    if (count >= 2 && run.stability?.passed !== true && runs[0].stability?.passed !== true) break;
  }
  return runs[0].stability?.passed === true ? Math.max(2, count) : Math.min(1, count);
}

async function getLatestRetentionExperiment(organizationId) {
  const db = await readDb();
  return db.experiments
    .filter(item => item.organizationId === organizationId && item.sourceType === "retention_analysis")
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
}

async function getLatestRetentionOutcome(organizationId, experimentId = null) {
  const db = await readDb();
  return db.outcomes
    .filter(item => item.organizationId === organizationId && item.sourceType === "retention_analysis" && (!experimentId || item.experimentId === experimentId))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
}

async function registerRetentionExperiment(auth, body, context = {}) {
  const db = await readDb();
  const record = db.retentionAnalyses
    .filter(item => item.organizationId === auth.organization.id)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0];
  if (!record) throw httpError(409, "RETENTION_ANALYSIS_REQUIRED", "ابتدا تحلیل Retention را بسازید.");
  const contract = latestMetricContract(db, auth.organization.id);
  if (!contract || contract.status !== "locked") {
    throw httpError(409, "LOCKED_METRIC_CONTRACT_REQUIRED", "Metric Contract باید با تأیید CRM، داده و مالی قفل شود.");
  }
  const healthyRuns = db.retentionShadowRuns
    .filter(item => item.organizationId === auth.organization.id && item.analysisId === record.id && item.status === "ready")
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  if (healthyRuns.length < 2 || healthyRuns[0].stability?.passed !== true) {
    throw httpError(409, "TWO_HEALTHY_SHADOW_RUNS_REQUIRED", "پیش از آزمایش زنده، دو Shadow Run متوالی و پایدار لازم است.");
  }
  const existing = db.experiments.find(item => item.organizationId === auth.organization.id && item.sourceType === "retention_analysis" && item.sourceId === record.id && ["registered", "outcome_received"].includes(item.status));
  if (existing) return publicRetentionExperiment(existing);

  const experiment = buildRetentionExperiment({
    id: createId("rexp"),
    organizationId: auth.organization.id,
    analysis: record,
    metricContract: contract,
    shadowRuns: healthyRuns.slice(0, 2),
    name: body.name
  });
  await transact(state => {
    state.experiments.push(experiment);
    appendDecision(state, {
      id: createId("led"),
      organizationId: auth.organization.id,
      eventType: "retention_experiment_registered",
      entityType: "retention_experiment",
      entityId: experiment.id,
      decision: "prospective_policy_test_registered",
      decisionFa: "آزمایش سیاست فعلی CRM در برابر سیاست MarginLift ثبت شد",
      rationaleFa: "Metric Contract قفل و دو Shadow Run متوالی سالم بوده است.",
      evidence: { metricContractId: contract.id, shadowRunIds: experiment.prerequisites.healthyShadowRunIds },
      createdAt: experiment.createdAt
    });
    appendOperationalAudit(state, context, "retention_experiment_registered", "retention_experiment", experiment.id, {
      analysisId: record.id,
      assignmentRows: experiment.assignments.length,
      metricContractId: contract.id
    });
  });
  return publicRetentionExperiment(experiment);
}

async function previewRetentionOutcome(organizationId, body) {
  const experiment = await getLatestRetentionExperiment(organizationId);
  if (!experiment) throw httpError(409, "RETENTION_EXPERIMENT_REQUIRED", "ابتدا آزمایش Retention را ثبت کنید.");
  const csvText = extractCsvText(body);
  const parsed = parseCSV(csvText);
  const rows = normalizeRetentionOutcomeRows(parsed);
  return {
    rowCount: rows.length,
    columns: parsed[0] ? Object.keys(parsed[0]) : [],
    integrity: auditRetentionOutcome(experiment, rows, { analyzedAt: body.analyzedAt })
  };
}

async function importRetentionOutcome(auth, body, context = {}) {
  const experiment = await getLatestRetentionExperiment(auth.organization.id);
  if (!experiment) throw httpError(409, "RETENTION_EXPERIMENT_REQUIRED", "ابتدا آزمایش Retention را ثبت کنید.");
  const csvText = extractCsvText(body);
  const rows = normalizeRetentionOutcomeRows(parseCSV(csvText));
  const integrity = auditRetentionOutcome(experiment, rows, { analyzedAt: body.analyzedAt });
  if (integrity.fatal) {
    throw httpError(422, "RETENTION_OUTCOME_INTEGRITY_REJECTED", integrity.fatalIssues.map(item => item.messageFa).join(" "));
  }
  const analysis = analyzeRetentionOutcome(experiment, rows, integrity);
  const createdAt = new Date().toISOString();
  const previous = await getLatestRetentionOutcome(auth.organization.id, experiment.id);
  const outcome = {
    id: createId("rout"),
    organizationId: auth.organization.id,
    sourceType: "retention_analysis",
    sourceId: experiment.sourceId,
    experimentId: experiment.id,
    version: Number(previous?.version || 0) + 1,
    supersedesOutcomeId: previous?.id || null,
    name: cleanText(body.name) || "Outcome پایلوت Retention",
    analysis,
    createdAt,
    updatedAt: createdAt
  };
  const artifact = await persistCsvArtifact(auth.organization.id, context, "retention_outcome_csv", outcome.name, csvText, createdAt);
  try {
    await transact(db => {
      db.outcomes.push(outcome);
      const storedExperiment = db.experiments.find(item => item.id === experiment.id);
      if (storedExperiment) {
        storedExperiment.status = "outcome_received";
        storedExperiment.updatedAt = createdAt;
      }
      if (artifact) db.artifacts.push(artifact);
      appendDecision(db, {
        id: createId("led"),
        organizationId: auth.organization.id,
        eventType: "retention_outcome_evaluated",
        entityType: "retention_outcome",
        entityId: outcome.id,
        decision: analysis.summary.decision,
        decisionFa: analysis.summary.decisionFa,
        rationaleFa: `تحلیل ITT با سطح شواهد ${analysis.evidenceLabelFa} ثبت شد.`,
        evidence: { experimentId: experiment.id, integrityStatus: integrity.status, estimate: analysis.summary.incrementalContributionProfitPerAssignedCustomer },
        createdAt
      });
      appendOperationalAudit(db, context, "retention_outcome_imported", "retention_outcome", outcome.id, {
        experimentId: experiment.id,
        version: outcome.version,
        artifactId: artifact?.id || null
      });
    });
  } catch (error) {
    if (artifact) await deleteArtifact(artifact);
    throw error;
  }
  return { id: outcome.id, version: outcome.version, supersedesOutcomeId: outcome.supersedesOutcomeId, ...analysis };
}

async function verifyRetentionOutcomeFinance(auth, outcomeId, body, context = {}) {
  let result;
  await transact(db => {
    const outcome = db.outcomes.find(item => item.id === outcomeId && item.organizationId === auth.organization.id && item.sourceType === "retention_analysis");
    if (!outcome) throw httpError(404, "RETENTION_OUTCOME_NOT_FOUND", "Outcome انتخاب‌شده پیدا نشد.");
    try {
      outcome.analysis = verifyRetentionFinance(outcome.analysis, {
        reviewerFa: body.reviewerFa,
        reasonFa: body.reasonFa,
        actorId: auth.user.id
      });
    } catch (error) {
      throw httpError(409, "FINANCE_VERIFICATION_REJECTED", error.message);
    }
    outcome.updatedAt = new Date().toISOString();
    appendDecision(db, {
      id: createId("led"),
      organizationId: auth.organization.id,
      eventType: "retention_finance_reconciled",
      entityType: "retention_outcome",
      entityId: outcome.id,
      decision: "finance_verified",
      decisionFa: "نتیجه پایلوت با Finance تطبیق و تأیید شد",
      rationaleFa: outcome.analysis.financeVerification.reasonFa,
      evidence: { experimentId: outcome.experimentId, outcomeVersion: outcome.version },
      createdAt: outcome.updatedAt
    });
    appendOperationalAudit(db, context, "retention_finance_verified", "retention_outcome", outcome.id, { experimentId: outcome.experimentId });
    result = { id: outcome.id, version: outcome.version, ...outcome.analysis };
  });
  return result;
}

async function loadRetentionDemoScenario(auth, body, context = {}) {
  const presetKey = retentionDemoScenarios[body.presetKey] ? body.presetKey : "generic_ecommerce";
  const scenario = retentionDemoScenarios[presetKey];
  await updateRetentionConfiguration(auth, {
    presetKey,
    readiness: { minimumHistoryDays: 30, minimumCustomers: 5, minimumRepeatCustomers: 5 }
  }, context);
  const csvText = await fs.promises.readFile(scenario.file, "utf8");
  return importRetentionAnalysis(auth.organization.id, {
    name: scenario.name,
    csvText,
    cutoff: scenario.cutoff,
    source: "demo_scenario"
  }, context);
}

async function getLatestRetentionRecord(organizationId) {
  const db = await readDb();
  return db.retentionAnalyses
    .filter(item => item.organizationId === organizationId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
}

function buildRetentionAudienceCsv(record) {
  const queue = (record.decisionQueue || record.workspace?.queue || []).filter(item => item.actionAllowed);
  const datasetVersion = record.baseline?.modelCard?.datasetVersion || "";
  const modelVersion = record.baseline?.modelCard?.modelVersion || record.baseline?.baselineVersion || "";
  const headers = [
    "customer_id_hash", "state", "days_from_due", "purchase_count", "average_contribution_margin",
    "risk_band", "recommended_action", "incentive_policy", "preferred_channel", "contact_count_30d", "action_allowed", "incentive_allowed", "evidence_level", "decision_reason_fa", "policy_version",
    "dataset_version", "model_version", "analysis_id"
  ];
  const rows = queue.map(item => [
    item.customerIdHash,
    item.state,
    item.daysFromDue,
    item.purchaseCount,
    item.averageContributionMargin ?? "",
    item.riskBand || "",
    item.recommendedAction,
    item.incentivePolicy || "no_action",
    item.contactSafety?.preferredChannel || "",
    item.contactSafety?.contactCount30d ?? "",
    item.actionAllowed ? "true" : "false",
    item.incentiveAllowed ? "true" : "false",
    "observational_estimate",
    item.decisionReasonFa,
    item.policyVersion || record.workspace?.policyVersion || "",
    datasetVersion,
    modelVersion,
    record.id
  ]);
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n")}\n`;
}

function normalizeRetentionReadoutRole(value) {
  const role = String(value || "executive").trim().toLowerCase();
  return ["executive", "crm", "finance", "data"].includes(role) ? role : "executive";
}

function buildRetentionRoleReadout(organization, record, role, retentionState = {}) {
  const workspace = record.workspace || {};
  const readiness = record.readiness || {};
  const baseline = record.baseline || {};
  const queue = record.decisionQueue || workspace.queue || [];
  const outcome = retentionState.outcome || null;
  const evidence = retentionState.evidence || evidenceMeta("observational_estimate");
  const roleLabel = ({ executive: "مدیریت ارشد", crm: "CRM و رشد", finance: "مدیریت مالی", data: "داده و تحلیل" })[role];
  const common = [
    `# گزارش نگهداشت MarginLift برای ${organization.name}`,
    "",
    `**مخاطب:** ${roleLabel}`,
    `**نام تحلیل:** ${record.name}`,
    `**سطح شواهد:** ${evidence.labelFa}`,
    `**مرز ادعا:** ${evidence.claimFa}`,
    `**مجوز استفاده:** ${outcome?.evidenceLevel === "verified_incremental" ? "قابل استفاده برای تصمیم Scale/Review/Stop با رعایت Guardrailها" : "فقط تحلیل و بازبینی انسانی؛ اقدام خودکار مجاز نیست"}`,
    ""
  ];
  const roleContent = {
    executive: [
      "## تصمیم مدیریتی",
      "",
      workspace.headlineFa || "خط مبنای نگهداشت ساخته شده است.",
      "",
      `- مشتریان قابل بررسی: ${formatNumber(workspace.metrics?.units)}`,
      `- مشتریان در صف اقدام: ${formatNumber(queue.length)}`,
      `- میانه خرید مجدد: ${workspace.metrics?.medianRepurchaseDays === null ? "محاسبه نشد" : `${formatNumber(workspace.metrics?.medianRepurchaseDays)} روز`}`,
      `- اقدام بعدی: ${outcome?.summary?.decisionFa || workspace.nextActionFa || "بازبینی داده"}`,
      `- سود مشارکتی افزایشی ۳۰روزه: ${outcome ? `${formatNumber(outcome.summary.incrementalContributionProfitPerAssignedCustomer)} تومان به‌ازای مشتری تخصیص‌یافته` : "ناموجود تا دریافت Outcome"}`
    ],
    crm: [
      "## خروجی اجرایی CRM",
      "",
      ...summarizeRetentionActions(queue).map(item => `- ${item.labelFa}: ${formatNumber(item.count)} مشتری`),
      "",
      "مشوق برای هیچ ردیفی صرفاً براساس ریسک مجاز نشده است. فایل مخاطبان باید پیش از اجرا با exclusionهای CRM تطبیق داده شود."
    ],
    finance: [
      "## برداشت مالی",
      "",
      `- ردیف دارای داده سود مشارکتی: ${formatNumber(queue.filter(item => Number.isFinite(item.averageContributionMargin)).length)}`,
      `- سود افزایشی تأییدشده: ${outcome?.evidenceLevel === "verified_incremental" ? `${formatNumber(outcome.summary.incrementalContributionProfitPerAssignedCustomer)} تومان به‌ازای مشتری` : "هنوز موجود نیست"}.`,
      "- آزادسازی بودجه مشوق: فقط پس از پایلوت کنترل‌شده و تطبیق هزینه واقعی مجاز است.",
      "",
      "این گزارش Value Case قطعی نیست و نباید مبنای ثبت منفعت مالی قرار بگیرد."
    ],
    data: [
      "## وضعیت داده و مدل",
      "",
      `- امتیاز آمادگی: ${formatNumber(readiness.score)}٪`,
      `- ردیف تراکنش: ${formatNumber(readiness.summary?.transactionRows)}`,
      `- مشتری یکتا: ${formatNumber(readiness.summary?.uniqueCustomers)}`,
      `- پوشش تاریخی: ${formatNumber(readiness.summary?.coverageDays)} روز`,
      `- نسخه دیتاست: ${baseline.modelCard?.datasetVersion || "موجود نیست"}`,
      `- نسخه مدل: ${baseline.modelCard?.modelVersion || baseline.baselineVersion || "موجود نیست"}`,
      `- کنترل leakage: ${baseline.leakageAudit?.statusFa || "اجرا نشده"}`,
      "",
      "### کنترل‌های آمادگی",
      "",
      ...(readiness.checks || []).map(check => `- ${check.passed ? "پاس" : "نیازمند اصلاح"}: ${check.labelFa} — ${check.detailFa}`)
    ]
  }[role];
  return [...common, ...roleContent, "", "## مرز ادعا", "", evidence.claimFa, "تصمیم Scale فقط پس از Live Holdout سالم و تطبیق Finance مجاز است.", ""].join("\n");
}

function summarizeRetentionActions(queue) {
  const counts = new Map();
  queue.forEach(item => {
    const current = counts.get(item.recommendedAction) || { labelFa: item.recommendedActionFa, count: 0 };
    current.count += 1;
    counts.set(item.recommendedAction, current);
  });
  return [...counts.values()].sort((left, right) => right.count - left.count);
}

async function previewRetentionImport(organizationId, body) {
  const csvText = extractCsvText(body);
  if (csvText.length < 20) throw httpError(400, "CSV_REQUIRED", "فایل تراکنش معتبر ارسال نشده است.");
  const rows = parseCSV(csvText);
  const configuration = (await getRetentionConfiguration(organizationId)).configuration;
  try {
    return buildRetentionPreviewContract(
      previewRetentionRows(rows, configuration, body.mapping || {}, { cutoff: body.cutoff }),
      { csvText }
    );
  } catch (error) {
    throw httpError(400, "RETENTION_PREVIEW_FAILED", error.message);
  }
}

function hashRetentionConfiguration(configuration) {
  return crypto.createHash("sha256").update(JSON.stringify(configuration)).digest("hex").slice(0, 16);
}

async function getCurrentOutcomeAnalysis(organizationId, experimentId) {
  if (!experimentId) return null;
  const db = await readDb();
  const stored = db.outcomes
    .filter(item => item.organizationId === organizationId && item.experimentId === experimentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  if (stored) {
    return {
      id: stored.id,
      isDemo: false,
      experimentId: stored.experimentId,
      version: stored.version || 1,
      supersedesOutcomeId: stored.supersedesOutcomeId || null,
      ...stored.analysis
    };
  }

  return null;
}

async function getCurrentExperiment(organizationId, customerAnalysisId) {
  if (!customerAnalysisId || customerAnalysisId === "demo_customer_analysis") return loadSampleExperiment();
  const db = await readDb();
  return db.experiments
    .filter(item => item.organizationId === organizationId && item.customerAnalysisId === customerAnalysisId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

async function getCustomerAnalysisById(organizationId, customerAnalysisId) {
  const db = await readDb();
  const stored = db.customerAnalyses.find(item =>
    item.organizationId === organizationId && item.id === customerAnalysisId
  );
  if (!stored) return null;
  return { id: stored.id, isDemo: false, experimentId: stored.experimentId || null, ...stored.analysis };
}

async function getCurrentPilotState(organizationId) {
  const [campaign, customerAnalysis] = await Promise.all([
    getCurrentCampaign(organizationId),
    getCurrentCustomerAnalysis(organizationId)
  ]);
  const experiment = await getCurrentExperiment(organizationId, customerAnalysis.id);
  const outcome = await getCurrentOutcomeAnalysis(organizationId, experiment?.id);
  const readiness = buildReadinessAudit(customerAnalysis, campaign, outcome);
  const savingsSnapshot = buildSavingsSnapshot(customerAnalysis, campaign, readiness, outcome);
  const workspace = buildPilotWorkspace(readiness, customerAnalysis, outcome, experiment);
  return {
    campaign,
    customerAnalysis,
    experiment: toPublicExperiment(experiment),
    outcome,
    readiness,
    savingsSnapshot,
    workspace,
    pricing: buildPricingPlans()
  };
}

async function getModelGovernanceOverview(organizationId) {
  const db = await readDb();
  const customerRecord = db.customerAnalyses
    .filter(item => item.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  let governance = customerRecord?.modelGovernance || null;
  if (!customerRecord) {
    const sampleRows = normalizeCustomerRows(parseCSV(fs.readFileSync(sampleCustomerCsvPath, "utf8")));
    governance = buildModelGovernance(sampleRows, null, { generatedAt: new Date(0).toISOString() });
  }
  const outcomeRecord = customerRecord
    ? db.outcomes
      .filter(item => item.organizationId === organizationId && item.customerAnalysisId === customerRecord.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null
    : null;
  const ledger = getDecisionLedgerFromDb(db, organizationId);
  return {
    modelGovernance: toPublicModelGovernance(governance),
    outcomeMonitor: buildOutcomeMonitor(outcomeRecord),
    decisionLedger: ledger,
    operatingPolicy: {
      autoPromotion: false,
      autoScale: false,
      policyFa: "مدل فقط پس از پایلوت تصادفی سالم، تکرار نتیجه و تأیید انسانی ارتقا می‌یابد."
    }
  };
}

async function getDecisionLedger(organizationId) {
  return getDecisionLedgerFromDb(await readDb(), organizationId);
}

function getDecisionLedgerFromDb(db, organizationId) {
  const records = (db.decisionLedger || []).filter(item => item.organizationId === organizationId);
  const verification = verifyDecisionLedger(records, organizationId);
  return {
    integrity: {
      valid: verification.valid,
      checked: verification.checked,
      latestHash: verification.latestHash || null,
      statusFa: verification.valid ? "زنجیره تصمیم سالم است" : "یکپارچگی زنجیره تصمیم مخدوش است"
    },
    entries: records.slice(-20).reverse().map(toPublicDecision)
  };
}

async function importCustomerAnalysis(organizationId, body, context = {}) {
  const name = cleanText(body.name) || "تحلیل مشتری‌محور واردشده";
  const csvText = extractCsvText(body);
  if (csvText.length < 20) {
    throw httpError(400, "CSV_REQUIRED", "فایل CSV معتبر ارسال نشده است.");
  }

  const parsedRows = parseCSV(csvText);
  if (!looksLikeCustomerRows(parsedRows)) {
    throw httpError(400, "CUSTOMER_CSV_REQUIRED", "برای این بخش، ستون customer_id لازم است.");
  }

  const rows = normalizeCustomerRows(parsedRows);
  const previousRecord = (await readDb()).customerAnalyses
    .filter(item => item.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  const modelGovernance = buildModelGovernance(rows, previousRecord?.modelGovernance || null);
  const analysis = analyzeCustomers(rows, { name });
  const pilotPopulation = analysis.pilotPopulation || [];
  delete analysis.pilotPopulation;
  const createdAt = new Date().toISOString();
  const record = {
    id: createId("cus"),
    organizationId,
    name,
    rowCount: rows.length,
    pilotPopulation,
    modelGovernance,
    analysis,
    createdAt
  };
  const experiment = buildExperimentRecord({
    id: createId("exp"),
    organizationId,
    customerAnalysisId: record.id,
    name: `${name} / Experiment Registry`,
    rows,
    csvText,
    assignmentMethod: body.assignmentMethod,
    outcomeWindowDays: body.outcomeWindowDays,
    analysisPlan: analysis.experimentPlan,
    createdAt
  });
  record.experimentId = experiment.id;
  const artifact = await persistCsvArtifact(organizationId, context, "customer_csv", name, csvText, createdAt);

  try {
    await transact(db => {
      db.customerAnalyses.push(record);
      db.experiments.push(experiment);
      if (artifact) db.artifacts.push(artifact);
      appendDecision(db, {
      id: createId("led"),
      organizationId,
      eventType: "model_evaluation_completed",
      entityType: "customer_analysis",
      entityId: record.id,
      decision: "shadow_evaluation",
      decisionFa: "ارزیابی آفلاین ثبت شد؛ Champion حفظ شد",
      rationaleFa: modelGovernance.registry.promotionGate.recommendationFa,
      evidence: {
        rows: rows.length,
        backtestStatus: modelGovernance.backtest.status,
        driftStatus: modelGovernance.drift.status,
        claimLevel: modelGovernance.claimLevel
      },
      createdAt
      });
      appendOperationalAudit(db, context, "customer_analysis_imported", "customer_analysis", record.id, {
        rows: rows.length,
        experimentId: experiment.id,
        artifactId: artifact?.id || null
      });
    });
  } catch (error) {
    if (artifact) await deleteArtifact(artifact);
    throw error;
  }
  await enqueueIntegrityCheck(organizationId, record.id);

  return {
    id: record.id,
    isDemo: false,
    experimentId: experiment.id,
    experiment: toPublicExperiment(experiment),
    modelGovernance: toPublicModelGovernance(modelGovernance),
    ...analysis
  };
}

async function registerProspectiveExperiment(organizationId, body, context = {}) {
  const customerAnalysis = await getCurrentCustomerAnalysis(organizationId);
  if (customerAnalysis.isDemo) {
    throw httpError(409, "CUSTOMER_DATA_REQUIRED", "ابتدا CSV مشتری واقعی را وارد کنید.");
  }
  const db = await readDb();
  const current = await getCurrentExperiment(organizationId, customerAnalysis.id);
  const hasOpenRegisteredExperiment = current?.status === "registered" &&
    current.design?.randomizationEvidence?.verified === true &&
    !db.outcomes.some(item => item.experimentId === current.id);
  if (hasOpenRegisteredExperiment) {
    throw httpError(409, "ACTIVE_EXPERIMENT_EXISTS", "یک پایلوت ثبت‌شده فعال است؛ assignment همان پایلوت را دانلود کنید.");
  }

  const storedCustomerAnalysis = db.customerAnalyses.find(item =>
    item.organizationId === organizationId && item.id === customerAnalysis.id
  );
  const eligible = (storedCustomerAnalysis?.pilotPopulation?.length
    ? storedCustomerAnalysis.pilotPopulation
    : (customerAnalysis.channelExport || []).map(item => ({
      customerId: item.customer_id,
      recommendedAction: item.recommended_action,
      baselineRevenue: item.clv_toman,
      eligible: item.recommended_action !== "control"
    })))
    .filter(item => item.customerId && item.recommendedAction && item.eligible);
  if (eligible.length < 2) {
    throw httpError(422, "INSUFFICIENT_ELIGIBLE_AUDIENCE", "برای ساخت holdout حداقل دو مشتری واجد شرایط لازم است.");
  }

  const holdoutRate = normalizeHoldoutRate(body.holdoutRate);
  const seed = crypto.randomBytes(32).toString("hex");
  const ranked = eligible
    .map(item => ({
      ...item,
      allocationScore: crypto.createHash("sha256").update(`${seed}:${item.customerId}`).digest("hex")
    }))
    .sort((left, right) => left.allocationScore.localeCompare(right.allocationScore));
  const controlCount = Math.max(1, Math.min(ranked.length - 1, Math.round(ranked.length * holdoutRate)));
  const controlIds = new Set(ranked.slice(0, controlCount).map(item => item.customerId));
  const baselineByCustomer = new Map((current?.assignments || []).map(item => [item.customerId, item.baselineRevenue]));
  const rows = ranked.map(item => ({
    customerId: item.customerId,
    treatment: controlIds.has(item.customerId) ? "control" : item.recommendedAction,
    exposed: false,
    revenue90d: item.baselineRevenue ?? baselineByCustomer.get(item.customerId) ?? null
  }));
  const createdAt = new Date().toISOString();
  const populationHash = hashDataset(ranked.map(item => item.customerId).sort().join("\n"));
  const seedHash = `sha256:${crypto.createHash("sha256").update(seed).digest("hex")}`;
  const assignmentCsv = buildAssignmentSourceCsv(rows);
  const experiment = buildExperimentRecord({
    id: createId("exp"),
    organizationId,
    customerAnalysisId: customerAnalysis.id,
    name: cleanText(body.name) || `${customerAnalysis.name} / پایلوت prospective`,
    rows,
    csvText: assignmentCsv,
    assignmentMethod: "deterministic_hash",
    randomizationSeed: seed,
    randomizationEvidence: {
      verified: true,
      source: "server_generated",
      algorithm: "sha256_ranked_holdout_v1",
      seedHash,
      populationHash,
      generatedAt: createdAt,
      holdoutRate
    },
    outcomeWindowDays: body.outcomeWindowDays,
    analysisPlan: customerAnalysis.experimentPlan,
    createdAt
  });
  experiment.status = "registered";

  await transact(state => {
    state.experiments.push(experiment);
    const storedAnalysis = state.customerAnalyses.find(item => item.id === customerAnalysis.id && item.organizationId === organizationId);
    if (storedAnalysis) storedAnalysis.experimentId = experiment.id;
    appendDecision(state, {
      id: createId("led"),
      organizationId,
      eventType: "experiment_registered",
      entityType: "experiment",
      entityId: experiment.id,
      decision: "analysis_plan_locked",
      decisionFa: "پایلوت prospective ثبت و Analysis Plan قفل شد",
      rationaleFa: "assignment تصادفی سمت سرور تولید شد و تا outcome قابل ممیزی است.",
      evidence: {
        assignmentRows: rows.length,
        controlRows: controlCount,
        holdoutRate,
        populationHash
      },
      createdAt
    });
    appendOperationalAudit(state, context, "experiment_registered", "experiment", experiment.id, {
      assignmentRows: rows.length,
      controlRows: controlCount
    });
  });
  await enqueueIntegrityCheck(organizationId, experiment.id);
  return toPublicExperiment(experiment);
}

async function importOutcomeAnalysis(organizationId, body, context = {}) {
  const name = cleanText(body.name) || "نتیجه پایلوت واردشده";
  const csvText = extractCsvText(body);
  if (csvText.length < 20) {
    throw httpError(400, "CSV_REQUIRED", "فایل outcome معتبر ارسال نشده است.");
  }

  const experimentId = cleanText(body.experimentId);
  if (!experimentId) {
    throw httpError(400, "EXPERIMENT_ID_REQUIRED", "ابتدا داده مشتری را وارد کنید تا Experiment Registry ساخته شود.");
  }
  const db = await readDb();
  const experiment = db.experiments.find(item => item.organizationId === organizationId && item.id === experimentId);
  if (!experiment) {
    throw httpError(404, "EXPERIMENT_NOT_FOUND", "آزمایش انتخاب‌شده پیدا نشد؛ داده مشتری را دوباره وارد کنید.");
  }
  const customerAnalysis = await getCustomerAnalysisById(organizationId, experiment.customerAnalysisId);
  if (!customerAnalysis) {
    throw httpError(409, "EXPERIMENT_ANALYSIS_MISSING", "تحلیل مبنای این آزمایش در دسترس نیست.");
  }
  const rows = normalizeOutcomeRows(parseCSV(csvText));
  const integrity = auditOutcomeRows(experiment, rows);
  if (integrity.fatal) {
    throw httpError(422, "OUTCOME_INTEGRITY_REJECTED", integrity.fatalIssues[0].messageFa);
  }
  const analysis = analyzeOutcomeRows(rows, customerAnalysis, integrity, experiment);
  const priorOutcomes = db.outcomes
    .filter(item => item.organizationId === organizationId && item.experimentId === experiment.id)
    .sort((a, b) => Number(b.version || 1) - Number(a.version || 1));
  const previousOutcome = priorOutcomes[0] || null;
  const version = Number(previousOutcome?.version || 0) + 1;
  const outcomeDatasetHash = hashDataset(csvText);
  analysis.provenance = {
    experimentId: experiment.id,
    customerAnalysisId: experiment.customerAnalysisId,
    assignmentDatasetHash: experiment.dataset.hash,
    outcomeDatasetHash,
    assignmentSchemaVersion: experiment.dataset.schemaVersion,
    outcomeSchemaVersion: "pilot-outcome-v1",
    outcomeVersion: version
  };
  const record = {
    id: createId("out"),
    organizationId,
    experimentId: experiment.id,
    customerAnalysisId: experiment.customerAnalysisId,
    assignmentDatasetHash: experiment.dataset.hash,
    outcomeDatasetHash,
    version,
    supersedesOutcomeId: previousOutcome?.id || null,
    name,
    rowCount: rows.length,
    analysis,
    createdAt: new Date().toISOString()
  };
  const artifact = await persistCsvArtifact(organizationId, context, "outcome_csv", name, csvText, record.createdAt);

  try {
    await transact(db => {
      db.outcomes.push(record);
      if (artifact) db.artifacts.push(artifact);
      const storedExperiment = db.experiments.find(item => item.id === experiment.id);
      if (storedExperiment) {
        storedExperiment.status = "outcome_received";
        storedExperiment.latestOutcomeId = record.id;
        storedExperiment.latestOutcomeVersion = version;
        storedExperiment.updatedAt = record.createdAt;
      }
      appendDecision(db, {
      id: createId("led"),
      organizationId,
      eventType: "outcome_evaluated",
      entityType: "outcome",
      entityId: record.id,
      decision: analysis.summary.decisionStatus,
      decisionFa: analysis.summary.recommendationFa,
      rationaleFa: analysis.summary.decisionRationaleFa,
      evidence: {
        experimentId: experiment.id,
        outcomeVersion: version,
        evidenceStatus: analysis.summary.evidenceStatus,
        pValue: analysis.summary.pValue,
        ciLow: analysis.summary.primaryCiLow,
        ciHigh: analysis.summary.primaryCiHigh
      },
      createdAt: record.createdAt
      });
      appendOperationalAudit(db, context, "outcome_imported", "outcome", record.id, {
        rows: rows.length,
        experimentId: experiment.id,
        version,
        artifactId: artifact?.id || null
      });
    });
  } catch (error) {
    if (artifact) await deleteArtifact(artifact);
    throw error;
  }
  await enqueueIntegrityCheck(organizationId, record.id);

  return {
    id: record.id,
    isDemo: false,
    experimentId: experiment.id,
    version,
    supersedesOutcomeId: record.supersedesOutcomeId,
    ...analysis
  };
}

async function getAnalysisHistory(organizationId) {
  const db = await readDb();
  const campaigns = db.campaigns
    .filter(item => item.organizationId === organizationId)
    .map(item => ({
      id: item.id,
      type: "campaign",
      typeFa: "کمپین سگمنتی",
      name: item.name,
      experimentId: item.experimentId || null,
      version: item.version || 1,
      rowCount: item.rowCount,
      createdAt: item.createdAt,
      headlineFa: `${formatMoney(item.analysis?.campaign?.nextSavings || 0)} صرفه‌جویی پیشنهادی`
    }));
  const customerAnalyses = db.customerAnalyses
    .filter(item => item.organizationId === organizationId)
    .map(item => ({
      id: item.id,
      type: "customer",
      typeFa: "تحلیل مشتری‌محور",
      name: item.name,
      rowCount: item.rowCount,
      createdAt: item.createdAt,
      headlineFa: `${formatMoney(item.analysis?.summary?.expectedIncrementalProfit || 0)} سود افزایشی`
    }));
  const outcomes = db.outcomes
    .filter(item => item.organizationId === organizationId)
    .map(item => ({
      id: item.id,
      type: "outcome",
      typeFa: "Outcome پایلوت",
      name: item.name,
      rowCount: item.rowCount,
      createdAt: item.createdAt,
      headlineFa: item.analysis?.summary?.recommendationFa || "readout آماده"
    }));

  return [...campaigns, ...customerAnalyses, ...outcomes]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 12);
}

async function getWorkspaceMembers(organizationId) {
  const db = await readDb();
  return db.memberships
    .filter(item => item.organizationId === organizationId)
    .map(membership => {
      const user = db.users.find(item => item.id === membership.userId);
      return {
        id: membership.id,
        userId: membership.userId,
        email: user?.email || "",
        name: user?.name || "",
        role: membership.role,
        createdAt: membership.createdAt
      };
    });
}

async function createWorkspaceMember(auth, body, context) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const role = normalizeRole(body.role || "viewer");
  validateEmailAndPassword(email, password);
  if (password.length < 12) {
    throw httpError(400, "WEAK_TEMPORARY_PASSWORD", "رمز عبور عضو جدید باید حداقل ۱۲ کاراکتر باشد.");
  }

  return transact(db => {
    if (db.users.some(item => item.email === email)) {
      throw httpError(409, "MEMBER_EMAIL_EXISTS", "این ایمیل از قبل در سیستم ثبت شده است.");
    }
    const now = new Date().toISOString();
    const user = {
      id: createId("usr"),
      email,
      name: cleanText(body.name) || email.split("@")[0],
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now
    };
    const membership = {
      id: createId("mem"),
      organizationId: auth.organization.id,
      userId: user.id,
      role,
      createdAt: now
    };
    db.users.push(user);
    db.memberships.push(membership);
    appendOperationalAudit(db, context, "workspace_member_created", "membership", membership.id, { role });
    return { id: membership.id, userId: user.id, email, name: user.name, role, createdAt: now };
  });
}

async function updateWorkspaceMemberRole(auth, membershipId, body, context) {
  const role = normalizeRole(body.role || "");
  return transact(db => {
    const membership = db.memberships.find(item =>
      item.id === membershipId && item.organizationId === auth.organization.id
    );
    if (!membership) throw httpError(404, "MEMBERSHIP_NOT_FOUND", "عضو فضای کاری پیدا نشد.");
    if (membership.userId === auth.user.id) {
      throw httpError(409, "SELF_ROLE_CHANGE_BLOCKED", "برای جلوگیری از قفل‌شدن فضای کاری، نقش خودتان را تغییر ندهید.");
    }
    if (membership.role === "owner") {
      throw httpError(409, "OWNER_ROLE_PROTECTED", "نقش مالک از این مسیر قابل تغییر نیست.");
    }
    const previousRole = membership.role;
    membership.role = role;
    membership.updatedAt = new Date().toISOString();
    appendOperationalAudit(db, context, "workspace_member_role_changed", "membership", membership.id, {
      previousRole,
      role
    });
    return { id: membership.id, userId: membership.userId, role, updatedAt: membership.updatedAt };
  });
}

async function getOperationalAudit(organizationId) {
  const db = await readDb();
  const records = (db.auditLog || []).filter(item => item.organizationId === organizationId);
  const integrity = verifyAuditLog(records, organizationId);
  return {
    integrity,
    entries: records.slice(-100).reverse().map(item => ({
      id: item.id,
      actorId: item.actorId,
      actorRole: item.actorRole,
      action: item.action,
      targetType: item.targetType,
      targetId: item.targetId,
      status: item.status,
      requestId: item.requestId,
      metadata: item.metadata,
      createdAt: item.createdAt,
      hash: item.hash
    }))
  };
}

async function getArtifacts(organizationId) {
  const db = await readDb();
  return (db.artifacts || [])
    .filter(item => item.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicArtifact);
}

async function downloadArtifact(auth, artifactId, req, res) {
  const db = await readDb();
  const artifact = db.artifacts.find(item => item.id === artifactId && item.organizationId === auth.organization.id);
  if (!artifact) throw httpError(404, "ARTIFACT_NOT_FOUND", "فایل داده پیدا نشد.");
  const content = await readArtifact(artifact);
  await transact(state => {
    appendOperationalAudit(state, requestContext(req, auth), "artifact_downloaded", "artifact", artifact.id);
  });
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="marginlift-${artifact.type}.csv"`
  });
  res.end(content);
}

async function removeArtifact(auth, artifactId, context) {
  let artifact;
  await transact(db => {
    artifact = db.artifacts.find(item => item.id === artifactId && item.organizationId === auth.organization.id);
    if (!artifact) throw httpError(404, "ARTIFACT_NOT_FOUND", "فایل داده پیدا نشد.");
    db.artifacts = db.artifacts.filter(item => item.id !== artifact.id);
    appendOperationalAudit(db, context, "artifact_deleted", "artifact", artifact.id, {
      type: artifact.type,
      sha256: artifact.sha256
    });
  });
  await deleteArtifact(artifact);
  return { id: artifact.id, deleted: true };
}

function publicArtifact(item) {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    sha256: item.sha256,
    sizeBytes: item.sizeBytes,
    encryption: item.encryption,
    keyVersion: item.keyVersion,
    createdBy: item.createdBy,
    createdAt: item.createdAt
  };
}

async function persistCsvArtifact(organizationId, context, type, name, csvText, createdAt) {
  return persistArtifact({
    id: createId("art"),
    organizationId,
    type,
    name: `${name}.csv`,
    content: csvText,
    createdBy: context.actorId,
    createdAt
  });
}

async function enqueueIntegrityCheck(organizationId, entityId) {
  await enqueueJob({
    organizationId,
    type: "evidence_integrity_check",
    payload: { entityId },
    dedupeKey: `evidence_integrity_check:${organizationId}:${entityId}`
  });
}

function requestContext(req, auth = null) {
  return {
    organizationId: auth?.organization?.id || null,
    actorId: auth?.user?.id || null,
    actorRole: auth?.membership?.role || null,
    requestId: req?.requestId || null
  };
}

function appendOperationalAudit(db, context, action, targetType, targetId, metadata = {}) {
  return appendAudit(db, {
    id: createId("aud"),
    organizationId: context.organizationId,
    actorId: context.actorId,
    actorRole: context.actorRole,
    requestId: context.requestId,
    action,
    targetType,
    targetId,
    metadata,
    createdAt: new Date().toISOString()
  });
}

async function trackEvent(req, body) {
  const eventName = cleanEventName(body.event || body.name);
  const properties = cleanProperties(body.properties || {});
  const session = await getRequestSession(req);
  const event = {
    id: createId("evt"),
    event: eventName,
    userId: session?.user.id || null,
    organizationId: session?.organization.id || null,
    path: cleanText(body.path || req.headers.referer || "").slice(0, 240),
    properties,
    createdAt: new Date().toISOString()
  };

  await transact(db => {
    db.events.push(event);
    if (db.events.length > 1000) {
      db.events = db.events.slice(-1000);
    }
  });

  return event;
}

function cleanEventName(value) {
  const eventName = cleanText(value);
  if (!/^[a-z][a-z0-9_]{2,48}$/.test(eventName)) {
    throw httpError(400, "INVALID_EVENT", "نام رویداد معتبر نیست.");
  }
  return eventName;
}

function cleanProperties(value) {
  const properties = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return properties;

  for (const [key, rawValue] of Object.entries(value).slice(0, 20)) {
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(key)) continue;
    if (typeof rawValue === "string") {
      properties[key] = rawValue.slice(0, 160);
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      properties[key] = rawValue;
    } else if (typeof rawValue === "boolean") {
      properties[key] = rawValue;
    }
  }

  return properties;
}

async function getEventSummary(organizationId) {
  const db = await readDb();
  const organizationEvents = db.events
    .filter(event => event.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const counts = organizationEvents.reduce((acc, event) => {
    acc[event.event] = (acc[event.event] || 0) + 1;
    return acc;
  }, {});

  const funnel = [
    { event: "app_loaded", labelFa: "بازدید داشبورد", count: counts.app_loaded || 0 },
    { event: "login_completed", labelFa: "ورود موفق", count: counts.login_completed || 0 },
    { event: "campaign_imported", labelFa: "تحلیل CSV", count: counts.campaign_imported || 0 },
    { event: "report_exported", labelFa: "خروجی گزارش", count: counts.report_exported || 0 }
  ];

  return {
    totalEvents: organizationEvents.length,
    funnel,
    latest: organizationEvents.slice(0, 8).map(event => ({
      id: event.id,
      event: event.event,
      labelFa: eventLabelFa(event.event),
      path: event.path,
      properties: event.properties,
      createdAt: event.createdAt
    }))
  };
}

function eventLabelFa(eventName) {
  const labels = {
    app_loaded: "بازدید داشبورد",
    signup_completed: "ثبت‌نام موفق",
    login_completed: "ورود موفق",
    campaign_imported: "تحلیل CSV",
    report_export_started: "شروع خروجی گزارش",
    report_exported: "خروجی گزارش"
  };
  return labels[eventName] || eventName;
}

function buildMarkdownReport(analysis, organization) {
  const campaign = analysis.campaign;
  const lines = [
    `# گزارش MarginLift برای ${organization.name}`,
    "",
    `کمپین: ${campaign.name}`,
    `تاریخ خروجی: ${new Date().toLocaleDateString("fa-IR")}`,
    "",
    "## خلاصه مدیریتی",
    "",
    `- بودجه قابل آزادسازی نسبت به baseline: ${formatMoney(campaign.nextSavings)}`,
    `- صرفه‌جویی نسبت به هزینه مشاهده‌شده: ${formatMoney(campaign.observedSavings || 0)}`,
    `- درآمد حفظ‌شده نسبت به baseline: ${formatPercent(campaign.revenuePreserved)}`,
    `- بهبود سود مشارکتی: ${formatPercent(campaign.contributionProfitLift ?? campaign.marginLift)}`,
    `- اعتماد تحلیل: ${formatPercent(campaign.confidence || 0)}`,
    `- بینش اصلی: ${analysis.insight || "داده برای تولید بینش کافی نیست."}`,
    "",
    "## تصمیم پیشنهادی برای سگمنت‌ها",
    "",
    "| سگمنت | کاربران | تصمیم | وضعیت | uplift | سود مشارکتی پیشنهادی | اعتبار | دلیل |",
    "| --- | ---: | --- | --- | ---: | ---: | --- | --- |",
    ...analysis.segments.map(segment => `| ${segment.nameFa} | ${formatNumber(segment.users)} | ${segment.actionFa} | ${segment.decisionStatusFa || "آزمایش بیشتر"} | ${formatNumber(segment.uplift)} واحد | ${formatMoney(segment.projectedContributionProfit || 0)} | ${segment.confidenceLevel || "متوسط"} | ${segment.reasonFa} |`),
    "",
    "## گاردریل‌ها",
    "",
    "| گاردریل | وضعیت | توضیح |",
    "| --- | --- | --- |",
    ...(analysis.guardrails || []).map(item => `| ${item.labelFa} | ${item.valueFa} | ${item.noteFa} |`),
    "",
    "## اقدام بعدی",
    "",
    "۱. این گزارش را با مدیر رشد، مالی و داده مرور کنید.",
    "۲. سگمنت‌هایی را که مشوق کمتر می‌گیرند تأیید کنید.",
    "۳. برای کمپین بعدی یک holdout کوچک طراحی کنید.",
    "۴. موفقیت را با هزینه مشوق به‌ازای هر سفارش افزایشی بسنجید.",
    "",
    "## محدودیت",
    "",
    "بدون کنترل‌گروه معتبر، نتیجه causal قطعی نیست و باید به‌عنوان تخمین تصمیم‌یار استفاده شود."
  ];
  return `${lines.join("\n")}\n`;
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (number >= 1000000000) return `${formatNumber(Math.round(number / 10000000) / 100)} میلیارد تومان`;
  return `${formatNumber(Math.round(number / 1000000))} میلیون تومان`;
}

function formatPercent(value) {
  return `${formatNumber(value)}٪`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(Number(value || 0));
}

function loadSampleAnalysis() {
  const rows = normalizeCampaignRows(parseCSV(fs.readFileSync(sampleCsvPath, "utf8")));
  return analyzeCampaign(rows, { name: "بازگشت با کش‌بک" });
}

function loadSampleCustomerAnalysis() {
  const rows = normalizeCustomerRows(parseCSV(fs.readFileSync(sampleCustomerCsvPath, "utf8")));
  return analyzeCustomers(rows, { name: "تحلیل مشتری‌محور نمونه" });
}

function loadSampleExperiment() {
  const csvText = fs.readFileSync(sampleCustomerCsvPath, "utf8");
  const rows = normalizeCustomerRows(parseCSV(csvText));
  const experiment = buildExperimentRecord({
    id: "demo_experiment",
    organizationId: null,
    customerAnalysisId: "demo_customer_analysis",
    name: "Experiment نمونه نمایشی",
    rows,
    csvText,
    assignmentMethod: "observed_historical",
    createdAt: new Date(0).toISOString()
  });
  experiment.status = "demo_only";
  return experiment;
}

function buildAudienceCsv(rows) {
  const headers = [
    "customer_id",
    "segment_fa",
    "recommended_action",
    "recommended_action_fa",
    "risk_score",
    "clv_toman",
    "expected_incremental_profit_toman",
    "reason_fa"
  ];
  const lines = [headers.join(",")];
  rows.forEach(row => {
    lines.push(headers.map(header => csvCell(row[header])).join(","));
  });
  return `${lines.join("\n")}\n`;
}

function buildAssignmentSourceCsv(rows) {
  const headers = ["customer_id", "treatment", "exposed", "revenue_90d_toman"];
  const lines = [headers.join(",")];
  rows.forEach(row => {
    lines.push([
      row.customerId,
      row.treatment,
      row.exposed,
      row.revenue90d
    ].map(csvCell).join(","));
  });
  return `${lines.join("\n")}\n`;
}

function buildExperimentAssignmentCsv(experiment) {
  const headers = ["experiment_id", "customer_id", "assigned_group", "exposed_at", "analysis_plan_version"];
  const planVersion = experiment.design?.analysisPlan?.version || "analysis-plan-v1";
  const lines = [headers.join(",")];
  (experiment.assignments || []).forEach(item => {
    lines.push([
      experiment.id,
      item.customerId,
      item.assignedGroup,
      "",
      planVersion
    ].map(csvCell).join(","));
  });
  return `${lines.join("\n")}\n`;
}

function normalizeHoldoutRate(value) {
  const parsed = Number(value);
  return parsed >= 0.1 && parsed <= 0.5 ? parsed : 0.2;
}

function buildPilotPackage(organization, campaignAnalysis, customerAnalysis, pilotState = {}) {
  const campaign = campaignAnalysis.campaign || {};
  const customerSummary = customerAnalysis.summary || {};
  const finance = customerAnalysis.finance || {};
  const experiment = customerAnalysis.experimentPlan || {};
  const readiness = pilotState.readiness || {};
  const snapshot = pilotState.savingsSnapshot || {};
  const pricing = pilotState.pricing || buildPricingPlans();
  const lines = [
    `# بسته پایلوت MarginLift برای ${organization.name}`,
    "",
    "ما جایگزین CRM نیستیم؛ ما تصمیم می‌گیریم کجا تخفیف بدهید و کجا ندهید.",
    "",
    "## هدف پایلوت",
    "",
    "کاهش هزینه مشوق و افزایش سود نگهداشت با تصمیم‌گیری بر اساس uplift، نه صرفا پیش‌بینی ریزش.",
    "",
    "## Readiness و Snapshot",
    "",
    `- وضعیت داده: ${readiness.statusFa || "در حال بررسی"}`,
    `- سطح ادعا: ${snapshot.claimLevelFa || "برآورد تاریخی"}`,
    `- پیام مدیریتی: ${snapshot.headlineFa || "تخفیف کمتر، سود بیشتر"}`,
    "",
    "## دامنه اجرا",
    "",
    `- واحد تصمیم: ${customerAnalysis.model?.unitFa || "customer_id"}`,
    `- تعریف نتیجه: خرید یا بازگشت در پنجره ${experiment.durationFa || "۳۰ روز"}`,
    `- مخاطب پیشنهادی: ${experiment.audienceFa || "مشتریان دارای ریسک و CLV مثبت"}`,
    `- کنترل پیشنهادی: ${experiment.recommendedHoldoutFa || "۱۰٪ کنترل تصادفی"}`,
    "",
    "## خروجی مورد انتظار",
    "",
    `- مشتریان قابل اقدام: ${formatNumber(customerSummary.targetableCustomers || 0)}`,
    `- سود افزایشی برآوردی: ${formatMoney(customerSummary.expectedIncrementalProfit || 0)} (${finance.claimLevelFa || "برآورد مشاهده‌ای"})`,
    `- مشوق ثبت‌شده قابل بررسی: ${formatMoney(finance.avoidableIncentiveCost || 0)}`,
    `- ROI برآورد تاریخی: ${formatNumber(finance.projectedRoi || 0)}x؛ مبنای تصمیم مقیاس نیست`,
    `- صرفه‌جویی سگمنتی baseline: ${formatMoney(campaign.nextSavings || 0)}`,
    `- تصمیم فعلی: ${snapshot.decisionFa || "طراحی پایلوت"}`,
    "",
    "## فرضیه آزمایش",
    "",
    experiment.hypothesisFa || "اگر مشوق‌ها فقط به مشتریان دارای سود افزایشی مثبت تخصیص داده شوند، سود نگهداشت بیشتر می‌شود.",
    "",
    "## معیارها",
    "",
    `- KPI اصلی: ${experiment.primaryMetricFa || "سود افزایشی به‌ازای مشتری هدف‌گیری‌شده"}`,
    ...((experiment.guardrailsFa || []).map(item => `- گاردریل: ${item}`)),
    "",
    "## تعهدات داده",
    "",
    "- ارسال customer_id ناشناس",
    "- ثبت treatment و زمان exposure",
    "- ثبت converted و revenue در outcome window",
    "- ارسال gross margin و هزینه کانال/مشوق",
    "",
    "## خروجی تحویلی",
    "",
    "- داشبورد Customer 360",
    "- فایل مخاطبان قابل ارسال به CRM",
    "- گزارش پایلوت برای مدیر رشد، مالی و مدیرعامل",
    "- تصمیم scale / iterate / stop پس از پایان پنجره outcome",
    "",
    "## پکیج‌های تجاری پیشنهادی",
    "",
    "| پکیج | مدل پرداخت | مناسب برای |",
    "| --- | --- | --- |",
    ...pricing.map(plan => `| ${plan.name} | ${plan.priceFa} | ${plan.bestForFa} |`)
  ];
  return `${lines.join("\n")}\n`;
}

function buildPricingPlans() {
  return [
    {
      key: "diagnostic",
      name: "Diagnostic",
      priceFa: "پرداخت ثابت برای تحلیل تاریخی",
      bestForFa: "تیمی که هنوز برای live holdout آماده نیست",
      promiseFa: "Data Readiness، Savings Snapshot و policy پیشنهادی"
    },
    {
      key: "live_pilot",
      name: "Live Pilot",
      priceFa: "پرداخت ثابت + طراحی holdout",
      bestForFa: "تیم Growth/CRM با کمپین نزدیک",
      promiseFa: "اجرای کنترل‌شده، outcome loop و readout مدیریتی"
    },
    {
      key: "success_plan",
      name: "Success Plan",
      priceFa: "ماهانه + درصدی از صرفه‌جویی تأییدشده",
      bestForFa: "کسب‌وکار پرتراکنش با بودجه مشوق تکرارشونده",
      promiseFa: "decision engine ماهانه و optimization مداوم"
    }
  ];
}

function formatNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(Number(value || 0));
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function extractCsvText(body) {
  const candidate = body.csvText || body.csv || body.content || "";
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate.value === "string") return candidate.value;
  return "";
}

async function seedDemoAccount() {
  if (isProduction) return;
  await transact(db => {
    const email = "growth@example.com";
    if (db.users.some(user => user.email === email)) return;

    const now = new Date().toISOString();
    const organization = {
      id: createId("org"),
      name: "پلتفرم مصرفی نمونه",
      plan: "pilot",
      retentionConfig: getRetentionPreset("super_app_packages"),
      createdAt: now,
      updatedAt: now
    };
    const user = {
      id: createId("usr"),
      email,
      name: "growth",
      passwordHash: hashPassword("demo1234"),
      createdAt: now,
      updatedAt: now
    };

    db.organizations.push(organization);
    db.users.push(user);
    db.memberships.push({
      id: createId("mem"),
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
      createdAt: now
    });
  });
}

function createSession(userId, now) {
  return {
    id: createId("ses"),
    userId,
    createdAt: now,
    expiresAt: new Date(Date.now() + sessionTtlMs).toISOString()
  };
}

function publicSession(session, user, organization, role) {
  return {
    id: session.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      accessExpiresAt: user.accessExpiresAt || null
    },
    organization: {
      id: organization.id,
      name: organization.name,
      plan: organization.plan
    },
    role,
    expiresAt: session.expiresAt
  };
}

function serveStatic(requestPath, req, res) {
  if (requestPath === "/fonts/marginlift-font.css") {
    const css = renderTypographyCss(inspectTypography(privateFontRoot));
    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : css);
    return;
  }
  if (requestPath === `/fonts/${FONT_FILENAME}`) {
    const typography = inspectTypography(privateFontRoot);
    if (!typography.ready) {
      sendJson(res, 404, { error: { code: "LICENSED_FONT_NOT_READY", message: "فونت لایسنس‌دار هنوز نصب نشده است." } });
      return;
    }
    serveFile(path.join(privateFontRoot, FONT_FILENAME), req, res, "font/woff2");
    return;
  }
  if (serveWebBuild(requestPath, req, res)) return;
  const routeAliases = {
    "/": "/sales.html",
    "/login": "/index.html",
    "/signup": "/index.html",
    "/docs/demo-user-guide-fa.md": "/docs/demo-user-guide-fa.txt"
  };
  const routePath = routeAliases[requestPath] || requestPath;
  const allowed = new Set([
    "/index.html",
    "/sales.html",
    "/privacy.html",
    "/terms.html",
    "/security.html",
    "/pilot-data-request.html",
    "/pilot.html",
    "/deck.html",
    "/submission.html",
    "/executive-report.html",
    "/styles.css",
    "/styles-v2.css",
    "/styles-v3.css",
    "/styles-v4.css",
    "/brand-mark.svg",
    "/executive-report-v3.css",
    "/motion.js",
    "/app.js",
    "/executive-report.js",
    "/marginlift-command-center.png",
    "/fonts/Estedad-Variable.woff2",
    "/fonts/Estedad-OFL.txt",
    "/fonts/Vazirmatn-Variable.woff2",
    "/fonts/OFL.txt",
    "/synthetic-campaign-data.csv",
    "/synthetic-customer-events.csv",
    "/synthetic-outcome-data.csv",
    "/synthetic-package-transactions.csv",
    "/synthetic-package-interventions.csv",
    "/synthetic-ecommerce-transactions.csv",
    "/synthetic-subscription-transactions.csv",
    "/retention-outcome-template.csv",
    "/README.md",
    "/docs/pilot-data-request.md",
    "/docs/pilot-experiment-brief.md",
    "/docs/pilot-proposal-template.md",
    "/docs/investor-source-of-truth.md",
    "/docs/investor-memo.md",
    "/docs/demo-day-talk-track.md",
    "/docs/demo-user-guide-fa.txt",
    "/docs/investor-q-and-a.md",
    "/docs/submission-readiness-checklist.md",
    "/docs/30-day-validation-roadmap.md",
    "/docs/pmf-metrics.md",
    "/docs/competitive-benchmark-digital-marketing.md",
    "/docs/analytics-tracking-plan.md",
    "/docs/product-hardening-1.md",
    "/docs/product-hardening-2.md",
    "/docs/product-reassessment-2026.md",
    "/docs/retention-decision-contract.md",
    "/docs/model-governance.md",
    "/docs/uplift-modeling-kaggle-review.md",
    "/docs/vm-deployment.md",
    "/vm-deployment.html"
  ]);

  if (!allowed.has(routePath)) {
    sendJson(res, 404, { error: { code: "NOT_FOUND", message: "فایل پیدا نشد." } });
    return;
  }

  const filePath = path.join(publicRoot, routePath.slice(1));
  let fileStat;
  try {
    fileStat = fs.statSync(filePath);
  } catch (error) {
    sendJson(res, 404, { error: { code: "NOT_FOUND", message: "فایل پیدا نشد." } });
    return;
  }
  if (!fileStat.isFile()) {
    sendJson(res, 404, { error: { code: "NOT_FOUND", message: "فایل پیدا نشد." } });
    return;
  }
  const extension = path.extname(filePath);
  serveFile(filePath, req, res, contentTypes[extension] || "application/octet-stream");
}

function serveWebBuild(requestPath, req, res) {
  if (!fs.existsSync(webDistRoot)) return false;

  if (requestPath.startsWith("/assets/")) {
    let assetName;
    try {
      assetName = decodeURIComponent(requestPath.slice("/assets/".length));
    } catch (error) {
      sendJson(res, 400, { error: { code: "INVALID_ASSET_PATH", message: "مسیر فایل معتبر نیست." } });
      return true;
    }
    const assetPath = path.resolve(webAssetRoot, assetName);
    if (!assetPath.startsWith(`${path.resolve(webAssetRoot)}${path.sep}`) || !fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
      sendJson(res, 404, { error: { code: "NOT_FOUND", message: "فایل پیدا نشد." } });
      return true;
    }
    serveFile(
      assetPath,
      req,
      res,
      contentTypes[path.extname(assetPath)] || "application/octet-stream",
      "public, max-age=31536000, immutable"
    );
    return true;
  }

  const publicRoutes = new Map([
    ["/", "index.html"],
    ["/sales", "index.html"],
    ["/login", "login.html"],
    ["/signup", "signup.html"],
    ["/pilot", "pilot.html"],
    ["/security", "security.html"],
    ["/privacy", "privacy.html"],
    ["/terms", "terms.html"],
    ["/deck", "deck.html"],
    ["/submission", "submission.html"],
    ["/pilot-data-request", "pilot-data-request.html"]
  ]);
  const htmlName = requestPath === "/app" || requestPath.startsWith("/app/")
    ? "app.html"
    : publicRoutes.get(requestPath);
  if (!htmlName) return false;
  const htmlPath = path.join(webDistRoot, htmlName);
  if (!fs.existsSync(htmlPath)) return false;
  serveFile(htmlPath, req, res, "text/html; charset=utf-8");
  return true;
}

function serveInternalUsability(requestPath, req, res) {
  if (requestPath === "/internal/usability-session.js") {
    serveFile(path.join(publicRoot, "src", "usability-session.js"), req, res, "application/javascript; charset=utf-8");
    return;
  }
  const source = fs.readFileSync(path.join(publicRoot, "docs", "usability-session-console-fa.html"), "utf8");
  const html = source.replace(
    '<script src="../src/usability-session.js"></script>',
    '<script src="/internal/usability-session.js"></script>'
  );
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(req.method === "HEAD" ? undefined : html);
}

function serveFile(filePath, req, res, contentType, cacheControl = "no-store") {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": cacheControl
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on("error", error => {
    log("error", "static_file_failed", { filePath, message: error.message });
    if (!res.headersSent) sendJson(res, 500, { error: { code: "STATIC_FILE_ERROR", message: "خواندن فایل انجام نشد." } });
    else res.destroy(error);
  });
  stream.pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    const contentLength = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      req.resume();
      reject(httpError(413, "PAYLOAD_TOO_LARGE", "حجم درخواست بیشتر از حد مجاز است."));
      return;
    }
    req.on("data", chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBodyBytes) {
        reject(httpError(413, "PAYLOAD_TOO_LARGE", "حجم درخواست بیش از حد مجاز است."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(httpError(400, "INVALID_JSON", "بدنه درخواست JSON معتبر نیست."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function addSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function enforceSameOrigin(req) {
  if (!isProduction || !appOrigin || !req.headers.origin) return;
  let origin;
  try {
    origin = new URL(req.headers.origin).origin;
  } catch (error) {
    throw httpError(403, "ORIGIN_NOT_ALLOWED", "مبدأ درخواست مجاز نیست.");
  }
  if (origin !== appOrigin) {
    throw httpError(403, "ORIGIN_NOT_ALLOWED", "مبدأ درخواست مجاز نیست.");
  }
}

function checkRateLimit(req, bucketName) {
  const ip = trustProxy
    ? (req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local")
    : (req.socket.remoteAddress || "local");
  const key = `${bucketName}:${ip}`;
  const now = Date.now();
  const policy = rateLimits[bucketName] || rateLimits.login;
  const windowMs = policy.windowMs;
  const entry = authAttempts.get(key) || { count: 0, resetAt: now + windowMs };
  if (entry.resetAt < now) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  authAttempts.set(key, entry);

  if (authAttempts.size > 5000) {
    for (const [storedKey, storedEntry] of authAttempts) {
      if (storedEntry.resetAt < now) authAttempts.delete(storedKey);
    }
  }

  if (entry.count > policy.max) {
    throw httpError(429, "RATE_LIMITED", "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید.");
  }
}

function validateEmailAndPassword(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, "VALIDATION_ERROR", "ایمیل کاری معتبر وارد کنید.");
  }
  if (password.length < 6) {
    throw httpError(400, "VALIDATION_ERROR", "رمز عبور باید حداقل ۶ کاراکتر باشد.");
  }
}

function normalizeEmail(email) {
  return cleanText(email).toLowerCase();
}

function cleanText(value) {
  return String(value || "").trim();
}

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

process.on("uncaughtException", error => {
  console.error(error);
});

process.on("unhandledRejection", error => {
  console.error(error);
});

module.exports = {
  handleRequest,
  start
};
