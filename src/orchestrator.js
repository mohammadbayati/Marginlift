const http = require("http");
const { shadowScorerUrl } = require("./config");
const { log } = require("./observability");

const SCORER_TIMEOUT_MS = 5000;

function callOrchestrator(payload) {
  const url = new URL("/api/v1/orchestrate/decide", shadowScorerUrl);
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: SCORER_TIMEOUT_MS,
    }, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Orchestrator returned ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON from orchestrator")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Orchestrator timeout")); });
    req.end(body);
  });
}

// Pure latching-breaker decision. A latch that is already open keeps SENDs
// halted regardless of the current reading; a fresh drift breach both halts
// and trips a new latch (which stays open until an owner resets it).
function evaluateCircuitBreaker({ latchOpen = false, causalDrift = 0, driftThreshold = 0.2 }) {
  if (latchOpen) return { halted: true, reason: "latched", tripped: false };
  if (causalDrift > driftThreshold) return { halted: true, reason: "causal_drift_exceeded", tripped: true };
  return { halted: false, reason: null, tripped: false };
}

async function orchestrateCampaign(organizationId, campaignId, audience, options = {}) {
  const { causalDrift = 0, driftThreshold = 0.2, forceHalt = false } = options;
  const startTime = Date.now();

  const result = await callOrchestrator({
    organization_id: organizationId,
    campaign_id: campaignId || null,
    audience,
    causal_drift: causalDrift,
    drift_threshold: driftThreshold,
    force_halt: forceHalt,
  });

  const latencyMs = Date.now() - startTime;

  const orchestrationLog = {
    orchestrationId: result.orchestration_id,
    organizationId,
    campaignId: campaignId || null,
    timestamp: new Date().toISOString(),
    halted: result.halted,
    haltReason: result.halt_reason,
    causalDrift: result.causal_drift,
    driftThreshold: result.drift_threshold,
    scoredCount: result.scored_count,
    sendCount: result.send_count,
    dropCount: result.drop_count,
    savedBudget: result.saved_budget,
    netIncrementalProfit: result.net_incremental_profit,
    latencyMs,
    decisions: result.decisions,
  };

  log("info", "orchestration_complete", {
    orchestrationId: orchestrationLog.orchestrationId,
    organizationId,
    halted: orchestrationLog.halted,
    sendCount: orchestrationLog.sendCount,
    dropCount: orchestrationLog.dropCount,
    latencyMs,
  });

  return { orchestrationLog, result };
}

module.exports = { orchestrateCampaign, evaluateCircuitBreaker, callOrchestrator };
