const assert = require("assert");
const path = require("path");

const {
  buildStorageParitySnapshot,
  fixtureRoot,
  getFixtureLayer,
  loadFixtureManifest,
  validateAllFixtureLayers,
  validateFixtureLayer
} = require("../src/fixture-strategy");

const manifest = loadFixtureManifest();
assert.strictEqual(manifest.schemaVersion, "marginlift-fixtures-v1");
assert.strictEqual(manifest.policy.containsRealCustomerData, false);
assert.strictEqual(manifest.policy.containsSecrets, false);
assert.strictEqual(manifest.policy.separateFromRootSyntheticCsv, true);
assert.deepStrictEqual(manifest.layers.map(layer => layer.id), ["minimal", "regression", "production-smoke"]);

const snapshots = validateAllFixtureLayers();
assert.strictEqual(snapshots.length, 3);

const expectedDigests = {
  minimal: "f48c025599af5827192500ef88883ee75583e0789c430b74c6dc673fac7d9b0c",
  regression: "598ff3e7034cadc5e20ae57e94bb5a8f5ade84123d9523a5fa0695738f13b234",
  "production-smoke": "863573ce7dec687fc199e2c97208a9fb5c05d209688c2ba591e5ffc331e17c22"
};
const expectedParityHashes = {
  minimal: "7412da789fe467b38fd8cf07297f16ac9962fd12ced34b9fca6eb6c20acb86c9",
  regression: "f7bb6d6eb00ddadbf8444596845856d61d1a4e412d0f34b3d3dd30b16076f9d0",
  "production-smoke": "0a36b7ca00a553de2eee455d9b6a9d87b9b0d8305a8d98ae32450e5e87030f58"
};

for (const snapshot of snapshots) {
  assert.ok(/^[a-f0-9]{64}$/.test(snapshot.digest), `${snapshot.layer}: digest should be stable sha256`);
  assert.strictEqual(snapshot.digest, expectedDigests[snapshot.layer]);
  assert.strictEqual(snapshot.storageParity.jsonHash, snapshot.storageParity.postgresHash);
  assert.strictEqual(snapshot.storageParity.jsonHash, expectedParityHashes[snapshot.layer]);
  assert.ok(snapshot.files.every(file => !path.basename(file.path).startsWith("synthetic-")));
  assert.ok(snapshot.files.every(file => file.rowCount > 0));
}

const minimal = validateFixtureLayer("minimal");
assert.deepStrictEqual(minimal.files.map(file => [file.type, file.rowCount]), [
  ["campaign", 2],
  ["customers", 2],
  ["outcomes", 2]
]);

const regression = validateFixtureLayer("regression");
assert.deepStrictEqual(regression.files.map(file => [file.type, file.rowCount]), [
  ["campaign", 8],
  ["customers", 8],
  ["outcomes", 8]
]);

const productionSmoke = validateFixtureLayer("production-smoke");
assert.deepStrictEqual(productionSmoke.files.map(file => [file.type, file.rowCount]), [
  ["campaign", 2],
  ["customers", 4],
  ["outcomes", 4],
  ["health-contract", 1]
]);

const layer = getFixtureLayer("production-smoke");
const parity = buildStorageParitySnapshot(layer, productionSmoke.files);
assert.strictEqual(parity.json.path, "data/db.json");
assert.strictEqual(parity.postgres.table, "marginlift_state");
assert.strictEqual(parity.postgres.column, "payload");
assert.deepStrictEqual(parity.json.payload, parity.postgres.payload);
assert.strictEqual(fixtureRoot.endsWith("fixtures"), true);

console.log("fixture-strategy.test.js passed");
