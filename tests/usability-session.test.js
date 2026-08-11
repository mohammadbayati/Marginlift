const assert = require("assert");
const { parseCSV } = require("../src/csv");

const {
  SCORECARD_FIELDS,
  buildSessionRecord,
  sessionsToCsv,
  validateSessionEvidence
} = require("../src/usability-session");

function validInput() {
  return {
    participant_id: "P01",
    role: "executive",
    session_date: "2026-08-12",
    moderator_id: "M01",
    session_mode: "moderated_remote",
    duration_minutes: "26",
    device: "Windows laptop",
    browser: "Chrome 140",
    input_method: "keyboard and mouse",
    recording_consent: "yes",
    evidence_reference: "local/session-P01.mp4",
    screen_reader_used: "no",
    task_1_seconds: 54,
    task_1_pass: true,
    task_2_seconds: 72,
    task_2_pass: true,
    task_3_seconds: 61,
    task_3_pass: true,
    task_4_seconds: 48,
    task_4_pass: true,
    task_5_seconds: 66,
    task_5_pass: false,
    evidence_interpretation_correct: true,
    next_action_correct: true,
    confidence_1_to_5: 4,
    observation_notes: "شرکت‌کننده تصمیم بازبینی را بدون کمک پیدا کرد و دلیل مالی را با صدای بلند توضیح داد.",
    issues: [
      { severity: 3, resolved: false, observation: "کاربر روی برچسب شواهد مکث کرد", impact: "ممکن بود برآورد را قطعی تفسیر کند" },
      { severity: 2, resolved: true, observation: "اقدام بعدی ابتدا دیده نشد", impact: "تصمیم اجرای پایلوت عقب می‌افتاد" }
    ]
  };
}

const record = buildSessionRecord(validInput());
assert.strictEqual(record.unassisted_completion_rate, "0.80");
assert.strictEqual(record.decision_under_90s, "yes");
assert.strictEqual(record.sev2_count, 0);
assert.strictEqual(record.sev3_count, 1);
assert.ok(record.issue_log.includes("I01|S3|open"));
assert.deepStrictEqual(validateSessionEvidence(record), []);

const slowDecision = buildSessionRecord({ ...validInput(), task_2_seconds: 91 });
assert.strictEqual(slowDecision.decision_under_90s, "no");

const screenReaderMissingEvidence = buildSessionRecord({ ...validInput(), screen_reader_used: true, screen_reader_pass: true });
const screenReaderFailures = validateSessionEvidence(screenReaderMissingEvidence);
assert.ok(screenReaderFailures.some(failure => failure.includes("Narrator")));
assert.ok(screenReaderFailures.some(failure => failure.includes("نسخه")));

const csv = sessionsToCsv([record]);
assert.ok(csv.startsWith("\uFEFF"));
assert.ok(csv.includes(SCORECARD_FIELDS.join(",")));
assert.ok(csv.includes("شرکت‌کننده تصمیم بازبینی"));
const roundTrip = parseCSV(csv);
assert.strictEqual(roundTrip.length, 1);
assert.strictEqual(roundTrip[0].participant_id, "P01");
assert.strictEqual(roundTrip[0].issue_log, record.issue_log);
assert.strictEqual(roundTrip[0].observation_notes, record.observation_notes);

console.log("usability-session.test.js passed");
