(function exposeUsabilitySession(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MarginLiftUsability = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createUsabilitySessionApi() {
  const ROLE_CODES = ["executive", "crm_growth", "data_finance"];
  const SESSION_MODES = ["moderated_remote", "moderated_in_person"];
  const SCORECARD_FIELDS = [
    "participant_id", "role", "session_date", "moderator_id", "session_mode", "duration_minutes",
    "device", "browser", "input_method", "recording_consent", "evidence_reference",
    "screen_reader_used", "screen_reader_name", "screen_reader_version", "screen_reader_pass",
    "task_1_seconds", "task_1_pass", "task_2_seconds", "task_2_pass", "task_3_seconds", "task_3_pass",
    "task_4_seconds", "task_4_pass", "task_5_seconds", "task_5_pass", "unassisted_completion_rate",
    "decision_under_90s", "evidence_interpretation_correct", "next_action_correct", "confidence_1_to_5",
    "sev1_count", "sev2_count", "sev3_count", "sev4_count", "retest_pass", "issue_log", "observation_notes"
  ];

  function buildSessionRecord(input) {
    const source = input || {};
    const issues = Array.isArray(source.issues) ? source.issues : [];
    const passes = [1, 2, 3, 4, 5].map(index => toBoolean(source[`task_${index}_pass`]));
    const taskTwoSeconds = toNumber(source.task_2_seconds);
    const record = {
      participant_id: clean(source.participant_id),
      role: clean(source.role).toLowerCase(),
      session_date: clean(source.session_date),
      moderator_id: clean(source.moderator_id),
      session_mode: clean(source.session_mode).toLowerCase(),
      duration_minutes: numberOrBlank(source.duration_minutes),
      device: clean(source.device),
      browser: clean(source.browser),
      input_method: clean(source.input_method),
      recording_consent: yesNo(source.recording_consent),
      evidence_reference: clean(source.evidence_reference),
      screen_reader_used: yesNo(source.screen_reader_used),
      screen_reader_name: clean(source.screen_reader_name),
      screen_reader_version: clean(source.screen_reader_version),
      screen_reader_pass: toBoolean(source.screen_reader_used) ? yesNo(source.screen_reader_pass) : "",
      evidence_interpretation_correct: yesNo(source.evidence_interpretation_correct),
      next_action_correct: yesNo(source.next_action_correct),
      confidence_1_to_5: numberOrBlank(source.confidence_1_to_5),
      retest_pass: source.retest_pass === "" || source.retest_pass == null ? "" : yesNo(source.retest_pass),
      issue_log: issues.length ? renderIssueLog(issues) : clean(source.issue_log),
      observation_notes: clean(source.observation_notes)
    };

    for (let index = 1; index <= 5; index += 1) {
      record[`task_${index}_seconds`] = numberOrBlank(source[`task_${index}_seconds`]);
      record[`task_${index}_pass`] = passes[index - 1] ? "yes" : "no";
    }

    record.unassisted_completion_rate = (passes.filter(Boolean).length / passes.length).toFixed(2);
    record.decision_under_90s = passes[1] && Number.isFinite(taskTwoSeconds) && taskTwoSeconds > 0 && taskTwoSeconds <= 90 ? "yes" : "no";
    for (let severity = 1; severity <= 4; severity += 1) {
      const issueCount = issues.length
        ? issues.filter(issue => Number(issue.severity) === severity && !toBoolean(issue.resolved)).length
        : toNumber(source[`sev${severity}_count`]);
      record[`sev${severity}_count`] = Number.isFinite(issueCount) ? issueCount : 0;
    }
    return record;
  }

  function validateSessionEvidence(record) {
    const failures = [];
    const participantId = clean(record.participant_id);
    if (!/^P\d{2,}$/i.test(participantId)) failures.push("شناسه شرکت‌کننده باید مانند P01 و بدون نام واقعی باشد");
    if (!ROLE_CODES.includes(clean(record.role).toLowerCase())) failures.push("نقش استاندارد جلسه انتخاب نشده است");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(record.session_date))) failures.push("تاریخ جلسه معتبر نیست");
    if (clean(record.moderator_id).length < 2) failures.push("شناسه مجری ثبت نشده است");
    if (!SESSION_MODES.includes(clean(record.session_mode).toLowerCase())) failures.push("شیوه برگزاری جلسه مشخص نیست");

    const duration = toNumber(record.duration_minutes);
    if (!Number.isFinite(duration) || duration < 15 || duration > 60) failures.push("مدت جلسه باید بین ۱۵ تا ۶۰ دقیقه باشد");
    if (!clean(record.device)) failures.push("دستگاه ثبت نشده است");
    if (!clean(record.browser)) failures.push("مرورگر ثبت نشده است");
    if (!clean(record.input_method)) failures.push("روش تعامل ثبت نشده است");
    if (!hasExplicitBoolean(record.recording_consent)) failures.push("رضایت یا عدم رضایت برای ضبط صریحاً ثبت نشده است");
    if (clean(record.evidence_reference).length < 3) failures.push("مرجع یادداشت یا مدرک جلسه ثبت نشده است");

    for (let index = 1; index <= 5; index += 1) {
      const seconds = toNumber(record[`task_${index}_seconds`]);
      if (!Number.isFinite(seconds) || seconds <= 0) failures.push(`زمان کار ${index} ثبت نشده است`);
      if (!hasExplicitBoolean(record[`task_${index}_pass`])) failures.push(`نتیجه کار ${index} صریحاً ثبت نشده است`);
    }

    const confidence = toNumber(record.confidence_1_to_5);
    if (!Number.isFinite(confidence) || confidence < 1 || confidence > 5) failures.push("اطمینان باید عددی بین ۱ تا ۵ باشد");
    if (!hasExplicitBoolean(record.evidence_interpretation_correct)) failures.push("تفسیر شواهد ثبت نشده است");
    if (!hasExplicitBoolean(record.next_action_correct)) failures.push("تشخیص اقدام بعدی ثبت نشده است");
    if (clean(record.observation_notes).length < 40) failures.push("یادداشت رفتاری باید حداقل ۴۰ نویسه و مبتنی بر مشاهده باشد");

    const unresolvedIssueCount = [1, 2, 3, 4].reduce((total, severity) => total + (toNumber(record[`sev${severity}_count`]) || 0), 0);
    const substantiveIssueLog = clean(record.issue_log)
      .replace(/I\d+\|S\d\|(open|resolved)\|/gi, "")
      .replace(/->/g, "")
      .trim();
    if (unresolvedIssueCount > 0 && substantiveIssueLog.length < 20) failures.push("شرح ایرادهای حل‌نشده و پیامد آن‌ها ثبت نشده است");

    if (toBoolean(record.screen_reader_used)) {
      if (!/^(narrator|nvda)$/i.test(clean(record.screen_reader_name))) failures.push("نام screen reader باید Narrator یا NVDA باشد");
      if (clean(record.screen_reader_version).length < 2) failures.push("نسخه screen reader ثبت نشده است");
      if (!toBoolean(record.screen_reader_pass)) failures.push("نتیجه آزمون screen reader پاس نشده است");
      if (!/(keyboard|کیبورد|assistive|کمکی)/i.test(clean(record.input_method))) failures.push("روش تعامل جلسه screen reader باید استفاده از کیبورد یا فناوری کمکی را ثبت کند");
    }
    return failures;
  }

  function sessionsToCsv(records) {
    const lines = [SCORECARD_FIELDS.join(",")];
    for (const record of records || []) {
      lines.push(SCORECARD_FIELDS.map(field => escapeCsv(record[field])).join(","));
    }
    return `\uFEFF${lines.join("\r\n")}\r\n`;
  }

  function escapeCsv(value) {
    const text = String(value == null ? "" : value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function renderIssueLog(issues) {
    return issues.map((issue, index) => {
      const state = toBoolean(issue.resolved) ? "resolved" : "open";
      return `I${String(index + 1).padStart(2, "0")}|S${Number(issue.severity) || 4}|${state}|${clean(issue.observation)} -> ${clean(issue.impact)}`;
    }).join("\n");
  }

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function hasExplicitBoolean(value) {
    const normalized = clean(value).toLowerCase();
    return ["1", "0", "true", "false", "yes", "no", "pass", "fail", "بله", "خیر", "پاس", "رد"].includes(normalized);
  }

  function toBoolean(value) {
    return ["1", "true", "yes", "pass", "passed", "بله", "پاس"].includes(clean(value).toLowerCase());
  }

  function toNumber(value) {
    const normalized = clean(value)
      .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[%٪]/g, "");
    if (!normalized) return NaN;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
  }

  function numberOrBlank(value) {
    const number = toNumber(value);
    return Number.isFinite(number) ? number : "";
  }

  function yesNo(value) {
    return toBoolean(value) ? "yes" : "no";
  }

  return {
    ROLE_CODES,
    SESSION_MODES,
    SCORECARD_FIELDS,
    buildSessionRecord,
    validateSessionEvidence,
    sessionsToCsv,
    toBoolean,
    toNumber
  };
});
