// Training-example store for the model feedback loop.
//
// Enterprise clients report labeled outcomes (the features they scored, which
// arm the customer was in, and whether they converted). We accumulate these as
// training examples; the retraining loop uses them once enough exist,
// otherwise it falls back to the synthetic DGP. Nothing here changes campaign
// behaviour — it only collects ground truth for the next model.

const FEATURE_NAMES = [
  "recency_days",
  "frequency",
  "monetary_value",
  "avg_order_gap_days",
  "discount_usage_rate",
  "channel_engagement_score",
  "tenure_days",
  "gross_margin_rate",
];

// Neutral defaults for features a client omits.
const FEATURE_DEFAULTS = {
  recency_days: 30, frequency: 1, monetary_value: 0, avg_order_gap_days: 0,
  discount_usage_rate: 0, channel_engagement_score: 0.5, tenure_days: 0, gross_margin_rate: 1.0,
};

const MAX_EXAMPLES = 200000; // bound growth; keep the most recent

function normalizeFeatures(raw) {
  const out = {};
  const f = raw || {};
  for (const name of FEATURE_NAMES) {
    const v = Number(f[name]);
    out[name] = Number.isFinite(v) ? v : FEATURE_DEFAULTS[name];
  }
  return out;
}

// Validate + shape a batch of reported results into training examples.
// Throws a 400 on structural problems.
function buildTrainingExamples(organizationId, campaignId, results) {
  if (!Array.isArray(results) || results.length === 0) {
    const err = new Error("results باید آرایه‌ای غیرخالی از نتایج برچسب‌خورده باشد.");
    err.status = 400; err.code = "INVALID_RESULTS";
    throw err;
  }
  const now = new Date().toISOString();
  return results.map(r => ({
    organizationId,
    campaignId: campaignId || null,
    cidHash: String((r && r.customer_id_hash) || ""),
    features: normalizeFeatures(r && r.features),
    w: (r && (r.treated === true || r.treated === 1 || r.w === 1)) ? 1 : 0,
    y: (r && (r.converted === true || r.converted === 1 || r.y === 1)) ? 1 : 0,
    ts: now,
  }));
}

// Append examples to the store, capped to the most recent MAX_EXAMPLES.
function appendExamples(db, examples) {
  if (!db.trainingExamples) db.trainingExamples = [];
  db.trainingExamples.push(...examples);
  if (db.trainingExamples.length > MAX_EXAMPLES) {
    db.trainingExamples = db.trainingExamples.slice(-MAX_EXAMPLES);
  }
  return db.trainingExamples.length;
}

// JSONL the trainer reads: one {features, w, y} per line.
function toJsonl(examples) {
  return (examples || [])
    .map(e => JSON.stringify({ features: e.features, w: e.w, y: e.y }))
    .join("\n");
}

module.exports = { buildTrainingExamples, appendExamples, toJsonl, FEATURE_NAMES, MAX_EXAMPLES };
