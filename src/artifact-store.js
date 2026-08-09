const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const storageRoot = process.env.ARTIFACT_STORAGE_PATH || path.join(__dirname, "..", "data", "artifacts");
const encryptionKey = parseKey(process.env.ARTIFACT_ENCRYPTION_KEY || "");

function isEnabled() {
  return Boolean(encryptionKey);
}

async function persistArtifact(input) {
  if (!isEnabled()) return null;
  const id = input.id;
  const organizationId = safePart(input.organizationId);
  const storageKey = path.join(organizationId, `${safePart(id)}.mlenc`);
  const targetPath = resolveStorageKey(storageKey);
  const plaintext = Buffer.from(String(input.content || ""), "utf8");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.concat([Buffer.from("MLA1"), iv, tag, ciphertext]);

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(targetPath, envelope, { mode: 0o600 });
  return {
    id,
    organizationId: input.organizationId,
    type: input.type,
    name: cleanName(input.name),
    storageKey: storageKey.replace(/\\/g, "/"),
    sha256: `sha256:${crypto.createHash("sha256").update(plaintext).digest("hex")}`,
    sizeBytes: plaintext.length,
    encryption: "aes-256-gcm",
    keyVersion: process.env.ARTIFACT_KEY_VERSION || "v1",
    createdBy: input.createdBy || "system",
    createdAt: input.createdAt || new Date().toISOString()
  };
}

async function readArtifact(metadata) {
  if (!isEnabled()) throw new Error("Artifact encryption is not configured.");
  const envelope = await fs.promises.readFile(resolveStorageKey(metadata.storageKey));
  if (envelope.subarray(0, 4).toString("utf8") !== "MLA1") throw new Error("Invalid artifact envelope.");
  const iv = envelope.subarray(4, 16);
  const tag = envelope.subarray(16, 32);
  const ciphertext = envelope.subarray(32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function deleteArtifact(metadata) {
  try {
    await fs.promises.unlink(resolveStorageKey(metadata.storageKey));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function resolveStorageKey(storageKey) {
  const resolvedRoot = path.resolve(storageRoot);
  const resolved = path.resolve(resolvedRoot, storageKey);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Invalid artifact path.");
  return resolved;
}

function parseKey(value) {
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, "hex");
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 ? decoded : null;
  } catch (error) {
    return null;
  }
}

function safePart(value) {
  const part = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!part) throw new Error("Invalid artifact identifier.");
  return part;
}

function cleanName(value) {
  return String(value || "dataset.csv").replace(/[\r\n]/g, " ").slice(0, 120);
}

module.exports = { deleteArtifact, isEnabled, persistArtifact, readArtifact };
