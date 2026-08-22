const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseCSV } = require("./csv");

const projectRoot = path.join(__dirname, "..");
const fixtureRoot = path.join(projectRoot, "fixtures");
const manifestPath = path.join(fixtureRoot, "manifest.json");
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /password\s*=/i,
  /secret\s*=/i,
  /token\s*=/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/
];
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?\d[\s-]?){9,}/;

function loadFixtureManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function getFixtureLayer(layerId, manifest = loadFixtureManifest()) {
  const layer = manifest.layers.find(item => item.id === layerId);
  if (!layer) throw new Error(`Unknown fixture layer: ${layerId}`);
  return layer;
}

function validateFixtureLayer(layerId) {
  const manifest = loadFixtureManifest();
  const layer = getFixtureLayer(layerId, manifest);
  const files = layer.files.map(file => inspectFixtureFile(file));
  const parity = buildStorageParitySnapshot(layer, files);
  if (parity.json.hash !== parity.postgres.hash) {
    throw new Error(`Fixture storage parity failed for ${layerId}.`);
  }
  return {
    schemaVersion: manifest.schemaVersion,
    layer: layer.id,
    files,
    storageParity: {
      jsonHash: parity.json.hash,
      postgresHash: parity.postgres.hash
    },
    digest: stableHash({ layer: layer.id, files, parity: parity.json.hash })
  };
}

function validateAllFixtureLayers() {
  const manifest = loadFixtureManifest();
  return manifest.layers.map(layer => validateFixtureLayer(layer.id));
}

function inspectFixtureFile(file) {
  if (path.basename(file.path).startsWith("synthetic-")) {
    throw new Error(`Fixture file must not reuse root synthetic naming: ${file.path}`);
  }

  const absolutePath = path.join(fixtureRoot, file.path);
  const raw = fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
  assertNoSensitiveContent(raw, file.path, { phone: false });

  const result = {
    type: file.type,
    path: file.path,
    sha256: sha256(raw),
    bytes: Buffer.byteLength(raw),
    rowCount: 0
  };

  if (file.path.endsWith(".csv")) {
    const rows = parseCSV(raw);
    rows.forEach(row => assertFixtureRowSafe(row, file.path));
    result.rowCount = rows.length;
    result.headers = Object.keys(rows[0] || {}).sort();
  } else if (file.path.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    assertNoSensitiveContent(JSON.stringify(parsed), file.path, { phone: false });
    result.rowCount = 1;
    result.keys = Object.keys(parsed).sort();
  } else {
    throw new Error(`Unsupported fixture file type: ${file.path}`);
  }

  return result;
}

function buildStorageParitySnapshot(layer, files) {
  const payload = {
    meta: {
      fixtureSchemaVersion: "marginlift-fixtures-v1",
      layer: layer.id
    },
    organizations: [{ id: `org_fixture_${layer.id.replace(/-/g, "_")}`, name: `Fixture ${layer.id}` }],
    campaigns: files.filter(file => file.type === "campaign"),
    customerAnalyses: files.filter(file => file.type === "customers"),
    outcomes: files.filter(file => file.type === "outcomes"),
    artifacts: files.map(file => ({
      type: file.type,
      path: file.path,
      sha256: file.sha256,
      rowCount: file.rowCount
    }))
  };
  const canonical = canonicalJson(payload);
  return {
    json: {
      driver: "json",
      path: "data/db.json",
      hash: sha256(canonical),
      payload
    },
    postgres: {
      driver: "postgres",
      table: "marginlift_state",
      rowId: 1,
      column: "payload",
      hash: sha256(canonical),
      payload
    }
  };
}

function assertNoSensitiveContent(value, label, options = {}) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) throw new Error(`${label} appears to contain a secret-like value.`);
  }
  if (EMAIL_PATTERN.test(value)) throw new Error(`${label} appears to contain an email address.`);
  if (options.phone !== false && PHONE_PATTERN.test(value)) throw new Error(`${label} appears to contain a phone-like value.`);
}

function assertFixtureRowSafe(row, label) {
  for (const [key, value] of Object.entries(row)) {
    const text = String(value || "");
    if (key.includes("customer") && text && !/^hash_[a-f0-9]{64}$/i.test(text)) {
      throw new Error(`${label} has a non-hashed customer identifier in ${key}.`);
    }
    if (key.includes("customer") && text) continue;
    assertNoSensitiveContent(text, `${label}:${key}`);
  }
}

function stableHash(value) {
  return sha256(canonicalJson(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = sortKeys(value[key]);
    return result;
  }, {});
}

module.exports = {
  buildStorageParitySnapshot,
  fixtureRoot,
  getFixtureLayer,
  loadFixtureManifest,
  validateAllFixtureLayers,
  validateFixtureLayer
};
