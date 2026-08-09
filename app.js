const fa = new Intl.NumberFormat("fa-IR");
const moneyFa = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });

let currentAnalysis = null;
let currentOverview = null;
let currentCustomerAnalysis = null;
let currentHistory = [];
let currentPilotState = null;
let currentGovernance = null;
let currentSession = null;
let currentOperations = null;
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

function formatOptionalMoney(value) {
  return value === null || value === undefined ? "داده موجود نیست" : formatMoney(value);
}

function formatOptionalRatio(value) {
  return value === null || value === undefined ? "داده موجود نیست" : `${formatNumber(value)}×`;
}

function formatPercent(value) {
  return `${formatNumber(value)}٪`;
}

function formatStatPercent(value) {
  return value === null || value === undefined ? "محاسبه نشد" : `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(Number(value) * 100)}٪`;
}

function formatPValue(value) {
  return value === null || value === undefined ? "محاسبه نشد" : new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 4 }).format(Number(value));
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
      <div><dt>ارزش مشارکتی ۹۰روزه</dt><dd>${formatMoney(customer.clv)}</dd></div>
      <div><dt>اقدام</dt><dd>${escapeHtml(customer.recommendedActionFa)}</dd></div>
      <div><dt>سود افزایشی برآوردی</dt><dd>${formatMoney(customer.expectedIncrementalProfit)}</dd></div>
    </dl>
    <p>${escapeHtml(customer.reasonFa)}</p>
  </article>`).join("");

  document.getElementById("financeSummary").innerHTML = [
    ["مشتریان پیشنهادی برای آزمایش", formatNumber(summary.targetableCustomers), "برآورد مشاهده‌ای؛ نه فرمان اجرا"],
    ["سود افزایشی برآوردی", formatMoney(finance.expectedIncrementalProfit), finance.claimLevelFa],
    ["مشوق ثبت‌شده قابل بررسی", formatMoney(finance.avoidableIncentiveCost), "هزینه واقعی مشتریانی که No Action گرفته‌اند"],
    ["ROI برآورد تاریخی", `${formatNumber(finance.projectedRoi)}×`, finance.paybackFa]
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
  const { readiness, savingsSnapshot: snapshot, workspace, outcome, experiment } = currentPilotState;
  const metrics = snapshot.metrics || {};

  document.getElementById("snapshotEvidence").textContent = snapshot.evidenceTagFa;
  document.getElementById("savingsSnapshot").innerHTML = [
    [metrics.avoidableIncentiveCost?.labelFa || "شکاف هزینه مشاهده‌شده", formatOptionalMoney(snapshot.avoidableIncentiveCost), metrics.avoidableIncentiveCost?.noteFa || snapshot.claimLevelFa],
    [metrics.expectedIncrementalProfit?.labelFa || "سود افزایشی", formatOptionalMoney(snapshot.expectedIncrementalProfit), metrics.expectedIncrementalProfit?.noteFa || snapshot.decisionFa],
    [metrics.revenueAtRisk?.labelFa || "درآمد در معرض ریسک", formatOptionalMoney(snapshot.revenueAtRisk), metrics.revenueAtRisk?.noteFa || "نیازمند قرارداد مالی"],
    [metrics.pilotRoi?.labelFa || "ROI پایلوت", formatOptionalRatio(snapshot.pilotRoi), `${metrics.pilotRoi?.noteFa || ""} اعتماد: ${snapshot.confidenceFa}`.trim()]
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
  const verifiedRandomization = experiment?.design?.randomizationEvidence?.verified === true;
  const registerButton = document.getElementById("registerExperimentButton");
  const assignmentsButton = document.getElementById("downloadAssignmentsButton");
  registerButton.disabled = Boolean(currentPilotState.customerAnalysis?.isDemo) || (verifiedRandomization && experiment.status === "registered");
  assignmentsButton.disabled = !verifiedRandomization;
  if (verifiedRandomization) {
    setMessage("experimentMessage", `پایلوت ${experiment.id} پیش از اجرا قفل شده است؛ فایل تخصیص را برای اجرای کمپین دریافت کنید.`, "success");
  }

  const integrity = outcome?.integrity;
  const statistics = outcome?.statistics;
  const srmCheck = integrity?.checks?.find(item => item.key === "srm");
  document.getElementById("outcomeReadout").innerHTML = outcome ? [
    ["شناسه آزمایش", outcome.experimentId || experiment?.id || "نامشخص"],
    ["سلامت نتیجه", integrity?.statusFa || "نیازمند ممیزی"],
    ["کنترل SRM", srmCheck?.detailFa || "هنوز محاسبه نشده"],
    ["تصمیم", outcome.summary.recommendationFa],
    ["علت تصمیم", outcome.summary.decisionRationaleFa || "در انتظار تحلیل"],
    ["اثر ITT به‌ازای مشتری", formatOptionalMoney(outcome.summary.primaryEstimatePerCustomer)],
    ["فاصله اطمینان ۹۵٪", outcome.summary.primaryCiLow === null ? "محاسبه نشد" : `${formatMoney(outcome.summary.primaryCiLow)} تا ${formatMoney(outcome.summary.primaryCiHigh)}`],
    ["p-value", formatPValue(outcome.summary.pValue)],
    ["توان مشاهده‌شده", formatStatPercent(outcome.summary.achievedPower)],
    ["روش تحلیل", statistics?.methodFa || "در انتظار تحلیل"],
    ["سود افزایشی مشاهده‌شده", formatMoney(outcome.summary.observedIncrementalProfit)],
    ["شکاف پیش‌بینی/واقعیت", formatMoney(outcome.summary.predictionGap)],
    ["ROI مشاهده‌شده", `${formatNumber(outcome.summary.observedRoi)}×`]
  ].map(item => `<div><span>${item[0]}</span><strong>${escapeHtml(item[1])}</strong></div>`).join("") : `<div class="empty-history"><strong>هنوز outcome وارد نشده است.</strong><span>بعد از بسته‌شدن پنجره ۳۰ روزه، فایل synthetic-outcome-data.csv یا خروجی واقعی کمپین را وارد کنید.</span></div>`;

  const outcomeButton = document.querySelector("#outcomeUploadForm button[type='submit']");
  const outcomeInput = document.getElementById("outcomeCsvFile");
  const acceptsOutcome = Boolean(experiment?.acceptsOutcome);
  outcomeButton.disabled = !acceptsOutcome;
  outcomeInput.disabled = !acceptsOutcome;
  if (!outcome && !acceptsOutcome) {
    setMessage("outcomeMessage", "ابتدا فایل مشتری را در Data Onboarding وارد کنید تا Experiment Registry ساخته شود.", "error");
  } else if (!outcome) {
    setMessage("outcomeMessage", `نتیجه فقط به آزمایش ${experiment.id} متصل خواهد شد.`, "");
  }
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

function renderModelGovernance() {
  const governance = currentGovernance?.modelGovernance;
  if (!governance) return;
  const backtest = governance.backtest;
  const drift = governance.drift;
  const outcome = currentGovernance.outcomeMonitor;
  const ledger = currentGovernance.decisionLedger;
  const gate = governance.registry.promotionGate;

  document.getElementById("governanceClaim").textContent = governance.claimLevelFa;
  document.getElementById("backtestStatus").textContent = backtest.statusFa;
  document.getElementById("backtestEvidence").textContent = `${formatNumber(backtest.folds)} fold / ${backtest.evidenceLevelFa}`;
  document.getElementById("driftStatus").textContent = drift.statusFa;
  document.getElementById("driftScore").textContent = drift.score === null ? drift.summaryFa : `امتیاز پایداری ${formatNumber(drift.score)} از ۱۰۰`;
  document.getElementById("outcomeMonitorStatus").textContent = outcome.statusFa;
  document.getElementById("outcomeMonitorNote").textContent = outcome.summaryFa;
  document.getElementById("ledgerStatus").textContent = ledger.integrity.statusFa;
  document.getElementById("ledgerCount").textContent = `${formatNumber(ledger.integrity.checked)} تصمیم بررسی شد`;
  document.getElementById("promotionStatus").textContent = gate.statusFa;
  document.getElementById("promotionRecommendation").textContent = gate.recommendationFa;
  document.getElementById("driftBadge").textContent = drift.statusFa;
  document.getElementById("ledgerIntegrityBadge").textContent = ledger.integrity.statusFa;

  document.getElementById("modelRegistry").innerHTML = backtest.candidates.map(candidate => {
    const metrics = candidate.metrics;
    return `<div class="registry-row">
      <div><span>${candidate.role === "champion" ? "Champion فعال" : "Challenger در سایه"}</span><strong>${escapeHtml(candidate.nameFa)}</strong><small>${escapeHtml(candidate.statusFa)}</small></div>
      <div><span>خطای calibration</span><strong class="number">${metrics ? formatMoney(metrics.calibrationMae) : "محاسبه نشد"}</strong></div>
      <div><span>ارزش policy / مشتری</span><strong class="number">${metrics ? formatMoney(metrics.policyValuePerCustomer) : "محاسبه نشد"}</strong></div>
      <div><span>سهم هدف‌گیری</span><strong class="number">${metrics ? formatStatPercent(metrics.positiveTargetRate) : "محاسبه نشد"}</strong></div>
    </div>`;
  }).join("");

  document.getElementById("promotionChecks").innerHTML = gate.checks.map(check => `<div class="promotion-check ${check.passed ? "passed" : "blocked"}"><span>${check.passed ? "✓" : "!"}</span><div><strong>${escapeHtml(check.labelFa)}</strong><small>${escapeHtml(check.detailFa)}</small></div></div>`).join("");

  const champion = backtest.candidates.find(item => item.role === "champion");
  const bins = champion?.calibrationBins || [];
  const calibrationMax = Math.max(1, ...bins.flatMap(bin => [Math.abs(bin.predictedMean), Math.abs(bin.observedMean)]));
  document.getElementById("calibrationChart").innerHTML = bins.length ? bins.map(bin => `<div class="calibration-row">
    <div><strong>${escapeHtml(bin.labelFa)}</strong><small>${formatNumber(bin.count)} مشتری</small></div>
    <div class="calibration-series"><span>پیش‌بینی</span><div class="calibration-track"><i style="width:${Math.max(3, Math.abs(bin.predictedMean) / calibrationMax * 100)}%"></i></div><bdi>${formatMoney(bin.predictedMean)}</bdi></div>
    <div class="calibration-series observed"><span>مشاهده</span><div class="calibration-track"><i class="${bin.observedMean < 0 ? "negative" : ""}" style="width:${Math.max(3, Math.abs(bin.observedMean) / calibrationMax * 100)}%"></i></div><bdi>${formatMoney(bin.observedMean)}</bdi></div>
  </div>`).join("") : `<div class="governance-empty"><strong>Calibration هنوز قابل محاسبه نیست.</strong><span>حداقل ۴۰ ردیف و ۱۰ مشاهده در هر بازوی کنترل و اقدام لازم است.</span></div>`;

  document.getElementById("driftFeatures").innerHTML = drift.features.length ? drift.features.slice(0, 6).map(feature => `<div class="drift-row"><span class="drift-dot ${feature.status}"></span><div><strong>${escapeHtml(feature.labelFa)}</strong><small>${escapeHtml(feature.statusFa)} / ${feature.method.toUpperCase()}</small></div><bdi class="number">${formatPValue(feature.value)}</bdi></div>`).join("") : `<div class="governance-empty"><strong>خط مبنا ثبت شد.</strong><span>با ورود فایل بعدی، تغییر توزیع featureها نمایش داده می‌شود.</span></div>`;

  document.getElementById("decisionLedger").innerHTML = ledger.entries.length ? ledger.entries.map(entry => `<div class="ledger-row"><span class="ledger-mark"></span><div><strong>${escapeHtml(entry.decisionFa)}</strong><small>${escapeHtml(entry.rationaleFa)}</small></div><div class="ledger-meta"><time>${new Date(entry.createdAt).toLocaleDateString("fa-IR")}</time><bdi title="${escapeHtml(entry.hash)}">${escapeHtml(entry.hash.slice(0, 19))}…</bdi></div></div>`).join("") : `<div class="governance-empty"><strong>هنوز تصمیمی ثبت نشده است.</strong><span>اولین import داده، زنجیره تصمیم را آغاز می‌کند.</span></div>`;
}

function renderOperations() {
  const role = currentSession?.role || "viewer";
  const roleLabels = { owner: "مالک", admin: "مدیر عملیات", analyst: "تحلیل‌گر", viewer: "مشاهده‌گر" };
  document.getElementById("operationsRole").textContent = `دسترسی: ${roleLabels[role] || role}`;
  const canOperate = ["owner", "admin"].includes(role);
  document.getElementById("memberCreatePanel").hidden = role !== "owner";

  if (!currentOperations) {
    document.getElementById("opsStorage").textContent = "دسترسی محدود";
    document.getElementById("opsStorageNote").textContent = "جزئیات عملیات برای مدیر فضای کاری نمایش داده می‌شود.";
    document.getElementById("opsArtifacts").textContent = role === "viewer" ? "فقط خواندن" : "دسترسی تحلیل‌گر";
    document.getElementById("opsArtifactsNote").textContent = "سطح دسترسی فعلی بر اساس کمترین مجوز لازم تنظیم شده است.";
    document.getElementById("opsJobs").textContent = "پنهان";
    document.getElementById("opsJobsNote").textContent = "صف پردازش فقط برای مدیر عملیات قابل مشاهده است.";
    document.getElementById("opsAudit").textContent = "پنهان";
    document.getElementById("opsAuditNote").textContent = "دفتر ممیزی فقط برای مدیر عملیات قابل مشاهده است.";
    document.getElementById("memberList").innerHTML = `<div class="operations-empty"><strong>نمای مدیریتی محدود است.</strong><span>برای مشاهده اعضا و audit به نقش مدیر عملیات نیاز دارید.</span></div>`;
    document.getElementById("auditList").innerHTML = `<div class="operations-empty"><strong>اصل حداقل دسترسی فعال است.</strong><span>اطلاعات حساس عملیاتی برای این نقش نمایش داده نمی‌شود.</span></div>`;
    return;
  }

  const { metrics, jobs, audit, members, artifacts } = currentOperations;
  const pendingJobs = jobs.filter(item => ["pending", "processing"].includes(item.status)).length;
  document.getElementById("opsStorage").textContent = metrics.storageDriver === "postgres" ? "PostgreSQL" : "JSON محلی";
  document.getElementById("opsStorageNote").textContent = metrics.storageDriver === "postgres" ? "منبع اصلی production و آماده پاسخ" : "فقط برای توسعه محلی";
  document.getElementById("opsArtifacts").textContent = metrics.artifactStorage ? `${formatNumber(artifacts.length)} فایل رمزنگاری‌شده` : "ذخیره‌سازی غیرفعال";
  document.getElementById("opsArtifactsNote").textContent = metrics.artifactStorage ? "AES-256-GCM با کلید خارج از دیتابیس" : "در توسعه، CSV خام پس از تحلیل نگه‌داری نمی‌شود.";
  document.getElementById("opsJobs").textContent = pendingJobs ? `${formatNumber(pendingJobs)} کار در جریان` : "صف خالی";
  document.getElementById("opsJobsNote").textContent = `${formatNumber(jobs.filter(item => item.status === "completed").length)} کار کامل شده است.`;
  document.getElementById("opsAudit").textContent = audit.integrity.valid ? "زنجیره سالم" : "نیازمند بررسی";
  document.getElementById("opsAuditNote").textContent = `${formatNumber(audit.integrity.checked)} رویداد با hash بررسی شد.`;
  document.getElementById("memberCount").textContent = `${formatNumber(members.length)} عضو`;
  document.getElementById("auditIntegrity").textContent = audit.integrity.valid ? "یکپارچگی تأیید شد" : "یکپارچگی مخدوش";
  document.getElementById("memberList").innerHTML = members.map(member => `<div class="operation-row"><span class="operation-avatar">${escapeHtml((member.name || member.email).slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(member.name || member.email)}</strong><small>${escapeHtml(member.email)}</small></div><bdi>${escapeHtml(roleLabels[member.role] || member.role)}</bdi></div>`).join("");
  document.getElementById("auditList").innerHTML = audit.entries.slice(0, 6).map(entry => `<div class="operation-row audit-row"><span class="operation-state"></span><div><strong>${escapeHtml(entry.action.replaceAll("_", " "))}</strong><small>${new Date(entry.createdAt).toLocaleString("fa-IR")}</small></div><bdi>${escapeHtml(entry.actorRole)}</bdi></div>`).join("") || `<div class="operations-empty"><strong>هنوز رویدادی ثبت نشده است.</strong><span>اولین عملیات حساس اینجا ثبت می‌شود.</span></div>`;
  document.getElementById("operations").dataset.operational = String(canOperate);
}

async function loadOperationsData() {
  const role = currentSession?.role;
  if (!["owner", "admin"].includes(role)) return null;
  const [metrics, jobs, audit, members, artifacts] = await Promise.all([
    apiRequest("/api/ops/metrics"),
    apiRequest("/api/ops/jobs"),
    apiRequest("/api/audit-log"),
    apiRequest("/api/access/members"),
    apiRequest("/api/artifacts")
  ]);
  return { metrics, jobs, audit, members, artifacts };
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
  const [analysis, overview, customerAnalysis, history, pilotState, governance, operations] = await Promise.all([
    apiRequest("/api/campaigns/current"),
    apiRequest("/api/decision-engine/overview"),
    apiRequest("/api/customers/current"),
    apiRequest("/api/analyses/history"),
    apiRequest("/api/pilot/workspace"),
    apiRequest("/api/model-governance/overview"),
    loadOperationsData()
  ]);
  currentAnalysis = analysis;
  currentOverview = overview;
  currentCustomerAnalysis = customerAnalysis;
  currentHistory = history;
  currentPilotState = pilotState;
  currentGovernance = governance;
  currentOperations = operations;
  renderDashboard();
  renderCustomerProduct();
  renderPilotState();
  renderHistory();
  renderModelGovernance();
  renderOperations();
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
    currentSession = session;
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
      const result = await apiRequest("/api/imports/csv", { method: "POST", body: JSON.stringify({
        name: document.getElementById("campaignUploadName").value,
        csvText: await file.text(),
        assignmentMethod: "observed_historical",
        outcomeWindowDays: 30
      }) });
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
      const experimentId = currentPilotState?.experiment?.id;
      if (!experimentId || !currentPilotState.experiment.acceptsOutcome) {
        throw new Error("ابتدا فایل مشتری را وارد کنید تا Experiment Registry ساخته شود.");
      }
      const result = await apiRequest("/api/outcomes/import", { method: "POST", body: JSON.stringify({
        name: document.getElementById("outcomeUploadName").value,
        csvText: await file.text(),
        experimentId
      }) });
      await loadDashboard();
      setMessage("outcomeMessage", `${result.integrity.statusFa}؛ ${result.summary.recommendationFa}`, result.integrity.decisionEligible ? "success" : "error");
    } catch (error) {
      setMessage("outcomeMessage", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false);
    }
  });
}

function setupActions() {
  document.getElementById("memberCreateForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    setButtonBusy(button, true, "در حال افزودن...");
    try {
      await apiRequest("/api/access/members", { method: "POST", body: JSON.stringify({
        name: document.getElementById("memberName").value,
        email: document.getElementById("memberEmail").value,
        password: document.getElementById("memberPassword").value,
        role: document.getElementById("memberRole").value
      }) });
      event.currentTarget.reset();
      currentOperations = await loadOperationsData();
      renderOperations();
      setMessage("memberMessage", "عضو جدید با سطح دسترسی انتخاب‌شده اضافه شد.", "success");
    } catch (error) {
      setMessage("memberMessage", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
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
  document.getElementById("registerExperimentButton").addEventListener("click", async event => {
    const button = event.currentTarget;
    setButtonBusy(button, true, "در حال ساخت assignment...");
    try {
      const experiment = await apiRequest("/api/experiments/register", {
        method: "POST",
        body: JSON.stringify({ holdoutRate: 0.2, outcomeWindowDays: 30 })
      });
      await loadDashboard();
      setMessage("experimentMessage", `پایلوت ${experiment.id} ثبت و Analysis Plan قفل شد.`, "success");
    } catch (error) {
      setMessage("experimentMessage", error.message, "error");
    } finally {
      setButtonBusy(button, false);
      renderPilotState();
    }
  });
  document.getElementById("downloadAssignmentsButton").addEventListener("click", async () => {
    const response = await fetch("/api/experiments/current/assignments.csv", { credentials: "same-origin" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return setMessage("experimentMessage", payload.error?.message || "فایل تخصیص آماده نشد.", "error");
    }
    downloadBlob(await response.blob(), "marginlift-experiment-assignments.csv");
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
