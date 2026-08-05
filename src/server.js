const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const { analyzeCampaign } = require("./analysis");
const {
  SESSION_COOKIE,
  buildSessionCookie,
  clearSessionCookie,
  createId,
  hashPassword,
  parseCookies,
  verifyPassword
} = require("./auth");
const { normalizeCampaignRows, parseCSV } = require("./csv");
const { readDb, transact } = require("./storage");

const publicRoot = path.join(__dirname, "..");
const sampleCsvPath = path.join(publicRoot, "synthetic-campaign-data.csv");
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;
const maxBodyBytes = 2 * 1024 * 1024;
const authAttempts = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function start(port = Number(process.env.PORT || 3000)) {
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
  if (url.pathname === "/api/health" && req.method === "GET") {
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

  const auth = requireSession(req);

  if (url.pathname === "/api/campaigns/current" && req.method === "GET") {
    sendJson(res, 200, { data: getCurrentCampaign(auth.organization.id) });
    return;
  }

  if (url.pathname === "/api/campaigns/import" && req.method === "POST") {
    const body = await readJson(req);
    const campaign = importCampaign(auth.organization.id, body);
    sendJson(res, 201, { data: campaign });
    return;
  }

  sendJson(res, 404, { error: { code: "NOT_FOUND", message: "مسیر API پیدا نشد." } });
}

function signup(body) {
  const companyName = cleanText(body.companyName || body.company);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!companyName || companyName.length < 2) {
    throw httpError(400, "VALIDATION_ERROR", "نام کسب‌وکار را وارد کنید.");
  }
  validateEmailAndPassword(email, password);

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
  const sessionId = cookies[SESSION_COOKIE];
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

function loadSampleAnalysis() {
  const rows = normalizeCampaignRows(parseCSV(fs.readFileSync(sampleCsvPath, "utf8")));
  return analyzeCampaign(rows, { name: "بازگشت با کش‌بک" });
}

function extractCsvText(body) {
  const candidate = body.csvText || body.csv || body.content || "";
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate.value === "string") return candidate.value;
  return "";
}

function seedDemoAccount() {
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
  const routePath = requestPath === "/" ? "/index.html" : requestPath;
  const allowed = new Set([
    "/index.html",
    "/styles.css",
    "/app.js",
    "/synthetic-campaign-data.csv",
    "/README.md"
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
}

function checkRateLimit(req, bucketName) {
  const ip = req.socket.remoteAddress || "local";
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
