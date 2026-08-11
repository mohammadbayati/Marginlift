const assert = require("assert");

const {
  applyContactPolicy,
  buildContactSafetyWorkspace,
  evaluateContactPermission
} = require("../src/contact-policy");

const allowed = evaluateContactPermission({
  consentStatus: "granted",
  preferredChannel: "push",
  doNotContact: "false",
  contactCount30d: "2"
});
assert.strictEqual(allowed.allowed, true);

const optedOut = evaluateContactPermission({
  consentStatus: "granted",
  preferredChannel: "sms",
  doNotContact: "true",
  contactCount30d: "0"
});
assert.strictEqual(optedOut.allowed, false);
assert.ok(optedOut.reasons.some(item => item.code === "do_not_contact"));

const capped = evaluateContactPermission({
  consentStatus: "granted",
  preferredChannel: "push",
  doNotContact: "false",
  contactCount30d: "3"
});
assert.strictEqual(capped.allowed, false);
assert.ok(capped.reasons.some(item => item.code === "frequency_cap_reached"));

const missing = evaluateContactPermission({});
assert.strictEqual(missing.allowed, false);
assert.ok(missing.reasons.some(item => item.code === "consent_missing"));

const queue = [
  { customerIdHash: "hash_1", recommendedAction: "reminder_test", decisionReasonFa: "موعد خرید نزدیک است." },
  { customerIdHash: "hash_2", recommendedAction: "channel_nudge_test", decisionReasonFa: "چرخه گذشته است." },
  { customerIdHash: "hash_3", recommendedAction: "no_action", decisionReasonFa: "عدم اقدام بهتر است." }
];
const rows = [
  contactRow("hash_1", "granted", "push", "false", "1"),
  contactRow("hash_2", "granted", "sms", "true", "0"),
  contactRow("hash_3", "granted", "email", "false", "0")
];
const evaluated = applyContactPolicy(queue, rows);
assert.strictEqual(evaluated[0].actionAllowed, true);
assert.strictEqual(evaluated[1].actionAllowed, false);
assert.strictEqual(evaluated[2].actionAllowed, false);

const workspace = buildContactSafetyWorkspace(evaluated);
assert.strictEqual(workspace.contractReady, true);
assert.strictEqual(workspace.summary.actionAllowed, 1);
assert.strictEqual(workspace.summary.blockedByOptOut, 1);
assert.ok(workspace.checks.every(item => item.status === "pass"));

const incomplete = applyContactPolicy(queue.slice(0, 1), [{ customer_id_hash: "hash_1" }]);
assert.strictEqual(buildContactSafetyWorkspace(incomplete).contractReady, false);

function contactRow(customerIdHash, consentStatus, preferredChannel, doNotContact, contactCount30d) {
  return {
    customer_id_hash: customerIdHash,
    purchased_at: "2026-01-01T00:00:00Z",
    consent_status: consentStatus,
    preferred_channel: preferredChannel,
    do_not_contact: doNotContact,
    contact_count_30d: contactCount30d
  };
}

console.log("contact-policy.test.js passed");
