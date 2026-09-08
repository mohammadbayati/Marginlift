import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.STAGING_BASE_URL || "https://staging.marginlift.ir";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "staging-smoke.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-staging" }]],
  use: {
    baseURL,
    launchOptions: { executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
});
