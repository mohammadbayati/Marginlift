const crypto = require("crypto");
const { isProduction, jwtSecret, sessionSecret } = require("./config");

const SESSION_COOKIE = "marginlift_session";
const HASH_ITERATIONS = 120000;
const HASH_LENGTH = 32;
const HASH_DIGEST = "sha256";

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST)
    .toString("hex");
  return `pbkdf2_${HASH_DIGEST}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, iterationsRaw, salt, expected] = String(storedHash).split("$");
  if (algorithm !== `pbkdf2_${HASH_DIGEST}` || !iterationsRaw || !salt || !expected) {
    return false;
  }

  const actual = crypto
    .pbkdf2Sync(password, salt, Number(iterationsRaw), HASH_LENGTH, HASH_DIGEST)
    .toString("hex");

  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      try {
        const key = decodeURIComponent(part.slice(0, index));
        const value = decodeURIComponent(part.slice(index + 1));
        cookies[key] = value;
      } catch (error) {
        return cookies;
      }
      return cookies;
    }, {});
}

function signSessionId(sessionId) {
  return crypto.createHmac("sha256", sessionSecret).update(sessionId).digest("base64url");
}

function verifySessionCookie(value) {
  const [sessionId, signature] = String(value || "").split(".");
  if (!sessionId || !signature) return null;

  const expected = signSessionId(sessionId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }
  return sessionId;
}

function buildSessionCookie(sessionId, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(`${sessionId}.${signSessionId(sessionId)}`)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearSessionCookie() {
  const secure = isProduction ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function base64UrlDecode(str) {
  const padded = str + "=".repeat((4 - str.length % 4) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function verifyJwt(token) {
  if (!jwtSecret || jwtSecret.length < 16) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;

  const expectedSig = crypto
    .createHmac("sha256", jwtSecret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64url");

  const sigBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function signJwt(payload, expiresInSeconds = 86400) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds })).toString("base64url");
  const signature = crypto.createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

module.exports = {
  SESSION_COOKIE,
  buildSessionCookie,
  clearSessionCookie,
  createId,
  hashPassword,
  parseCookies,
  signJwt,
  verifyJwt,
  verifyPassword,
  verifySessionCookie
};
