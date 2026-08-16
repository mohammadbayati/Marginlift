// PII guard for the enterprise API boundary.
//
// The API contract requires each audience member to arrive as an opaque,
// pre-hashed `customer_id_hash`. A raw email address or phone number reaching
// this boundary is a data-handling violation: we refuse it rather than
// silently hashing it (silent hashing would corrupt the client's join keys and
// hide the fact that raw PII left their systems). Telecom/Fintech Zero-Trust
// contracts require this hard stop.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// True when the WHOLE value looks like a raw identifier rather than a hash.
// A hex/base64 hash contains letters, so an all-digit 8–15 char value (after
// stripping phone separators) or an @-bearing string is the red flag; a real
// sha256/base64 id is not caught.
function looksLikeRawPii(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (EMAIL_RE.test(v)) return true;
  const digits = v.replace(/^\+/, "").replace(/[\s\-()]/g, "");
  if (/^\d{8,15}$/.test(digits)) return true;
  return false;
}

// Throws a 400 PII_DETECTED error (shape understood by the server's error
// handler) when any customer id looks like raw PII.
function assertNoRawPii(audience) {
  if (!Array.isArray(audience)) return;
  for (let i = 0; i < audience.length; i++) {
    const id = audience[i] && audience[i].customer_id_hash;
    if (looksLikeRawPii(id)) {
      const err = new Error("شناسه مشتری باید هش‌شده باشد؛ ایمیل یا شماره خام پذیرفته نمی‌شود.");
      err.status = 400;
      err.code = "PII_DETECTED";
      throw err;
    }
  }
}

module.exports = { assertNoRawPii, looksLikeRawPii };
