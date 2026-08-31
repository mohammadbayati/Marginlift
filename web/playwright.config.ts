import path from "node:path";
import { defineConfig } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3104",
    launchOptions: { executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm start",
    cwd: root,
    url: "http://127.0.0.1:3104/api/health",
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      PORT: "3104",
      MARGINLIFT_DB: path.join(root, "web", ".e2e-db.json"),
      ARTIFACT_STORAGE_PATH: path.join(root, "web", ".e2e-artifacts"),
      ARTIFACT_ENCRYPTION_KEY: "33".repeat(32),
      MARGINLIFT_LOG_LEVEL: "silent",
    },
  },
});
