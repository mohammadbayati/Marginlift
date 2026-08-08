const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const { analyzeCampaign } = require("./analysis");
const { analyzeCustomers } = require("./customer-analysis");
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
const { readDb, transact } = require("./storage");
const { buildDecisionOverview } = require("./decision-engine");
const {
  analyzeOutcomeRows,
  buildPilotReadout,
  buildPilotWorkspace,
  buildReadinessAudit,
  buildSavingsSnapshot
} = require("./pilot");
const { appOrigin, assertProductionConfig, isProduction, maxBodyBytes, port: defaultPort, trustProxy } = require("./config");

const publicRoot = path.join(__dirname, "..");
const sampleCsvPath = path.join(publicRoot, "synthetic-campaign-data.csv");
const sampleCustomerCsvPath = path.join(publicRoot, "synthetic-customer-events.csv");
const sampleOutcomeCsvPath = path.join(publicRoot, "synthetic-outcome-data.csv");
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;
const authAttempts = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2"
};

function start(port = defaultPort) {
  assertProductionConfig();
  seedDemoAccount();
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`MarginLift is running on http://localhost:${port}`);
  });
  return server;
}

async function handleRequest(req, res) {
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

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "این مسیر فقط برای خواندن فایل‌های دمو است." } });
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
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
    sendJson(res, 200, { data: { status: "ok" } });
    return;
  }

  if (url.pathname === "/api/auth/signup" && req.method === "POST") {
    checkRateLimit(req, "signup");
    const body = await readJson(req);
    const result = signup(body);
    sendJson(res, 201, { data: result.session }, {
      "Set-Cookie": buildSessionCookie(result.session.id, Math.floor(sessionTtlMs / 1000))
    });
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    checkRateLimit(req, "login");
    const body = await readJson(req);
    const result = login(body);
    sendJson(res, 200, { data: result.session }, {
      "Set-Cookie": buildSessionCookie(result.session.id, Math.floor(sessionTtlMs / 1000))
    });
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const session = getRequestSession(req);
    if (session) {
      transact(db => {
        db.sessions = db.sessions.filter(item => item.id !== session.session.id);
      });
    }
    sendJson(res, 200, { data: { ok: true } }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (url.pathname === "/api/session" && req.method === "GET") {
    const session = getRequestSession(req);
    sendJson(res, 200, { data: session ? session.publicSession : null });
    return;
  }

  if (url.pathname === "/api/events" && req.method === "POST") {
    const body = await readJson(req);
    const event = trackEvent(req, body);
    sendJson(res, 201, { data: { id: event.id, accepted: true } });
    return;
  }

  const auth = requireSession(req);

  if (url.pathname === "/api/campaigns/current" && req.method === "GET") {
    sendJson(res, 200, { data: getCurrentCampaign(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/decision-engine/overview" && req.method === "GET") {
    const campaign = getCurrentCampaign(auth.organization.id);
    sendJson(res, 200, { data: buildDecisionOverview(campaign) });
    return;
  }

  if (url.pathname === "/api/customers/current" && req.method === "GET") {
    sendJson(res, 200, { data: getCurrentCustomerAnalysis(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/customers/import" && req.method === "POST") {
    const body = await readJson(req);
    const analysis = importCustomerAnalysis(auth.organization.id, body);
    sendJson(res, 201, { data: analysis });
    return;
  }

  if (url.pathname === "/api/experiments/plan" && req.method === "GET") {
    sendJson(res, 200, { data: getCurrentCustomerAnalysis(auth.organization.id).experimentPlan });
    return;
  }

  if (url.pathname === "/api/finance/summary" && req.method === "GET") {
    sendJson(res, 200, { data: getCurrentCustomerAnalysis(auth.organization.id).finance });
    return;
  }

  if (url.pathname === "/api/readiness/current" && req.method === "GET") {
    sendJson(res, 200, { data: getCurrentPilotState(auth.organization.id).readiness });
    return;
  }

  if (url.pathname === "/api/pilot/workspace" && req.method === "GET") {
    sendJson(res, 200, { data: getCurrentPilotState(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/outcomes/import" && req.method === "POST") {
    const body = await readJson(req);
    sendJson(res, 201, { data: importOutcomeAnalysis(auth.organization.id, body) });
    return;
  }

  if (url.pathname === "/api/pilot/readout.md" && req.method === "GET") {
    const state = getCurrentPilotState(auth.organization.id);
    const readout = buildPilotReadout(auth.organization, state.readiness, state.savingsSnapshot, state.workspace, state.outcome);
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-pilot-readout.md"'
    });
    res.end(readout);
    return;
  }

  if (url.pathname === "/api/exports/audience.csv" && req.method === "GET") {
    const analysis = getCurrentCustomerAnalysis(auth.organization.id);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="marginlift-audience-export.csv"'
    });
    res.end(buildAudienceCsv(analysis.channelExport || []));
    return;
  }

  if (url.pathname === "/api/events/summary" && req.method === "GET") {
    sendJson(res, 200, { data: getEventSummary(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/campaigns/import" && req.method === "POST") {
    const body = await readJson(req);
    const campaign = importCampaign(auth.organization.id, body);
    sendJson(res, 201, { data: campaign });
    return;
  }

  if (url.pathname === "/api/imports/preview" && req.method === "POST") {
    const body = await readJson(req);
    sendJson(res, 200, { data: previewCsvImport(body) });
    return;
  }

  if (url.pathname === "/api/imports/csv" && req.method === "POST") {
    const body = await readJson(req);
    sendJson(res, 201, { data: importCsvAnalysis(auth.organization.id, body) });
    return;
  }

  if (url.pathname === "/api/analyses/history" && req.method === "GET") {
    sendJson(res, 200, { data: getAnalysisHistory(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/pilot/package.md" && req.method === "GET") {
    const state = getCurrentPilotState(auth.organization.id);
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
    const analysis = getCurrentCampaign(auth.organization.id);
    const report = buildMarkdownReport(analysis, auth.organization);
    trackEvent(req, {
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

function signup(body) {
  const email = normalizeEmail(body.email);
  const submittedCompany = cleanText(body.companyName || body.company);
  const emailDomain = email.includes("@") ? email.split("@")[1].split(".")[0] : "";
  const companyName = submittedCompany || emailDomain || "فضای کاری جدید";
  const password = String(body.password || "");

  if (submittedCompany && submittedCompany.length < 2) {
    throw httpError(400, "VALIDATION_ERROR", "نام کسب‌وکار باید حداقل ۲ کاراکتر باشد.");
  }
  validateEmailAndPassword(email, password);
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

    return {
      session: publicSession(session, user, organization, "owner")
    };
  });
}

function login(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  validateEmailAndPassword(email, password);

  return transact(db => {
    const user = db.users.find(item => item.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw httpError(401, "INVALID_CREDENTIALS", "ایمیل یا رمز عبور درست نیست.");
    }

    const membership = db.memberships.find(item => item.userId === user.id);
    const organization = db.organizations.find(item => item.id === membership?.organizationId);
    if (!membership || !organization) {
      throw httpError(403, "NO_WORKSPACE", "برای این کاربر فضای کاری پیدا نشد.");
    }

    const session = createSession(user.id, new Date().toISOString());
    db.sessions.push(session);

    return {
      session: publicSession(session, user, organization, membership.role)
    };
  });
}

function getRequestSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const sessionId = verifySessionCookie(cookies[SESSION_COOKIE]);
  if (!sessionId) return null;

  const db = readDb();
  const session = db.sessions.find(item => item.id === sessionId);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;

  const user = db.users.find(item => item.id === session.userId);
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

function requireSession(req) {
  const session = getRequestSession(req);
  if (!session) {
    throw httpError(401, "AUTH_REQUIRED", "برای دسترسی به این بخش وارد شوید.");
  }
  return session;
}

function getCurrentCampaign(organizationId) {
  const db = readDb();
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

function importCampaign(organizationId, body) {
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

  transact(db => {
    db.campaigns.push(campaign);
  });

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

function importCsvAnalysis(organizationId, body) {
  const csvText = extractCsvText(body);
  const parsedRows = parseCSV(csvText);
  if (looksLikeCustomerRows(parsedRows)) {
    return {
      type: "customer",
      analysis: importCustomerAnalysis(organizationId, body)
    };
  }

  return {
    type: "campaign",
    analysis: importCampaign(organizationId, body)
  };
}

function getCurrentCustomerAnalysis(organizationId) {
  const db = readDb();
  const stored = db.customerAnalyses
    .filter(item => item.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  if (stored) {
    return {
      id: stored.id,
      isDemo: false,
      ...stored.analysis
    };
  }

  return {
    id: "demo_customer_analysis",
    isDemo: true,
    ...loadSampleCustomerAnalysis()
  };
}

function getCurrentOutcomeAnalysis(organizationId) {
  const db = readDb();
  const stored = db.outcomes
    .filter(item => item.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  if (stored) {
    return {
      id: stored.id,
      isDemo: false,
      ...stored.analysis
    };
  }

  return null;
}

function getCurrentPilotState(organizationId) {
  const campaign = getCurrentCampaign(organizationId);
  const customerAnalysis = getCurrentCustomerAnalysis(organizationId);
  const outcome = getCurrentOutcomeAnalysis(organizationId);
  const readiness = buildReadinessAudit(customerAnalysis, campaign, outcome);
  const savingsSnapshot = buildSavingsSnapshot(customerAnalysis, campaign, readiness, outcome);
  const workspace = buildPilotWorkspace(readiness, customerAnalysis, outcome);
  return {
    campaign,
    customerAnalysis,
    outcome,
    readiness,
    savingsSnapshot,
    workspace,
    pricing: buildPricingPlans()
  };
}

function importCustomerAnalysis(organizationId, body) {
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
  const analysis = analyzeCustomers(rows, { name });
  const record = {
    id: createId("cus"),
    organizationId,
    name,
    rowCount: rows.length,
    analysis,
    createdAt: new Date().toISOString()
  };

  transact(db => {
    db.customerAnalyses.push(record);
  });

  return {
    id: record.id,
    isDemo: false,
    ...analysis
  };
}

function importOutcomeAnalysis(organizationId, body) {
  const name = cleanText(body.name) || "نتیجه پایلوت واردشده";
  const csvText = extractCsvText(body);
  if (csvText.length < 20) {
    throw httpError(400, "CSV_REQUIRED", "فایل outcome معتبر ارسال نشده است.");
  }

  const rows = normalizeOutcomeRows(parseCSV(csvText));
  const customerAnalysis = getCurrentCustomerAnalysis(organizationId);
  const analysis = analyzeOutcomeRows(rows, customerAnalysis);
  const record = {
    id: createId("out"),
    organizationId,
    name,
    rowCount: rows.length,
    analysis,
    createdAt: new Date().toISOString()
  };

  transact(db => {
    db.outcomes.push(record);
  });

  return {
    id: record.id,
    isDemo: false,
    ...analysis
  };
}

function getAnalysisHistory(organizationId) {
  const db = readDb();
  const campaigns = db.campaigns
    .filter(item => item.organizationId === organizationId)
    .map(item => ({
      id: item.id,
      type: "campaign",
      typeFa: "کمپین سگمنتی",
      name: item.name,
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

function trackEvent(req, body) {
  const eventName = cleanEventName(body.event || body.name);
  const properties = cleanProperties(body.properties || {});
  const session = getRequestSession(req);
  const event = {
    id: createId("evt"),
    event: eventName,
    userId: session?.user.id || null,
    organizationId: session?.organization.id || null,
    path: cleanText(body.path || req.headers.referer || "").slice(0, 240),
    properties,
    createdAt: new Date().toISOString()
  };

  transact(db => {
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

function getEventSummary(organizationId) {
  const db = readDb();
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
    `- سود افزایشی مورد انتظار: ${formatMoney(customerSummary.expectedIncrementalProfit || 0)}`,
    `- هزینه قابل جلوگیری: ${formatMoney(finance.avoidableIncentiveCost || 0)}`,
    `- ROI پایلوت: ${formatNumber(finance.projectedRoi || 0)}x`,
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

function seedDemoAccount() {
  if (isProduction) return;
  transact(db => {
    const email = "growth@example.com";
    if (db.users.some(user => user.email === email)) return;

    const now = new Date().toISOString();
    const organization = {
      id: createId("org"),
      name: "پلتفرم مصرفی نمونه",
      plan: "pilot",
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
      name: user.name
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

function serveStatic(requestPath, res) {
  const routeAliases = {
    "/": "/sales.html",
    "/login": "/index.html",
    "/signup": "/index.html"
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
    "/README.md",
    "/docs/pilot-data-request.md",
    "/docs/pilot-experiment-brief.md",
    "/docs/pilot-proposal-template.md",
    "/docs/investor-source-of-truth.md",
    "/docs/investor-memo.md",
    "/docs/demo-day-talk-track.md",
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
    "/docs/uplift-modeling-kaggle-review.md",
    "/docs/vm-deployment.md",
    "/vm-deployment.html"
  ]);

  if (!allowed.has(routePath)) {
    sendJson(res, 404, { error: { code: "NOT_FOUND", message: "فایل پیدا نشد." } });
    return;
  }

  const filePath = path.join(publicRoot, routePath.slice(1));
  const extension = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
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
  const windowMs = 15 * 60 * 1000;
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

  if (entry.count > 30) {
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
