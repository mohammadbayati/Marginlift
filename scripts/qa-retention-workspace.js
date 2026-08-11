const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const remotePort = 9334;
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3004";
const outputDir = path.join(__dirname, "..");
const profileDir = path.join(os.tmpdir(), `marginlift-qa-${Date.now()}`);

async function run() {
  const sessionCookie = await prepareDemoWorkspace();
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${profileDir}`,
    "about:blank"
  ], { windowsHide: true, stdio: "ignore" });

  try {
    const target = await waitForTarget();
    const cdp = connect(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    const [cookieName, cookieValue] = sessionCookie.split("=");
    await cdp.send("Network.setCookie", {
      name: cookieName,
      value: cookieValue,
      url: baseUrl,
      path: "/"
    });
    const navigation = await cdp.send("Page.navigate", { url: `${baseUrl}/login` });
    if (navigation.errorText && navigation.errorText !== "net::ERR_ABORTED") {
      throw new Error(`Navigation failed: ${navigation.errorText}`);
    }
    await delay(2500);

    await capture(cdp, 1440, 1000, "qa-command-desktop.png", false, "#command");
    await capture(cdp, 390, 844, "qa-command-mobile.png", true, "#command");
    await capture(cdp, 1440, 1000, "qa-retention-desktop.png");
    await capture(cdp, 390, 844, "qa-retention-mobile.png", true);
    await capture(cdp, 1440, 1000, "qa-retention-analysis-desktop.png", false, ".retention-analysis-panel");
    await capture(cdp, 390, 844, "qa-retention-analysis-mobile.png", true, ".retention-analysis-panel");
    const previewCsv = fs.readFileSync(path.join(outputDir, "synthetic-ecommerce-transactions.csv"), "utf8");
    await evaluate(cdp, `retentionCsvText = ${JSON.stringify(previewCsv)}; refreshRetentionPreview()`);
    await delay(700);
    await capture(cdp, 1440, 1100, "qa-retention-onboarding-desktop.png", false, ".retention-import-panel");
    await capture(cdp, 390, 1000, "qa-retention-onboarding-mobile.png", true, ".retention-import-panel");
    await evaluate(cdp, `fetch('/api/retention/shadow-runs', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capacity: 3 }) }).then(response => { if (!response.ok) throw new Error('Shadow QA failed'); return response.json(); }).then(() => loadDashboard())`);
    await delay(700);
    await capture(cdp, 1440, 900, "qa-retention-model-card-desktop.png", false, ".retention-model-card");
    await capture(cdp, 390, 844, "qa-retention-model-card-mobile.png", true, ".retention-model-card");
    await capture(cdp, 1440, 900, "qa-retention-shadow-desktop.png", false, ".retention-shadow-panel");
    await capture(cdp, 390, 1000, "qa-retention-shadow-mobile.png", true, ".retention-shadow-panel");
    await capture(cdp, 1440, 1000, "qa-behavioral-desktop.png", false, "#behavioral");
    await capture(cdp, 390, 1000, "qa-behavioral-mobile.png", true, "#behavioral");
    const diagnostics = await evaluate(cdp, `({
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      missingContactGate: !document.querySelector('#contactGateMetrics'),
      emptyContactChecks: document.querySelectorAll('.contact-gate-check').length === 0
    })`);
    if (diagnostics.horizontalOverflow || diagnostics.missingContactGate || diagnostics.emptyContactChecks) {
      throw new Error(`UI diagnostics failed: ${JSON.stringify(diagnostics)}`);
    }
    console.log(JSON.stringify(diagnostics));
    cdp.close();
  } finally {
    chrome.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (error) {
      // Windows can keep the headless profile locked briefly after Chrome exits.
    }
  }
}

async function prepareDemoWorkspace() {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "growth@example.com", password: "demo1234" })
  });
  if (!login.ok) throw new Error(`Demo login failed: ${login.status}`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Demo session cookie was not returned.");
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const configuration = await fetch(`${baseUrl}/api/retention/configuration`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      presetKey: "super_app_packages",
      display: { purchaseObjectFa: "بسته اینترنت", channelFa: "اپلیکیشن" },
      readiness: { minimumHistoryDays: 30, minimumCustomers: 10, minimumRepeatCustomers: 5 }
    })
  });
  if (!configuration.ok) throw new Error(`Configuration failed: ${configuration.status}`);
  const csvText = fs.readFileSync(path.join(outputDir, "synthetic-package-transactions.csv"), "utf8");
  const analysis = await fetch(`${baseUrl}/api/retention/import`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "دموی نگهداشت بسته اینترنت", cutoff: "2026-02-01", csvText })
  });
  if (!analysis.ok) throw new Error(`Retention import failed: ${analysis.status}`);
  return cookie;
}

async function capture(cdp, width, height, filename, mobile = false, selector = "#retention") {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height
  });
  await delay(500);
  const pageState = await evaluate(cdp, `({ href: location.href, readyState: document.readyState, hasRetention: Boolean(document.querySelector(${JSON.stringify(selector)})) })`);
  if (!pageState?.hasRetention) throw new Error(`Retention section is missing at ${pageState?.href || "unknown page"}.`);
  await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'start' })`);
  await delay(500);
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(path.join(outputDir, filename), Buffer.from(screenshot.data, "base64"));
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed.");
  }
  return result.result?.value;
}

function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result || {});
  });
  return {
    ready,
    send(method, params = {}) {
      const messageId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
        socket.send(JSON.stringify({ id: messageId, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${remotePort}/json/list`);
      const targets = await response.json();
      const page = targets.find(item => item.type === "page" && !String(item.url).startsWith("chrome-extension://"));
      if (page?.webSocketDebuggerUrl) return page;
    } catch (error) {
      // Chrome is still starting.
    }
    await delay(200);
  }
  throw new Error("Chrome DevTools endpoint did not start.");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
