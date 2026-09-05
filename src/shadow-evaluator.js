const http = require("http");
const { shadowScorerUrl } = require("./config");
const { log } = require("./observability");
const { withScorerAuthHeaders } = require("./scorer-auth");

const SCORER_TIMEOUT_MS = 5000;

function callScorer(audiencePayload) {
  const url = new URL("/api/v1/shadow/score", shadowScorerUrl);
  const body = JSON.stringify(audiencePayload);

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: "POST",
      headers: withScorerAuthHeaders({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }),
      timeout: SCORER_TIMEOUT_MS,
    }, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Scorer returned ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON from scorer")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Scorer timeout")); });
    req.end(body);
  });
}

async function evaluateShadow(organizationId, campaignId, audience) {
  const startTime = Date.now();

  const scorerResult = await callScorer({
    organization_id: organizationId,
    campaign_id: campaignId || null,
    audience,
  });

  const latencyMs = Date.now() - startTime;

  const shadowLog = {
    evaluationId: scorerResult.evaluation_id,
    organizationId,
    campaignId: campaignId || null,
    timestamp: new Date().toISOString(),
    scoredCount: scorerResult.scored_count,
    wasteCount: scorerResult.waste_count,
    wasteBudget: scorerResult.waste_budget,
    latencyMs,
    decisions: scorerResult.decisions,
  };

  log("info", "shadow_evaluation_complete", {
    evaluationId: shadowLog.evaluationId,
    organizationId,
    scoredCount: shadowLog.scoredCount,
    wasteCount: shadowLog.wasteCount,
    wasteBudget: shadowLog.wasteBudget,
    latencyMs,
  });

  return { shadowLog, scorerResult };
}

function generateBudgetWasteReport(shadowLogs) {
  if (!shadowLogs || shadowLogs.length === 0) {
    return {
      totalEvaluations: 0,
      totalCustomersScored: 0,
      totalWasteCustomers: 0,
      totalWasteBudget: 0,
      sureThingWaste: 0,
      sleepingDogWaste: 0,
      sureThingCount: 0,
      sleepingDogCount: 0,
      wasteRate: 0,
      recommendations: [],
      generatedAt: new Date().toISOString(),
    };
  }

  let sureThingCount = 0;
  let sleepingDogCount = 0;
  let sureThingWaste = 0;
  let sleepingDogWaste = 0;
  let totalScored = 0;

  for (const entry of shadowLogs) {
    totalScored += entry.scoredCount || 0;
    for (const d of (entry.decisions || [])) {
      if (d.segment === "sure_thing") {
        sureThingCount++;
        sureThingWaste += Math.abs(d.expected_incremental_profit || 0);
      } else if (d.segment === "sleeping_dog") {
        sleepingDogCount++;
        sleepingDogWaste += Math.abs(d.expected_incremental_profit || 0);
      }
    }
  }

  const totalWaste = sureThingWaste + sleepingDogWaste;
  const wasteCount = sureThingCount + sleepingDogCount;
  const wasteRate = totalScored > 0 ? wasteCount / totalScored : 0;

  const recommendations = [];
  if (sureThingCount > 0) {
    recommendations.push({
      type: "sure_thing",
      typeFa: "خریداران حتمی",
      message: `${sureThingCount} مشتری بدون نیاز به مشوق خرید می‌کنند. حذف آن‌ها از کمپین ${Math.round(sureThingWaste).toLocaleString()} تومان صرفه‌جویی ایجاد می‌کند.`,
      count: sureThingCount,
      waste: Math.round(sureThingWaste),
    });
  }
  if (sleepingDogCount > 0) {
    recommendations.push({
      type: "sleeping_dog",
      typeFa: "واکنش منفی",
      message: `${sleepingDogCount} مشتری با دریافت مشوق احتمال خرید کمتری دارند. ارسال پیام به آن‌ها ${Math.round(sleepingDogWaste).toLocaleString()} تومان هدررفت ایجاد کرده است.`,
      count: sleepingDogCount,
      waste: Math.round(sleepingDogWaste),
    });
  }

  return {
    totalEvaluations: shadowLogs.length,
    totalCustomersScored: totalScored,
    totalWasteCustomers: wasteCount,
    totalWasteBudget: Math.round(totalWaste),
    sureThingWaste: Math.round(sureThingWaste),
    sleepingDogWaste: Math.round(sleepingDogWaste),
    sureThingCount,
    sleepingDogCount,
    wasteRate: Math.round(wasteRate * 10000) / 100,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { callScorer, evaluateShadow, generateBudgetWasteReport };
