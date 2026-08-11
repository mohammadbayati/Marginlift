const REQUIRED_ROLES = ["executive", "crm_growth", "data_finance"];
const { validateSessionEvidence } = require("./usability-session");

function evaluateUsabilitySessions(rows) {
  const sessions = (rows || []).filter(row => String(row.participant_id || "").trim() && String(row.session_date || "").trim());
  const failures = [];
  const roleSet = new Set(sessions.map(row => String(row.role || "").trim().toLowerCase()));
  const participantSet = new Set(sessions.map(row => String(row.participant_id || "").trim().toLowerCase()));

  if (sessions.length < 3 || participantSet.size < 3) failures.push("حداقل سه جلسه واقعی و مستقل ثبت نشده است.");
  const missingRoles = REQUIRED_ROLES.filter(role => !roleSet.has(role));
  if (missingRoles.length) failures.push(`نقش‌های الزامی ثبت نشده‌اند: ${missingRoles.join(", ")}`);

  const requiredTaskFields = ["task_1_pass", "task_2_pass", "task_3_pass", "task_4_pass"];
  sessions.forEach(session => {
    const id = session.participant_id;
    const evidenceFailures = validateSessionEvidence(session);
    if (evidenceFailures.length) failures.push(`${id}: سند جلسه ناقص است: ${evidenceFailures.join("؛ ")}.`);
    if (requiredTaskFields.some(field => !toBoolean(session[field]))) failures.push(`${id}: یکی از کارهای اصلی ۱ تا ۴ بدون کمک کامل نشده است.`);
    if (!toBoolean(session.decision_under_90s)) failures.push(`${id}: تصمیم اصلی در کمتر از ۹۰ ثانیه پیدا نشده است.`);
    if (!toBoolean(session.evidence_interpretation_correct)) failures.push(`${id}: نوع شواهد درست تفسیر نشده است.`);
    if (!toBoolean(session.next_action_correct)) failures.push(`${id}: اقدام بعدی درست پیدا نشده است.`);
    const derivedCompletionRate = [1, 2, 3, 4, 5].filter(index => toBoolean(session[`task_${index}_pass`])).length / 5;
    if (derivedCompletionRate < 0.8) failures.push(`${id}: نرخ تکمیل بدون کمک کمتر از ۸۰٪ است.`);
    const decisionSeconds = toNumber(session.task_2_seconds);
    if (!Number.isFinite(decisionSeconds) || decisionSeconds > 90) failures.push(`${id}: زمان واقعی تصمیم مدیریتی بیشتر از ۹۰ ثانیه است.`);
  });

  const confidenceValues = sessions.map(session => toNumber(session.confidence_1_to_5)).filter(Number.isFinite);
  const averageConfidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;
  if (confidenceValues.length !== sessions.length || averageConfidence < 4) failures.push("میانگین اطمینان معتبر کمتر از ۴ از ۵ است.");

  const unresolvedSev1 = sum(sessions, "sev1_count");
  const unresolvedSev2 = sum(sessions, "sev2_count");
  if (unresolvedSev1 > 0) failures.push(`${unresolvedSev1} ایراد حل‌نشده Severity 1 باقی مانده است.`);
  if (unresolvedSev2 > 0) failures.push(`${unresolvedSev2} ایراد حل‌نشده Severity 2 باقی مانده است.`);

  const screenReaderSessions = sessions.filter(session => toBoolean(session.screen_reader_used));
  if (!screenReaderSessions.length) failures.push("هیچ جلسه واقعی با Narrator یا NVDA ثبت نشده است.");
  if (screenReaderSessions.some(session => !toBoolean(session.screen_reader_pass))) failures.push("آزمون واقعی screen reader پاس نشده است.");

  return {
    status: failures.length ? "not_ready" : "pass",
    sessionCount: sessions.length,
    participantCount: participantSet.size,
    rolesCovered: REQUIRED_ROLES.filter(role => roleSet.has(role)),
    screenReaderSessionCount: screenReaderSessions.length,
    averageConfidence: Number(averageConfidence.toFixed(2)),
    unresolvedSev1,
    unresolvedSev2,
    failures
  };
}

function renderUsabilityEvaluation(result) {
  const failureLines = result.failures.length ? result.failures.map(item => `- ${item}`).join("\n") : "- هیچ گیت بازی باقی نمانده است.";
  return `# ارزیابی تست کاربری MarginLift\n\n- وضعیت: ${result.status === "pass" ? "پاس" : "آماده تأیید نیست"}\n- جلسه ثبت‌شده: ${result.sessionCount}\n- شرکت‌کننده مستقل: ${result.participantCount}\n- جلسه با screen reader: ${result.screenReaderSessionCount}\n- میانگین اطمینان: ${result.averageConfidence} از ۵\n- Severity 1 حل‌نشده: ${result.unresolvedSev1}\n- Severity 2 حل‌نشده: ${result.unresolvedSev2}\n\n## گیت‌های باز\n\n${failureLines}\n`;
}

function toBoolean(value) {
  return ["1", "true", "yes", "pass", "passed", "بله", "پاس"].includes(String(value || "").trim().toLowerCase());
}

function toNumber(value) {
  const normalized = String(value ?? "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[%٪]/g, "")
    .trim();
  if (!normalized) return NaN;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}

function toRate(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return 0;
  return number > 1 ? number / 100 : number;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (toNumber(row[field]) || 0), 0);
}

module.exports = { evaluateUsabilitySessions, renderUsabilityEvaluation };
