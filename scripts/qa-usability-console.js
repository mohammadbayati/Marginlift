const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const remotePort = Number(process.env.QA_USABILITY_PORT || 9471);
const rootDir = path.join(__dirname, "..");
const pageUrl = pathToFileURL(path.join(rootDir, "docs", "usability-session-console-fa.html")).href;
const profileDir = path.join(os.tmpdir(), `marginlift-usability-qa-${Date.now()}`);

async function run() {
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--allow-file-access-from-files",
    "--no-first-run",
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${profileDir}`,
    "about:blank"
  ], { stdio: "ignore" });

  try {
    const debuggerUrl = await waitForDebugger();
    const cdp = connect(debuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Accessibility.enable");
    const results = [];

    for (const viewport of [
      { name: "desktop", width: 1440, height: 1000, mobile: false },
      { name: "mobile", width: 390, height: 844, mobile: true }
    ]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
        screenWidth: viewport.width,
        screenHeight: viewport.height
      });
      await cdp.send("Page.navigate", { url: pageUrl });
      await waitForReady(cdp);
      await evaluate(cdp, `localStorage.removeItem('marginlift_usability_sessions_v2'); location.reload()`);
      await waitForReady(cdp);
      const diagnostics = await evaluate(cdp, `(async () => {
        await document.fonts.ready;
        await document.fonts.load('16px "MarginLift Persian"');
        const clientWidth = document.documentElement.clientWidth;
        const offenders = [...document.querySelectorAll('body *')].filter(element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.position === 'fixed' || style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return false;
          return rect.left < -1 || rect.right > clientWidth + 1;
        }).slice(0, 20).map(element => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, id: element.id, className: String(element.className || '').slice(0, 90), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
        });
        return {
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          mainCount: document.querySelectorAll('main').length,
          h1Count: document.querySelectorAll('h1').length,
          skipLinkFirst: document.querySelector('body > a')?.classList.contains('skip-link') || false,
          bodyFont: getComputedStyle(document.body).fontFamily,
          fontLoaded: document.fonts.check('16px "MarginLift Persian"'),
          clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > clientWidth,
          offenders
        };
      })()`);

      const accessibility = await auditAccessibility(cdp);
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(path.join(rootDir, `qa-usability-console-${viewport.name}.png`), Buffer.from(screenshot.data, "base64"));
      const keyboard = await auditKeyboard(cdp, viewport.name);
      const interaction = await auditInteraction(cdp);
      results.push({ viewport: viewport.name, ...diagnostics, accessibility, keyboard, interaction });
    }

    const failures = results.flatMap(result => {
      const items = [];
      if (result.lang !== "fa" || result.dir !== "rtl") items.push(`${result.viewport}: language direction`);
      if (result.mainCount !== 1 || result.h1Count !== 1 || !result.skipLinkFirst) items.push(`${result.viewport}: document structure`);
      if (!result.bodyFont.includes("MarginLift Persian") || !result.fontLoaded) items.push(`${result.viewport}: font`);
      if (result.horizontalOverflow || result.offenders.length) items.push(`${result.viewport}: overflow ${JSON.stringify(result.offenders)}`);
      if (result.accessibility.unnamedControls.length) items.push(`${result.viewport}: unnamed controls ${JSON.stringify(result.accessibility.unnamedControls)}`);
      if (!result.keyboard.firstFocusIsSkipLink || result.keyboard.invisibleFocus.length) items.push(`${result.viewport}: keyboard ${JSON.stringify(result.keyboard)}`);
      if (!result.interaction.issueAdded || !result.interaction.screenReaderFieldsVisible || !result.interaction.screenReaderFieldsRequired || !result.interaction.sessionSaved || !result.interaction.issueLogCaptured || !result.interaction.exportEnabled) items.push(`${result.viewport}: interactions ${JSON.stringify(result.interaction)}`);
      return items;
    });
    process.stdout.write(`${JSON.stringify({ status: failures.length ? "fail" : "pass", results, failures }, null, 2)}\n`);
    if (failures.length) process.exitCode = 1;
    cdp.close();
  } finally {
    chrome.kill();
    if (chrome.exitCode == null) {
      await Promise.race([
        new Promise(resolve => chrome.once("exit", resolve)),
        delay(3000)
      ]);
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    } catch (error) {
      // A closing Chrome process can briefly retain its profile on Windows.
    }
  }
}

async function auditAccessibility(cdp) {
  const tree = await cdp.send("Accessibility.getFullAXTree");
  const controlRoles = new Set(["button", "textbox", "combobox", "checkbox", "radio"]);
  const unnamedControls = tree.nodes
    .filter(node => !node.ignored && controlRoles.has(node.role?.value) && !String(node.name?.value || "").trim())
    .map(node => ({ role: node.role?.value, backendDOMNodeId: node.backendDOMNodeId }));
  return { nodes: tree.nodes.length, unnamedControls };
}

async function auditKeyboard(cdp, label) {
  await evaluate(cdp, `document.activeElement?.blur()`);
  const stops = [];
  const invisibleFocus = [];
  for (let index = 0; index < 18; index += 1) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const stop = await evaluate(cdp, `(() => {
      const element = document.activeElement;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const hasVisibleFocus = element.matches(':focus-visible')
        || Number.parseFloat(style.outlineWidth) >= 2
        || (style.boxShadow && style.boxShadow !== 'none');
      return {
        tag: element.tagName,
        id: element.id,
        name: element.getAttribute('name') || '',
        text: String(element.textContent || element.value || '').trim().slice(0, 45),
        focusVisible: hasVisibleFocus,
        inViewport: rect.bottom >= 0 && rect.top <= innerHeight && rect.right >= 0 && rect.left <= innerWidth
      };
    })()`);
    if (stop) {
      stops.push(stop);
      if (!stop.focusVisible || !stop.inViewport) invisibleFocus.push(stop);
    }
  }
  return { label, checkedStops: stops.length, firstFocusIsSkipLink: stops[0]?.text === "رفتن به محتوای اصلی", invisibleFocus };
}

async function auditInteraction(cdp) {
  return evaluate(cdp, `(() => {
    document.querySelector('#addIssueButton').click();
    const screenReader = document.querySelector('#screenReaderUsed');
    screenReader.checked = true;
    screenReader.dispatchEvent(new Event('change', { bubbles: true }));
    const fields = document.querySelector('#screenReaderFields');
    const setValue = (selector, value) => {
      const control = document.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('#role', 'executive');
    setValue('#moderatorId', 'M01');
    setValue('#durationMinutes', '25');
    setValue('#device', 'Windows laptop');
    setValue('#browser', 'Chrome QA');
    setValue('#inputMethod', 'keyboard and assistive technology');
    setValue('#recordingConsent', 'yes');
    setValue('#evidenceReference', 'local/P01-session-notes.md');
    setValue('#screenReaderName', 'NVDA');
    setValue('#screenReaderVersion', '2025.3');
    document.querySelector('[name="screen_reader_pass"][value="yes"]').checked = true;
    document.querySelector('[name="evidence_interpretation_correct"][value="yes"]').checked = true;
    document.querySelector('[name="next_action_correct"][value="yes"]').checked = true;
    setValue('#confidence', '4');
    for (let index = 1; index <= 5; index += 1) {
      setValue('#task' + index + 'Seconds', String(35 + index * 7));
      document.querySelector('[name="task_' + index + '_pass"]').checked = true;
    }
    setValue('[data-issue="observation"]', 'کاربر پیش از انتخاب تصمیم روی برچسب شواهد مکث کرد.');
    setValue('[data-issue="impact"]', 'ممکن بود برآورد تاریخی را اثر قطعی تفسیر کند.');
    document.querySelector('[data-issue="resolved"]').checked = true;
    setValue('#observationNotes', 'شرکت‌کننده مسیر تصمیم را بدون راهنمایی طی کرد و پس از مکث، نوع شواهد و اقدام بعدی را درست توضیح داد.');
    const issueAdded = document.querySelectorAll('.issue-row').length === 1;
    const screenReaderFieldsVisible = !fields.hidden;
    const screenReaderFieldsRequired = [...fields.querySelectorAll('select, input')].every(control => control.required);
    document.querySelector('#sessionForm').requestSubmit();
    const sessions = JSON.parse(localStorage.getItem('marginlift_usability_sessions_v2') || '[]');
    return {
      issueAdded,
      screenReaderFieldsVisible,
      screenReaderFieldsRequired,
      sessionSaved: sessions.length === 1 && sessions[0].participant_id === 'P01',
      issueLogCaptured: Boolean(sessions[0]?.issue_log?.includes('I01|S3|resolved')),
      exportEnabled: !document.querySelector('#exportButton').disabled
    };
  })()`);
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${remotePort}/json/list`);
      const pages = await response.json();
      const page = pages.find(item => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (error) {
      // Chrome may need a moment to expose its debugging endpoint.
    }
    await delay(250);
  }
  throw new Error("Chrome debugging endpoint did not become ready.");
}

async function waitForReady(cdp) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if (await evaluate(cdp, `document.readyState === 'complete' && Boolean(window.MarginLiftUsability)`)) return;
    } catch (error) {
      // Navigation can invalidate the execution context briefly.
    }
    await delay(250);
  }
  throw new Error("Usability console did not become ready.");
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed.");
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
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result || {});
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

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
