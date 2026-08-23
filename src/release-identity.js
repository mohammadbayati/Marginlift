"use strict";

const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "..", ".marginlift-release.json");

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {};
  }
}

function releaseIdentity() {
  const manifest = readManifest();
  return {
    service: "marginlift",
    environment: process.env.NODE_ENV || "development",
    commitSha: process.env.MARGINLIFT_COMMIT_SHA || manifest.commitSha || "unknown",
    release: process.env.MARGINLIFT_RELEASE || manifest.release || null,
    buildTimestamp: process.env.MARGINLIFT_BUILD_TIMESTAMP || manifest.buildTimestamp || null
  };
}

module.exports = { releaseIdentity };
