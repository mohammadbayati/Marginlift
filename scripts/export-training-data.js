// Export accumulated training examples to the shared volume for the trainer.
//
// Runs in the app container (has DB access) before the retraining loop. Writes
// db.trainingExamples as JSONL to TRAINING_DATA_DIR/examples.jsonl, which the
// scorer's retrain job reads. Atomic write.

const fs = require("fs");
const path = require("path");

const { closeStorage, initializeStorage, readDb } = require("../src/storage");
const { toJsonl } = require("../src/training-store");

const OUT_DIR = process.env.TRAINING_DATA_DIR || "/training";
const OUT_FILE = path.join(OUT_DIR, "examples.jsonl");

async function main() {
  await initializeStorage();
  const db = await readDb();
  const examples = db.trainingExamples || [];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = OUT_FILE + ".tmp";
  fs.writeFileSync(tmp, examples.length ? toJsonl(examples) + "\n" : "");
  fs.renameSync(tmp, OUT_FILE);

  console.log(JSON.stringify({ exported: examples.length, out: OUT_FILE }));
  await closeStorage();
}

main().catch(async err => {
  console.error("training export failed:", err.message);
  try { await closeStorage(); } catch (_) { /* closing */ }
  process.exit(1);
});
