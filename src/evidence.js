const EVIDENCE_LEVELS = Object.freeze({
  none: Object.freeze({
    key: "none",
    rank: 0,
    labelFa: "بدون شواهد",
    claimFa: "هنوز داده‌ای برای تصمیم وجود ندارد."
  }),
  observational_estimate: Object.freeze({
    key: "observational_estimate",
    rank: 1,
    labelFa: "برآورد تاریخی",
    claimFa: "رابطه مشاهده‌شده است و اثر علّی را تأیید نمی‌کند."
  }),
  shadow_result: Object.freeze({
    key: "shadow_result",
    rank: 2,
    labelFa: "نتیجه Shadow",
    claimFa: "سیاست بدون تماس با مشتری از نظر عملیاتی بررسی شده است."
  }),
  pilot_estimate: Object.freeze({
    key: "pilot_estimate",
    rank: 3,
    labelFa: "برآورد پایلوت",
    claimFa: "Outcome دریافت شده، اما تمام گیت‌های اعتبار و مالی هنوز پاس نشده‌اند."
  }),
  verified_incremental: Object.freeze({
    key: "verified_incremental",
    rank: 4,
    labelFa: "اثر افزایشی تأییدشده",
    claimFa: "آزمایش سالم، پنجره بسته و تطبیق مالی تأیید شده است."
  })
});

const LEGACY_LEVELS = Object.freeze({
  no_evidence: "none",
  observational_baseline: "observational_estimate",
  observational_shadow: "shadow_result",
  pilot_observation: "pilot_estimate",
  randomized_estimate: "pilot_estimate"
});

function normalizeEvidenceLevel(value) {
  const key = LEGACY_LEVELS[value] || value;
  return EVIDENCE_LEVELS[key] ? key : "none";
}

function evidenceMeta(value) {
  return EVIDENCE_LEVELS[normalizeEvidenceLevel(value)];
}

function resolveRetentionEvidence({ analysis = null, shadowRun = null, outcome = null } = {}) {
  if (outcome) {
    return outcome.integrity?.decisionEligible === true &&
      outcome.summary?.financeVerificationStatus === "verified"
      ? "verified_incremental"
      : "pilot_estimate";
  }
  if (shadowRun) return "shadow_result";
  if (analysis) return "observational_estimate";
  return "none";
}

module.exports = {
  EVIDENCE_LEVELS,
  evidenceMeta,
  normalizeEvidenceLevel,
  resolveRetentionEvidence
};
