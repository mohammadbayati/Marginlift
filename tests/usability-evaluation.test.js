const assert = require("assert");

const { evaluateUsabilitySessions } = require("../src/usability-evaluation");

function passingSession(id, role, screenReader = false) {
  return {
    participant_id: id,
    role,
    session_date: "2026-08-12",
    moderator_id: "M01",
    session_mode: "moderated_remote",
    duration_minutes: "25",
    device: "Windows laptop",
    browser: "Chrome 140",
    input_method: screenReader ? "keyboard and assistive technology" : "keyboard and mouse",
    recording_consent: "yes",
    evidence_reference: `local/${id}-session-notes.md`,
    screen_reader_name: screenReader ? "NVDA" : "",
    screen_reader_version: screenReader ? "2025.3" : "",
    task_1_pass: "yes",
    task_1_seconds: "45",
    task_2_pass: "yes",
    task_2_seconds: "70",
    task_3_pass: "yes",
    task_3_seconds: "55",
    task_4_pass: "yes",
    task_4_seconds: "50",
    task_5_pass: "yes",
    task_5_seconds: "60",
    unassisted_completion_rate: "100%",
    decision_under_90s: "yes",
    evidence_interpretation_correct: "yes",
    next_action_correct: "yes",
    confidence_1_to_5: "4",
    sev1_count: "0",
    sev2_count: "0",
    screen_reader_used: screenReader ? "yes" : "no",
    screen_reader_pass: screenReader ? "yes" : "",
    observation_notes: "شرکت‌کننده مسیر تصمیم را بدون راهنمایی طی کرد و نوع شواهد و اقدام بعدی را درست توضیح داد."
  };
}

const passing = evaluateUsabilitySessions([
  passingSession("P01", "executive"),
  passingSession("P02", "crm_growth", true),
  passingSession("P03", "data_finance")
]);
assert.strictEqual(passing.status, "pass");
assert.strictEqual(passing.screenReaderSessionCount, 1);

const incomplete = evaluateUsabilitySessions([
  passingSession("P01", "executive"),
  { ...passingSession("P02", "crm_growth"), evidence_interpretation_correct: "no", sev2_count: "1" }
]);
assert.strictEqual(incomplete.status, "not_ready");
assert.ok(incomplete.failures.some(item => item.includes("سه جلسه")));
assert.ok(incomplete.failures.some(item => item.includes("نوع شواهد")));
assert.ok(incomplete.failures.some(item => item.includes("Severity 2")));
assert.ok(incomplete.failures.some(item => item.includes("Narrator")));

const unverifiable = evaluateUsabilitySessions([
  { ...passingSession("P01", "executive"), evidence_reference: "", observation_notes: "" },
  passingSession("P02", "crm_growth", true),
  passingSession("P03", "data_finance")
]);
assert.strictEqual(unverifiable.status, "not_ready");
assert.ok(unverifiable.failures.some(item => item.includes("سند جلسه ناقص")));

console.log("usability-evaluation.test.js passed");
