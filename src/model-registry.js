const http = require("http");
const { shadowScorerUrl } = require("./config");

const TIMEOUT_MS = 5000;

// Read the uplift-model registry (versions + production pointer) from the
// internal scorer. Used by the owner-facing observability endpoint.
function getRegistry() {
  const url = new URL("/internal/registry", shadowScorerUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "GET", timeout: TIMEOUT_MS }, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Registry returned ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON from registry")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Registry timeout")); });
    req.end();
  });
}

module.exports = { getRegistry };
