const fa = new Intl.NumberFormat("fa-IR");
const moneyFa = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });

let currentAnalysis = null;
let currentOverview = null;
let currentCustomerAnalysis = null;
let currentHistory = [];
let currentPilotState = null;
const MAX_IMPORT_FILE_BYTES = 1800000;

function formatNumber(value) {
  return fa.format(Number(value || 0));
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000000) {
    return `${moneyFa.format(Math.round(number / 10000000) / 100)} میلیارد تومان`;
  }
  if (Math.abs(number) >= 1000000) {
    return `${moneyFa.format(Math.round(number / 1000000))} میلیون تومان`;
  }
  return `${moneyFa.format(Math.round(number))} تومان`;
}

function formatPercent(value) {
  return `${formatNumber(value)}٪`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  }[char]));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "درخواست انجام نشد.");
  return payload.data;
}

function setMessage(id, message, kind = "") {
  const target = document.getElementById(id);
  if (!target) return;
  target.textContent = message;
  target.dataset.kind = kind;
  target.classList.remove("message-pop");
  requestAnimationFrame(() => target.classList.add("message-pop"));
}

function setButtonBusy(button, busy, busyLabel = "در حال انجام...") {
  if (!button) return;
  if (busy) {
    button.dataset.idleLabel = button.textContent.trim();
    button.textContent = busyLabel;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    return;
  }
  button.textContent = button.dataset.idleLabel || button.textContent;
  button.disabled = false;
  button.removeAttribute("aria-busy");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function setAuthMode(mode) {
  document.querySelectorAll("[data-auth-tab]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.authTab === mode);
    tab.setAttribute("aria-selected", String(tab.dataset.authTab === mode));
  });
  document.querySelectorAll(".auth-form").forEach(form => {
    form.classList.toggle("active", form.id === `${mode}Form`);
  });
}

function fileIsTooLarge(file) {
  return file && file.size > MAX_IMPORT_FILE_BYTES;
}

function showFileSizeError(messageId, previewId) {
  const limit = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(MAX_IMPORT_FILE_BYTES / 1000000);
  if (previewId) {
    document.getElementById(previewId).innerHTML = `<strong>حجم فایل بیشتر از حد مجاز است</strong><span>نسخه فعلی فایل‌های تا ${limit} مگابایت را می‌پذیرد. فایل را کوچک‌تر کنید یا نمونه‌ای از ردیف‌ها بسازید.</span>`;
  }
  setMessage(messageId, "فایل برای بارگذاری مستقیم بزرگ است؛ ابتدا حجم یا تعداد ردیف‌ها را کاهش دهید.", "error");
}

function setSidebarOpen(open) {
  const sidebar = document.getElementById("productSidebar");
  const scrim = document.getElementById("sidebarScrim");
  const toggle = document.getElementById("mobileNavToggle");
  if (!sidebar || !scrim || !toggle) return;
  sidebar.classList.toggle("is-open", open);
  scrim.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("nav-open", open);
}

function setupNavigation() {
  document.getElementById("mobileNavToggle")?.addEventListener("click", () => setSidebarOpen(true));
  document.getElementById("mobileNavClose")?.addEventListener("click", () => setSidebarOpen(false));
  document.getElementById("sidebarScrim")?.addEventListener("click", () => setSidebarOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setSidebarOpen(false);
  });

  const navLinks = [...document.querySelectorAll(".side-nav a[href^='#']")];
  navLinks.forEach(link => link.addEventListener("click", () => {
    navLinks.forEach(item => item.classList.toggle("active", item === link));
    setSidebarOpen(false);
  }));

  const observedSections = navLinks.map(link => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
    }, { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.2, 0.55] });
    observedSections.forEach(section => observer.observe(section));
  }

  const dateTarget = document.getElementById("topbarDate");
  if (dateTarget) dateTarget.textContent = `آخرین به‌روزرسانی: ${new Date().toLocaleDateString("fa-IR")}`;
}

function renderMetrics() {
  const summary = currentOverview.summary;
  const campaign = currentAnalysis.campaign;
  const cards = [
    ["مشتریان در معرض ریزش", formatNumber(summary.atRiskAudience), "برآورد سطح سگمنت؛ نه امتیاز فردی"],
    ["ارزش پرریسک", formatMoney(summary.protectedProfit), "سود مشارکتی قابل حفاظت"],
    ["صرفه‌جویی پیشنهادی", formatMoney(campaign.nextSavings), "نسبت به baseline تعریف‌شده"],
    ["درآمد حفظ‌شده", formatPercent(campaign.revenuePreserved), "در مقایسه با خط مبنای تصمیم"]
  ];
  document.getElementById("metricGrid").innerHTML = cards
    .map((card, index) => `<article class="metric-card metric-${index + 1}"><span>${card[0]}</span><strong class="number">${card[1]}</strong><small>${card[2]}</small></article>`)
    .join("");
}

function renderDecisionQueue() {
  document.getElementById("decisionRows").innerHTML = currentOverview.decisionQueue.map(row => {
    const riskClass = row.riskBandFa === "زیاد" ? "high" : row.riskBandFa === "متوسط" ? "medium" : "low";
    const statusClass = row.decisionStatusFa === "اجرا" ? "pass" : row.decisionStatusFa === "آزمایش بیشتر" ? "warn" : "neutral";
    return `<tr>
      <td><strong>${escapeHtml(row.nameFa)}</strong><small>${formatNumber(row.users)} کاربر / ${escapeHtml(row.sourceFa)}</small></td>
      <td><span class="risk risk-${riskClass}">${row.riskScore ? `${escapeHtml(row.riskBandFa)} · ${formatPercent(row.riskScore)}` : escapeHtml(row.riskBandFa)}</span></td>
      <td><span class="tier">${escapeHtml(row.economicTierFa)}</span><small>${formatMoney(row.projectedContributionProfit)}</small></td>
      <td><strong class="action-name">${escapeHtml(row.nextBestActionFa)}</strong><small>اثر: ${formatNumber(row.uplift)} واحد</small></td>
      <td><span class="decision-status status-${statusClass}">${escapeHtml(row.decisionStatusFa)}</span></td>
      <td class="reason-cell">${escapeHtml(row.rationaleFa)}</td>
    </tr>`;
  }).join("");
}

function renderActions() {
  const actions = [
    { key: "بدون پیشنهاد", title: "بدون اقدام", kicker: "No Action", tone: "neutral", copy: "برای مشتریانی که ارزش افزوده اقدام پولی برایشان اثبات نشده است.", rule: "هزینه صفر / کنترل معتبر" },
    { key: "فقط پوش", title: "بازگشت کم‌هزینه", kicker: "Low touch", tone: "teal", copy: "ابتدا کانال ارزان را امتحان کن و قبل از تخفیف، اثر آن را ثبت کن.", rule: "اول پیام، بعد مشوق" },
    { key: "تخفیف کوچک", title: "مداخله کنترل‌شده", kicker: "Test more", tone: "amber", copy: "برای مشتریان پاسخ‌پذیر با شواهد مثبت اما نیازمند holdout بیشتر.", rule: "holdout کوچک لازم است" },
    { key: "مشوق قوی", title: "نجات پرارزش", kicker: "High touch", tone: "coral", copy: "برای ارزش بالا و ریسک بالا؛ فقط با سقف هزینه و ظرفیت مشخص.", rule: "ظرفیت و حاشیه سود را چک کن" }
  ];
  document.getElementById("actionCards").innerHTML = actions.map(item => {
    const segment = currentOverview.decisionQueue.find(row => row.nextBestActionFa === item.key);
    return `<article class="action-card tone-${item.tone}"><span class="mini-label">${item.kicker}</span><h3>${item.title}</h3><p>${item.copy}</p><div class="action-bottom"><strong class="number">${segment ? formatNumber(segment.users) : "۰"}</strong><span>کاربر در نمونه</span></div><small>${item.rule}</small></article>`;
  }).join("");
}

function renderUpliftLab() {
  const lab = currentOverview.upliftLab;
  if (!lab) return;
  document.getElementById("upliftModelStatus").textContent = lab.summary.modelStatusFa;
  document.getElementById("upliftSummary").innerHTML = [
    ["سود افزایشی مثبت", formatMoney(lab.summary.incrementalProfit), "فقط سگمنت‌هایی که اثر اقتصادی مثبت دارند"],
    ["بهترین سهم هدف‌گیری", formatPercent(lab.summary.bestTargetShare), `${formatNumber(lab.summary.bestTargetUsers)} کاربر در نقطه بهینه`],
    ["بهترین اقدام مشاهده‌شده", lab.summary.bestTreatmentFa, `تبدیل کنترل: ${formatPercent(lab.summary.controlConversion)}`]
  ].map(item => `<div class="uplift-stat"><span>${item[0]}</span><strong class="number">${item[1]}</strong><small>${item[2]}</small></div>`).join("");

  const maxProfit = Math.max(1, ...lab.qiniCurve.map(point => Math.max(0, point.cumulativeProfit)));
  document.getElementById("qiniBars").innerHTML = lab.qiniCurve.map(point => {
    const width = Math.max(8, Math.round((Math.max(0, point.cumulativeProfit) / maxProfit) * 100));
    return `<div class="qini-row"><div class="qini-copy"><strong>${escapeHtml(point.segmentFa)}</strong><span>${formatPercent(point.targetShare)} از جامعه / ${escapeHtml(point.actionFa)}</span></div><div class="qini-track"><span style="width:${width}%"></span></div><bdi class="number">${formatMoney(point.cumulativeProfit)}</bdi></div>`;
  }).join("");

  document.getElementById("reactionCards").innerHTML = lab.reactionMix.map(item =>
    `<article class="reaction-card"><span>${item.label}</span><strong>${escapeHtml(item.titleFa)}</strong><bdi class="number">${formatNumber(item.users)}</bdi><small>${escapeHtml(item.noteFa)}</small></article>`
  ).join("");

  document.getElementById("treatmentRows").innerHTML = lab.treatmentComparison.map(row => {
    const statusClass = row.verdictFa.includes("رد") ? "neutral" : row.verdictFa.includes("نیازمند") ? "warn" : "pass";
    return `<tr>
      <td><strong>${escapeHtml(row.labelFa)}</strong><small>${escapeHtml(row.key)}</small></td>
      <td class="number">${formatNumber(row.users)}</td>
      <td class="number">${formatPercent(row.conversion)}</td>
      <td class="number">${formatNumber(row.lift)}</td>
      <td><small>${formatNumber(row.ciLow)} تا ${formatNumber(row.ciHigh)}</small></td>
      <td><span class="decision-status status-${statusClass}">${escapeHtml(row.verdictFa)}</span></td>
    </tr>`;
  }).join("");

  document.getElementById("upliftModelCards").innerHTML = lab.modelCards.map(card =>
    `<article class="model-card"><span>${escapeHtml(card.statusFa)}</span><strong>${escapeHtml(card.name)}</strong><p>${escapeHtml(card.methodFa)}</p><small>${escapeHtml(card.bestForFa)}</small></article>`
  ).join("");
}

function renderCustomerProduct() {
  if (!currentCustomerAnalysis) return;
  const summary = currentCustomerAnalysis.summary;
  const finance = currentCustomerAnalysis.finance;
  const experiment = currentCustomerAnalysis.experimentPlan;

  document.getElementById("customerModelStatus").textContent = currentCustomerAnalysis.model.statusFa;
  document.getElementById("customerCards").innerHTML = currentCustomerAnalysis.customer360.map(customer => `<article class="customer-card">
    <div><strong>${escapeHtml(customer.customerId)}</strong><span>${escapeHtml(customer.segmentFa)}</span></div>
    <div class="customer-score"><bdi class="number">${formatNumber(customer.riskScore)}</bdi><span>ریسک ${escapeHtml(customer.riskBandFa)}</span></div>
    <dl>
      <div><dt>ارزش</dt><dd>${formatMoney(customer.clv)}</dd></div>
      <div><dt>اقدام</dt><dd>${escapeHtml(customer.recommendedActionFa)}</dd></div>
      <div><dt>سود افزایشی</dt><dd>${formatMoney(customer.expectedIncrementalProfit)}</dd></div>
    </dl>
    <p>${escapeHtml(customer.reasonFa)}</p>
  </article>`).join("");

  document.getElementById("financeSummary").innerHTML = [
    ["مشتریان قابل اقدام", formatNumber(summary.targetableCustomers), "بر اساس سود افزایشی مثبت"],
    ["سود افزایشی مورد انتظار", formatMoney(finance.expectedIncrementalProfit), "پس از کسر هزینه اقدام"],
    ["هزینه قابل جلوگیری", formatMoney(finance.avoidableIncentiveCost), "عدم تخفیف به مشتریان کم‌اثر"],
    ["ROI پایلوت", `${formatNumber(finance.projectedRoi)}×`, finance.paybackFa]
  ].map(item => `<div class="finance-stat"><span>${item[0]}</span><strong class="number">${item[1]}</strong><small>${item[2]}</small></div>`).join("");

  document.getElementById("experimentHypothesis").textContent = experiment.hypothesisFa;
  document.getElementById("experimentPlan").innerHTML = [
    ["مخاطب", experiment.audienceFa],
    ["KPI اصلی", experiment.primaryMetricFa],
    ["Holdout", experiment.recommendedHoldoutFa],
    ["مدت سنجش", experiment.durationFa],
    ["نمونه هر گروه", `${formatNumber(experiment.sampleSize.perGroup)} مشتری`],
    ["MDE", `${formatPercent(experiment.sampleSize.minimumDetectableEffect)} واحد`]
  ].map(item => `<div><span>${item[0]}</span><strong>${escapeHtml(item[1])}</strong></div>`).join("");
}

function renderPilotState() {
  if (!currentPilotState) return;
  const { readiness, savingsSnapshot: snapshot, workspace, outcome } = currentPilotState;

  document.getElementById("snapshotEvidence").textContent = snapshot.evidenceTagFa;
  document.getElementById("savingsSnapshot").innerHTML = [
    ["هزینه مشوق قابل حذف", formatMoney(snapshot.avoidableIncentiveCost), snapshot.claimLevelFa],
    ["سود افزایشی", formatMoney(snapshot.expectedIncrementalProfit), snapshot.decisionFa],
    ["درآمد در معرض ریسک", formatMoney(snapshot.revenueAtRisk), "برای گفت‌وگوی CMO/CFO"],
    ["ROI پایلوت", `${formatNumber(snapshot.pilotRoi)}×`, `اعتماد: ${snapshot.confidenceFa}`]
  ].map(item => `<div class="snapshot-stat"><span>${item[0]}</span><strong class="number">${item[1]}</strong><small>${escapeHtml(item[2])}</small></div>`).join("");

  document.getElementById("readinessAuditStatus").textContent = readiness.statusFa;
  document.getElementById("readinessAuditScore").textContent = formatPercent(readiness.score);
  document.getElementById("readinessAuditNext").textContent = readiness.nextStepFa;
  document.getElementById("readinessChecks").innerHTML = readiness.checks.map(item =>
    `<div class="readiness-check ${item.passed ? "passed" : "missing"}"><span>${item.passed ? "✓" : "!"}</span><strong>${escapeHtml(item.labelFa)}</strong><small>${escapeHtml(item.statusFa)}</small></div>`
  ).join("");

  document.getElementById("workspaceStatus").textContent = workspace.overallStatusFa;
  document.getElementById("workspaceSteps").innerHTML = workspace.steps.map((step, index) =>
    `<div class="workspace-step ${step.complete ? "complete" : "pending"}"><bdi class="number">${formatNumber(index + 1)}</bdi><div><strong>${escapeHtml(step.labelFa)}</strong><span>${escapeHtml(step.statusFa)}</span></div></div>`
  ).join("");

  document.getElementById("outcomeReadout").innerHTML = outcome ? [
    ["تصمیم", outcome.summary.recommendationFa],
    ["سود افزایشی مشاهده‌شده", formatMoney(outcome.summary.observedIncrementalProfit)],
    ["شکاف پیش‌بینی/واقعیت", formatMoney(outcome.summary.predictionGap)],
    ["ROI مشاهده‌شده", `${formatNumber(outcome.summary.observedRoi)}×`]
  ].map(item => `<div><span>${item[0]}</span><strong>${escapeHtml(item[1])}</strong></div>`).join("") : `<div class="empty-history"><strong>هنوز outcome وارد نشده است.</strong><span>بعد از بسته‌شدن پنجره ۳۰ روزه، فایل synthetic-outcome-data.csv یا خروجی واقعی کمپین را وارد کنید.</span></div>`;
}

function renderHistory() {
  const target = document.getElementById("analysisHistory");
  if (!target) return;
  if (!currentHistory.length) {
    target.innerHTML = `<div class="empty-history"><strong>هنوز تحلیل ذخیره‌شده‌ای ندارید.</strong><span>اولین CSV که وارد شود، اینجا ثبت می‌شود.</span></div>`;
    return;
  }
  target.innerHTML = currentHistory.map(item => `<article class="history-item">
    <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.typeFa)} / ${formatNumber(item.rowCount)} ردیف</span></div>
    <div><bdi>${escapeHtml(item.headlineFa)}</bdi><time>${new Date(item.createdAt).toLocaleDateString("fa-IR")}</time></div>
  </article>`).join("");
}

function renderStages() {
  document.getElementById("stageGrid").innerHTML = currentOverview.stages.map((stage, index) =>
    `<article class="stage-card ${stage.passed ? "passed" : "pending"}"><div class="stage-index number">${formatNumber(index + 1)}</div><div><strong>${escapeHtml(stage.labelFa)}</strong><span>${escapeHtml(stage.statusFa)}</span><small>${escapeHtml(stage.detailFa)}</small></div></article>`
  ).join("");
}

function renderEvidence() {
  document.getElementById("evidenceList").innerHTML = currentOverview.evidence.map(item =>
    `<div class="evidence-row"><span class="evidence-state ${item.status}">${item.status === "pass" ? "✓" : "!"}</span><div><strong>${escapeHtml(item.labelFa)}</strong><span>${escapeHtml(item.valueFa)}</span></div></div>`
  ).join("");
  const contract = currentOverview.contract;
  document.getElementById("contractDetails").innerHTML = [
    ["واحد تحلیل", contract.unitFa],
    ["تعریف ریزش", contract.churnDefinitionFa],
    ["پنجره مشاهده", contract.observationWindowFa],
    ["پنجره پیش‌بینی", contract.predictionWindowFa],
    ["KPI اصلی", contract.primaryKpiFa]
  ].map(item => `<div><dt>${item[0]}</dt><dd>${escapeHtml(item[1])}</dd></div>`).join("");
  document.getElementById("limitationsList").innerHTML = currentOverview.limitationsFa.map(item => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderDashboard() {
  renderMetrics();
  renderDecisionQueue();
  renderActions();
  renderUpliftLab();
  renderStages();
  renderEvidence();
  const readiness = currentOverview.readiness;
  document.getElementById("readinessValue").textContent = formatPercent(readiness.score);
  document.getElementById("readinessHeroValue").textContent = formatNumber(readiness.score);
  document.getElementById("readinessLabel").textContent = readiness.labelFa;
  document.getElementById("readinessMeter").style.width = `${readiness.score}%`;
  document.querySelector(".pulse-meter")?.setAttribute("aria-valuenow", String(readiness.score));
  document.getElementById("pulseHeadline").textContent = `${formatNumber(currentOverview.summary.atRiskAudience)} کاربر نیازمند بررسی هستند`;
  document.getElementById("pulseNote").textContent = readiness.noteFa;
  document.getElementById("queueCount").textContent = formatNumber(currentOverview.decisionQueue.length);
  document.getElementById("atRiskAudience").textContent = formatNumber(currentOverview.summary.atRiskAudience);
  document.getElementById("highValueAtRisk").textContent = formatNumber(currentOverview.summary.highValueAtRisk);
  document.getElementById("protectedProfit").textContent = formatMoney(currentOverview.summary.protectedProfit);
  document.getElementById("queueSource").textContent = currentOverview.summary.sourceFa;
  document.getElementById("contractStatus").textContent = `${currentOverview.contract.churnDefinitionFa} / ${currentOverview.contract.primaryKpiFa}`;
}

async function loadDashboard() {
  const [analysis, overview, customerAnalysis, history, pilotState] = await Promise.all([
    apiRequest("/api/campaigns/current"),
    apiRequest("/api/decision-engine/overview"),
    apiRequest("/api/customers/current"),
    apiRequest("/api/analyses/history"),
    apiRequest("/api/pilot/workspace")
  ]);
  currentAnalysis = analysis;
  currentOverview = overview;
  currentCustomerAnalysis = customerAnalysis;
  currentHistory = history;
  currentPilotState = pilotState;
  renderDashboard();
  renderCustomerProduct();
  renderPilotState();
  renderHistory();
  window.MarginLiftMotion?.refresh(document.getElementById("appShell"));
}

function setupAuth() {
  document.querySelectorAll("[data-auth-tab]").forEach(tab => tab.addEventListener("click", () => setAuthMode(tab.dataset.authTab)));
  document.querySelectorAll("[data-password-toggle]").forEach(button => button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    button.textContent = willShow ? "پنهان" : "نمایش";
    button.setAttribute("aria-label", willShow ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور");
  }));
  document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    setButtonBusy(submitButton, true, "در حال ورود...");
    try {
      await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value }) });
      await enterApp();
    } catch (error) {
      setMessage("loginMessage", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false);
    }
  });
  document.getElementById("signupForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    setButtonBusy(submitButton, true, "در حال ساخت حساب...");
    try {
      await apiRequest("/api/auth/signup", { method: "POST", body: JSON.stringify({ companyName: companyName.value, email: signupEmail.value, password: signupPassword.value }) });
      await enterApp();
    } catch (error) {
      setMessage("signupMessage", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false);
    }
  });
}

async function enterApp() {
  document.getElementById("authShell").classList.add("is-hidden");
  document.getElementById("appShell").classList.remove("is-hidden");
  setSidebarOpen(false);
  window.scrollTo({ top: 0, behavior: "instant" });
  try {
    const session = await apiRequest("/api/session");
    document.getElementById("workspaceName").textContent = session.organization.name;
    document.getElementById("sidebarWorkspace").textContent = session.organization.name;
    await loadDashboard();
  } catch (error) {
    setMessage("loginMessage", error.message, "error");
  }
}

function setupUpload() {
  document.getElementById("campaignCsvFile").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (fileIsTooLarge(file)) return showFileSizeError("uploadMessage", "uploadPreview");
    try {
      const preview = await apiRequest("/api/imports/preview", { method: "POST", body: JSON.stringify({ csvText: await file.text() }) });
      const missingText = preview.missing.length ? `ستون‌های ناقص: ${preview.missing.join("، ")}` : "قرارداد داده آماده تحلیل است.";
      document.getElementById("uploadPreview").innerHTML = `<strong>${escapeHtml(preview.detectedTypeFa)} / ${formatNumber(preview.rowCount)} ردیف</strong><span>${escapeHtml(missingText)}</span>`;
      setMessage("uploadMessage", preview.nextActionFa, preview.ready ? "success" : "error");
    } catch (error) {
      document.getElementById("uploadPreview").innerHTML = `<strong>فایل قابل خواندن نیست</strong><span>${escapeHtml(error.message)}</span>`;
      setMessage("uploadMessage", error.message, "error");
    }
  });

  document.getElementById("campaignUploadForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    const file = document.getElementById("campaignCsvFile").files[0];
    if (!file) return setMessage("uploadMessage", "یک فایل CSV انتخاب کنید.", "error");
    if (fileIsTooLarge(file)) return showFileSizeError("uploadMessage", "uploadPreview");
    setButtonBusy(submitButton, true, "در حال تحلیل...");
    setMessage("uploadMessage", "در حال تحلیل فایل...", "");
    try {
      const result = await apiRequest("/api/imports/csv", { method: "POST", body: JSON.stringify({ name: document.getElementById("campaignUploadName").value, csvText: await file.text() }) });
      await loadDashboard();
      setMessage("uploadMessage", result.type === "customer" ? "Customer 360 و برنامه پایلوت ساخته شد." : "صف تصمیم سگمنتی ساخته شد.", "success");
    } catch (error) {
      setMessage("uploadMessage", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false);
    }
  });

  document.getElementById("outcomeUploadForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    const file = document.getElementById("outcomeCsvFile").files[0];
    if (!file) return setMessage("outcomeMessage", "یک فایل outcome CSV انتخاب کنید.", "error");
    if (fileIsTooLarge(file)) return showFileSizeError("outcomeMessage");
    setButtonBusy(submitButton, true, "در حال مقایسه...");
    setMessage("outcomeMessage", "در حال مقایسه outcome با پیش‌بینی...", "");
    try {
      const result = await apiRequest("/api/outcomes/import", { method: "POST", body: JSON.stringify({ name: document.getElementById("outcomeUploadName").value, csvText: await file.text() }) });
      await loadDashboard();
      setMessage("outcomeMessage", result.summary.recommendationFa, result.summary.decisionStatus === "needs_review" ? "error" : "success");
    } catch (error) {
      setMessage("outcomeMessage", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false);
    }
  });
}

function setupActions() {
  document.getElementById("logoutButton").addEventListener("click", async () => {
    await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
    window.location.reload();
  });
  document.getElementById("exportReportButton").addEventListener("click", async () => {
    const response = await fetch("/api/campaigns/current/report", { credentials: "same-origin" });
    downloadBlob(await response.blob(), "marginlift-retention-report.md");
  });
  document.getElementById("exportAudienceButton").addEventListener("click", async () => {
    const response = await fetch("/api/exports/audience.csv", { credentials: "same-origin" });
    downloadBlob(await response.blob(), "marginlift-audience-export.csv");
  });
  document.getElementById("downloadPilotButton").addEventListener("click", async () => {
    const response = await fetch("/api/pilot/package.md", { credentials: "same-origin" });
    downloadBlob(await response.blob(), "marginlift-pilot-package.md");
  });
  document.getElementById("downloadReadoutButton").addEventListener("click", async () => {
    window.open("/executive-report.html", "_blank", "noopener");
  });
}

async function init() {
  setupAuth();
  setupNavigation();
  setupUpload();
  setupActions();
  try {
    const session = await apiRequest("/api/session");
    if (session) await enterApp();
  } catch (error) {
    /* ورود از فرم انجام می‌شود. */
  }
}

init();
