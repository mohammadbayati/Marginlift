const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const remotePort = Number(process.env.QA_REMOTE_PORT || 9334);
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3004";
const outputDir = path.join(__dirname, "..");
const profileDir = path.join(os.tmpdir(), `marginlift-qa-${Date.now()}`);

async function run() {
  const { cookie: sessionCookie, readOnly, role } = await prepareDemoWorkspace();
  const typographyResponse = await fetch(`${baseUrl}/api/font-status`);
  if (!typographyResponse.ok) throw new Error(`Typography status failed: ${typographyResponse.status}`);
  const typographyStatus = (await typographyResponse.json()).data;
  const expectedFont = String(process.env.QA_EXPECTED_FONT || "").trim();
  if (expectedFont && typographyStatus.activeFamily !== expectedFont) {
    throw new Error(`Expected ${expectedFont}, received ${typographyStatus.activeFamily}.`);
  }
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
    await cdp.send("DOM.enable");
    await cdp.send("Accessibility.enable");
    const navigation = await cdp.send("Page.navigate", { url: `${baseUrl}/login` });
    if (navigation.errorText && navigation.errorText !== "net::ERR_ABORTED") {
      throw new Error(`Navigation failed: ${navigation.errorText}`);
    }
    await delay(2500);

    await capture(cdp, 1440, 960, "qa-login-desktop.png", false, ".auth-shell");
    await capture(cdp, 390, 844, "qa-login-mobile.png", true, ".auth-shell");
    const authDiagnostics = await evaluate(cdp, `({
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      hasDecisionPreview: Boolean(document.querySelector('.auth-product-preview')),
      hasVisibleLogin: Boolean(document.querySelector('#loginForm.active'))
    })`);
    if (authDiagnostics.horizontalOverflow || !authDiagnostics.hasDecisionPreview || !authDiagnostics.hasVisibleLogin) {
      throw new Error(`Auth UI diagnostics failed: ${JSON.stringify(authDiagnostics)}`);
    }
    const authSkipLink = await auditSkipLink(cdp, "auth");
    const authKeyboard = await auditKeyboard(cdp, 18, ["loginEmail", "loginPassword", "submit:loginForm"]);
    const authAccessibility = await auditAccessibilityTree(cdp, "auth");

    const [cookieName, cookieValue] = sessionCookie.split("=");
    await cdp.send("Network.setCookie", {
      name: cookieName,
      value: cookieValue,
      url: baseUrl,
      path: "/"
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}/login` });
    await waitForProductReady(cdp, role);
    const usabilityAccess = await evaluate(cdp, `(() => {
      const link = document.getElementById('usabilityConsoleLink');
      return { exists: Boolean(link), hidden: Boolean(link?.hidden), href: link?.getAttribute('href') || '' };
    })()`);
    if (!usabilityAccess.exists || usabilityAccess.href !== "/internal/usability-test" || usabilityAccess.hidden !== (role !== "owner")) {
      throw new Error(`Usability console role visibility failed: ${JSON.stringify({ role, usabilityAccess })}`);
    }
    const typography = await auditRenderedTypography(cdp, typographyStatus);
    const presentation = await auditPresentationMode(cdp);

    const productSkipLink = await auditSkipLink(cdp, "product");
    await capture(cdp, 1440, 1000, "qa-command-desktop.png", false, "#command");
    await capture(cdp, 390, 844, "qa-command-mobile.png", true, "#command");
    await capture(cdp, 1440, 1000, "qa-retention-desktop.png");
    await capture(cdp, 390, 844, "qa-retention-mobile.png", true);
    await capture(cdp, 1440, 1000, "qa-retention-analysis-desktop.png", false, ".retention-analysis-panel");
    await capture(cdp, 390, 844, "qa-retention-analysis-mobile.png", true, ".retention-analysis-panel");
    if (!readOnly) {
      const previewCsv = fs.readFileSync(path.join(outputDir, "synthetic-ecommerce-transactions.csv"), "utf8");
      await evaluate(cdp, `retentionCsvText = ${JSON.stringify(previewCsv)}; refreshRetentionPreview()`);
      await delay(700);
    }
    await capture(cdp, 1440, 1100, "qa-retention-onboarding-desktop.png", false, ".retention-import-panel");
    await capture(cdp, 390, 1000, "qa-retention-onboarding-mobile.png", true, ".retention-import-panel");
    if (!readOnly) {
      await evaluate(cdp, `fetch('/api/retention/shadow-runs', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capacity: 3 }) }).then(response => { if (!response.ok) throw new Error('Shadow QA failed'); return response.json(); }).then(() => loadDashboard())`);
      await delay(700);
    }
    await capture(cdp, 1440, 900, "qa-retention-model-card-desktop.png", false, ".retention-model-card");
    await capture(cdp, 390, 844, "qa-retention-model-card-mobile.png", true, ".retention-model-card");
    await capture(cdp, 1440, 900, "qa-retention-shadow-desktop.png", false, ".retention-shadow-panel");
    await capture(cdp, 390, 1000, "qa-retention-shadow-mobile.png", true, ".retention-shadow-panel");
    await capture(cdp, 1440, 1000, "qa-behavioral-desktop.png", false, "#behavioral");
    await capture(cdp, 390, 1000, "qa-behavioral-mobile.png", true, "#behavioral");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1440,
      screenHeight: 1000
    });
    const productKeyboard = await auditKeyboard(cdp, 22, ["link:#command", "exportReportButton", "logoutButton"]);
    const productAccessibility = await auditAccessibilityTree(cdp, "product");

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 1000
    });
    await evaluate(cdp, `(() => {
      document.getElementById('workspaceName').textContent = 'گروه تجارت الکترونیکی بین المللی با نام سازمانی بسیار بلند';
      document.getElementById('sidebarWorkspace').textContent = 'گروه تجارت الکترونیکی بین المللی با نام سازمانی بسیار بلند';
      document.getElementById('topbarUser').textContent = 'مدیر ارشد مدیریت ارتباط با مشتریان سازمان';
      document.getElementById('pulseHeadline').textContent = 'پیش از افزایش بودجه کمپین نگهداشت مشتریان با ارزش بالا، کیفیت داده و سیاست تماس دوباره بررسی شود.';
      const metric = document.querySelector('.metric-card strong');
      if (metric) metric.textContent = '۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹ تومان';
    })()`);
    await capture(cdp, 390, 1000, "qa-edge-content-mobile.png", true, "#command");
    const edgeDiagnostics = await evaluate(cdp, `(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const selectors = ['.command-hero', '.snapshot-panel', '.metric-card', '.workspace-bar'];
      const outsideViewport = selectors.flatMap(selector => [...document.querySelectorAll(selector)]).filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
      }).map(element => element.className);
      const metric = document.querySelector('.metric-card strong');
      return {
        horizontalOverflow: document.documentElement.scrollWidth > viewportWidth,
        outsideViewport,
        metricOverflow: Boolean(metric && metric.scrollWidth > metric.clientWidth + 1)
      };
    })()`);
    if (edgeDiagnostics.horizontalOverflow || edgeDiagnostics.outsideViewport.length || edgeDiagnostics.metricOverflow) {
      throw new Error(`Edge-content diagnostics failed: ${JSON.stringify(edgeDiagnostics)}`);
    }
    const diagnostics = await evaluate(cdp, `({
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      missingContactGate: !document.querySelector('#contactGateMetrics'),
      emptyContactChecks: document.querySelectorAll('.contact-gate-check').length === 0,
      untranslatedFileControls: [...document.querySelectorAll('.file-control-button')].some(button => button.textContent.trim() !== 'انتخاب فایل')
    })`);
    if (diagnostics.horizontalOverflow || diagnostics.missingContactGate || diagnostics.emptyContactChecks || diagnostics.untranslatedFileControls) {
      throw new Error(`UI diagnostics failed: ${JSON.stringify(diagnostics)}`);
    }
    const publicSurfaces = await auditPublicSurfaces(cdp);
    const report = {
      environment: { baseUrl, readOnly, role, expectedFont: expectedFont || null },
      auth: authDiagnostics,
      typography,
      authSkipLink,
      authKeyboard,
      authAccessibility,
      presentation,
      product: diagnostics,
      productSkipLink,
      productKeyboard,
      productAccessibility,
      edge: edgeDiagnostics,
      publicSurfaces
    };
    fs.writeFileSync(
      path.join(outputDir, "docs", "ui-quality-audit-latest.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
    console.log(JSON.stringify(report));
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

async function auditPresentationMode(cdp) {
  const results = [];
  const expectedVisibleCounts = [2, 2, 1];
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
    await evaluate(cdp, "setPresentationMode(true)");
    await delay(350);

    for (let step = 0; step < 3; step += 1) {
      await evaluate(cdp, `presentationStepIndex = ${step}; renderPresentationStep(false)`);
      await delay(250);
      const diagnostics = await evaluate(cdp, `(() => {
        const candidates = ['command', 'snapshot', 'metricGrid', 'customers', 'decisions', 'experiments'];
        const visible = candidates.filter(id => {
          const element = document.getElementById(id);
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && rect.width > 0 && rect.height > 0;
        });
        const report = document.getElementById('presentationReportButton');
        return {
          modeActive: document.body.classList.contains('presentation-mode'),
          guideVisible: getComputedStyle(document.getElementById('presentationGuide')).display !== 'none',
          sidebarHidden: getComputedStyle(document.getElementById('productSidebar')).display === 'none',
          activeStepCount: document.querySelectorAll('[data-presentation-step].active').length,
          currentContentCount: document.querySelectorAll('.is-presentation-current').length,
          visible,
          reportVisible: getComputedStyle(report).display !== 'none',
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      })()`);
      if (!diagnostics.modeActive || !diagnostics.guideVisible || !diagnostics.sidebarHidden || diagnostics.activeStepCount !== 1 || diagnostics.currentContentCount !== expectedVisibleCounts[step] || diagnostics.visible.length !== expectedVisibleCounts[step] || diagnostics.reportVisible !== (step === 2) || diagnostics.horizontalOverflow) {
        throw new Error(`Presentation diagnostics failed: ${viewport.name}/step-${step + 1} ${JSON.stringify(diagnostics)}`);
      }
      results.push({ viewport: viewport.name, step: step + 1, ...diagnostics });
      await capture(cdp, viewport.width, viewport.height, `qa-presentation-${viewport.name}-step-${step + 1}.png`, viewport.mobile, "#presentationGuide");
    }
    await evaluate(cdp, "setPresentationMode(false)");
  }
  return results;
}

async function prepareDemoWorkspace() {
  const email = String(process.env.QA_EMAIL || "growth@example.com");
  const password = String(process.env.QA_PASSWORD || "demo1234");
  const readOnly = Boolean(process.env.QA_EMAIL || process.env.QA_PASSWORD);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!login.ok) throw new Error(`Demo login failed: ${login.status}`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Demo session cookie was not returned.");
  const sessionResponse = await fetch(`${baseUrl}/api/session`, { headers: { Cookie: cookie } });
  if (!sessionResponse.ok) throw new Error(`Demo session lookup failed: ${sessionResponse.status}`);
  const role = (await sessionResponse.json()).data?.role || "viewer";
  if (readOnly) return { cookie, readOnly: true, role };
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
  return { cookie, readOnly: false, role };
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

async function auditKeyboard(cdp, tabCount, requiredStops) {
  await evaluate(cdp, `(() => {
    document.activeElement?.blur();
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
  })()`);
  const stops = [];
  for (let index = 0; index < tabCount; index += 1) {
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await delay(30);
    stops.push(await evaluate(cdp, `(() => {
      const element = document.activeElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        key: element.id || (element.tagName === 'A' ? 'link:' + (element.getAttribute('href') || '') : (element.type === 'submit' ? 'submit:' + (element.form?.id || '') : element.tagName.toLowerCase())),
        name: element.getAttribute('aria-label') || element.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 80) || element.name || element.id,
        visible: rect.width > 0 && rect.height > 0,
        focusVisible: style.boxShadow !== 'none' || (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0)
      };
    })()`));
  }
  await evaluate(cdp, `document.body.removeAttribute('tabindex')`);
  const missing = requiredStops.filter(key => !stops.some(stop => stop.key === key));
  const invisibleFocus = stops.filter(stop => !["body", "html"].includes(stop.key) && stop.visible && !stop.focusVisible);
  if (missing.length || invisibleFocus.length) {
    throw new Error(`Keyboard audit failed: ${JSON.stringify({ missing, invisibleFocus })}`);
  }
  return { checkedStops: stops.length, requiredStops, visibleFocusFailures: 0 };
}

async function auditRenderedTypography(cdp, expectedStatus) {
  const rendered = await evaluate(cdp, `(async () => {
    const loadResult = await Promise.race([
      document.fonts.load('16px "MarginLift Persian"', 'تصمیم سود افزایشی').then(faces => ({ timedOut: false, count: faces.length })),
      new Promise(resolve => setTimeout(() => resolve({ timedOut: true, count: 0 }), 5000))
    ]);
    const faces = [...document.fonts]
      .filter(face => String(face.family).includes('MarginLift Persian'))
      .map(face => ({ family: face.family, status: face.status, weight: face.weight }));
    return {
      loadResult,
      runtimeStylesheet: [...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href.includes('/fonts/marginlift-font.css')),
      bodyFontFamily: getComputedStyle(document.body).fontFamily,
      faces
    };
  })()`);
  const loaded = !rendered.loadResult.timedOut && rendered.loadResult.count > 0 && rendered.faces.some(face => face.status === "loaded");
  if (!rendered.runtimeStylesheet || !rendered.bodyFontFamily.includes("MarginLift Persian") || !loaded) {
    throw new Error(`Typography rendering audit failed: ${JSON.stringify({ expectedStatus, rendered })}`);
  }
  return { ...expectedStatus, renderedFamily: "MarginLift Persian", browserFaceLoaded: true };
}

async function auditSkipLink(cdp, label) {
  await evaluate(cdp, `(() => {
    document.activeElement?.blur();
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
  })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await delay(220);
  const firstStop = await evaluate(cdp, `(() => {
    const element = document.activeElement;
    const rect = element.getBoundingClientRect();
    return {
      isSkipLink: element.classList.contains('skip-link'),
      href: element.getAttribute('href'),
      visible: rect.width > 0 && rect.height > 0,
      focusVisible: rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
    };
  })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await delay(120);
  const destination = await evaluate(cdp, `(() => ({
    hash: location.hash,
    activeId: document.activeElement?.id || '',
    targetExists: Boolean(location.hash && document.querySelector(location.hash)),
    targetIsMain: Boolean(location.hash && document.querySelector(location.hash)?.matches('main'))
  }))()`);
  await evaluate(cdp, `document.body.removeAttribute('tabindex')`);
  const targetId = String(firstStop.href || '').replace(/^#/, '');
  if (!firstStop.isSkipLink || !firstStop.visible || !firstStop.focusVisible || !destination.targetExists || !destination.targetIsMain || destination.activeId !== targetId) {
    throw new Error(`${label} skip-link audit failed: ${JSON.stringify({ firstStop, destination })}`);
  }
  return { target: firstStop.href, firstFocusable: true, visibleOnFocus: true, movedFocus: true };
}

async function waitForProductReady(cdp, expectedRole, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await evaluate(cdp, `(() => {
      const app = document.getElementById('appShell');
      const main = document.getElementById('mainContent');
      const skipLink = document.querySelector('.skip-link');
      const usabilityLink = document.getElementById('usabilityConsoleLink');
      return Boolean(
        app
        && main
        && skipLink
        && usabilityLink
        && usabilityLink.hidden === (${JSON.stringify(expectedRole)} !== 'owner')
        && !app.classList.contains('is-hidden')
        && main.getClientRects().length
        && skipLink.getAttribute('href') === '#mainContent'
      );
    })()`);
    if (ready) return;
    await delay(200);
  }
  throw new Error("Product UI did not become ready before the accessibility audit.");
}

async function auditAccessibilityTree(cdp, label, requiredRoles = ["main", "heading", "button", "link"]) {
  const tree = await cdp.send("Accessibility.getFullAXTree");
  const nodes = (tree.nodes || []).filter(node => !node.ignored);
  const namedRoles = new Set(["button", "link", "textbox", "combobox", "checkbox", "radio", "switch", "heading"]);
  const missingNameNodes = nodes
    .filter(node => namedRoles.has(node.role?.value))
    .filter(node => !String(node.name?.value || "").trim());
  const missingNames = [];
  for (const node of missingNameNodes) {
    let dom = null;
    if (node.backendDOMNodeId) {
      dom = await cdp.send("DOM.describeNode", { backendNodeId: node.backendDOMNodeId, depth: 0 }).catch(() => null);
    }
    missingNames.push({
      role: node.role?.value,
      nodeId: node.nodeId,
      nodeName: dom?.node?.nodeName || null,
      attributes: dom?.node?.attributes || []
    });
  }
  const counts = nodes.reduce((result, node) => {
    const role = node.role?.value || "unknown";
    result[role] = (result[role] || 0) + 1;
    return result;
  }, {});
  if (missingNames.length) throw new Error(`${label} accessibility tree has unnamed controls: ${JSON.stringify(missingNames)}`);
  const missingRoles = requiredRoles.filter(role => !counts[role]);
  if (missingRoles.length) throw new Error(`${label} accessibility tree is incomplete: ${JSON.stringify({ missingRoles, counts })}`);
  return { nodes: nodes.length, mains: counts.main || 0, headings: counts.heading || 0, buttons: counts.button || 0, links: counts.link || 0, unnamedControls: 0 };
}

async function auditPublicSurfaces(cdp) {
  const surfaces = [
    ["/", "sales"],
    ["/privacy.html", "privacy"],
    ["/terms.html", "terms"],
    ["/security.html", "security"],
    ["/pilot-data-request.html", "pilot-data-request"],
    ["/pilot.html", "pilot"],
    ["/executive-report.html", "executive-report"],
    ["/submission.html", "submission"],
    ["/deck.html", "deck"],
    ["/vm-deployment.html", "vm-deployment"]
  ];
  const results = [];
  for (const [route, slug] of surfaces) {
    const navigation = await cdp.send("Page.navigate", { url: `${baseUrl}${route}` });
    if (navigation.errorText && navigation.errorText !== "net::ERR_ABORTED") throw new Error(`${route} navigation failed: ${navigation.errorText}`);
    await waitForDocument(cdp, route);
    await waitForSurfaceResources(cdp, route);
    const viewports = [[1440, 900, false, "desktop"], [390, 844, true, "mobile"]];
    for (const [width, height, mobile, label] of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
      await delay(250);
      await evaluate(cdp, `window.scrollTo(0, 0)`);
      const diagnostics = await evaluate(cdp, `(() => {
        const logos = [...document.querySelectorAll('.brand-symbol, .brand-mark, .report-brandmark')];
        return {
          status: document.readyState,
          title: document.title.trim(),
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          hasH1: Boolean(document.querySelector('h1')),
          mainCount: [...document.querySelectorAll('main')].filter(main => getComputedStyle(main).display !== 'none').length,
          hasSkipLink: Boolean(document.querySelector('.skip-link[href^="#"]')),
          hasRuntimeFont: [...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href.includes('/fonts/marginlift-font.css')),
          bodyFontFamily: getComputedStyle(document.body).fontFamily,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          logoCount: logos.length,
          unrenderedLogo: logos.some(logo => !getComputedStyle(logo).backgroundImage.includes('brand-mark.svg'))
        };
      })()`);
      if (!diagnostics.title || diagnostics.lang !== 'fa' || diagnostics.dir !== 'rtl' || !diagnostics.hasH1 || diagnostics.mainCount !== 1 || !diagnostics.hasSkipLink || !diagnostics.hasRuntimeFont || !diagnostics.bodyFontFamily.includes('MarginLift Persian') || diagnostics.horizontalOverflow || diagnostics.unrenderedLogo) {
        throw new Error(`${route} ${label} surface audit failed: ${JSON.stringify(diagnostics)}`);
      }
      await capture(cdp, width, height, `qa-${slug}-${label}.png`, mobile, "body");
      results.push({ route, viewport: label, overflow: false, logoCount: diagnostics.logoCount });
    }
    const skipLink = await auditSkipLink(cdp, route);
    const accessibility = await auditAccessibilityTree(cdp, route, ["main", "heading"]);
    results[results.length - 1].skipLink = skipLink;
    results[results.length - 1].accessibility = accessibility;
  }
  return results;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed.");
  }
  return result.result?.value;
}

async function waitForDocument(cdp, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const ready = await evaluate(cdp, `Boolean(document.documentElement && document.body && ['interactive', 'complete'].includes(document.readyState))`);
      if (ready) return;
    } catch (error) {
      // Navigation can briefly invalidate the execution context.
    }
    await delay(250);
  }
  throw new Error(`${label} document did not become ready.`);
}

async function waitForSurfaceResources(cdp, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const ready = await evaluate(cdp, `(async () => {
        if (document.readyState !== 'complete') return false;
        const runtimeFont = [...document.querySelectorAll('link[rel="stylesheet"]')]
          .find(link => link.href.includes('/fonts/marginlift-font.css'));
        if (!runtimeFont || !runtimeFont.sheet) return false;
        await document.fonts.ready;
        await document.fonts.load('16px "MarginLift Persian"');
        const logos = [...document.querySelectorAll('.brand-symbol, .brand-mark, .report-brandmark')];
        return getComputedStyle(document.body).fontFamily.includes('MarginLift Persian')
          && logos.every(logo => getComputedStyle(logo).backgroundImage.includes('brand-mark.svg'));
      })()`);
      if (ready) return;
    } catch (error) {
      // Stylesheets and execution contexts can change while navigation settles.
    }
    await delay(250);
  }
  throw new Error(`${label} fonts or brand assets did not become ready.`);
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
