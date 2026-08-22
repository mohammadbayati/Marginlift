const {
  isProduction,
  scorerInternalToken,
  scorerInternalTokenId
} = require("./config");

const SCORER_AUTH_HEADER = "X-MarginLift-Internal-Token";
const SCORER_AUTH_KEY_ID_HEADER = "X-MarginLift-Internal-Key-Id";

function buildScorerAuthHeaders(options = {}) {
  const token = options.token !== undefined ? options.token : scorerInternalToken;
  const keyId = options.keyId !== undefined ? options.keyId : scorerInternalTokenId;
  if (!token) return {};

  const headers = { [SCORER_AUTH_HEADER]: token };
  if (keyId) headers[SCORER_AUTH_KEY_ID_HEADER] = keyId;
  return headers;
}

function withScorerAuthHeaders(headers = {}, options = {}) {
  return { ...headers, ...buildScorerAuthHeaders(options) };
}

function assertScorerAuthConfigured() {
  if (isProduction && !scorerInternalToken) {
    throw new Error("SCORER_INTERNAL_TOKEN must be set in production.");
  }
}

module.exports = {
  SCORER_AUTH_HEADER,
  SCORER_AUTH_KEY_ID_HEADER,
  assertScorerAuthConfigured,
  buildScorerAuthHeaders,
  withScorerAuthHeaders
};
