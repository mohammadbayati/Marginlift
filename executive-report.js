const faReport = new Intl.NumberFormat("fa-IR");

function formatNumber(value) {
  return faReport.format(Number(value || 0));
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000) return `${formatNumber(Math.round(number / 1000000))} میلیون تومان`;
  return `${formatNumber(Math.round(number))} تومان`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function fetchJson(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "گزارش آماده نشد.");
  return payload.data;
}

function decisionStatus(state) {
  return state.outcome?.summary?.decisionStatus || "pending";
}

function decisionLabel(status) {
  if (status === "scale") return "گسترش کنترل‌شده";
  if (status === "stop") return "توقف اجرای گسترده";
  if (status === "needs_review") return "بازبینی قبل از افزایش بودجه";
  return "در انتظار نتیجه پایلوت";
}

function decisionTone(status) {
  if (status === "scale") return "positive";
  if (status === "stop") return "negative";
  if (status === "needs_review") return "review";
  return "pending";
}

function ceoSummary(status) {
  if (status === "scale") {
    return "پایلوت اثر مالی مثبت نشان داده است. پیشنهاد می‌شود اجرای بعدی فقط روی سگمنت‌های مشابه، با سقف بودجه مشخص و نگه‌داشتن گروه کنترل انجام شود.";
  }
  if (status === "stop") {
    return "پایلوت اثر مالی قابل دفاع ایجاد نکرده است. افزایش بودجه در این شرایط ریسک هدررفت مشوق را بالا می‌برد و اجرای گسترده توصیه نمی‌شود.";
  }
  if (status === "needs_review") {
    return "پایلوت سود مثبت داشته، اما نتیجه واقعی فاصله معناداری با برآورد اولیه دارد. تصمیم مدیریتی این نیست که بودجه بیشتر آزاد شود؛ ابتدا باید سیاست تخصیص مشوق، کیفیت داده و طراحی گروه کنترل بازبینی شود.";
  }
  return "داده آماده شده، اما تا قبل از دریافت نتیجه واقعی، هیچ تصمیم بودجه‌ای نباید به‌عنوان اثر تأییدشده ارائه شود.";
}

function marketingSummary(status) {
  if (status === "scale") {
    return "کمپین در نمونه فعلی توانسته رفتار مشتری را با هزینه قابل دفاع تغییر دهد. اجرای بعدی باید روی همان سگمنت‌های رفتاری و با پیام مشابه انجام شود.";
  }
  if (status === "stop") {
    return "پیام، سگمنت یا مقدار مشوق فعلی رفتار مشتری را به اندازه کافی تغییر نداده است. کمپین بعدی باید با فرضیه تازه و مشوق کمتر یا غیرتخفیفی طراحی شود.";
  }
  if (status === "needs_review") {
    return "کمپین کاملاً شکست نخورده، اما برای اجرای بزرگ‌تر قابل اتکا نیست. باید روشن شود اختلاف از سگمنت‌بندی، مقدار مشوق، زمان‌بندی کمپین یا کیفیت ثبت نتیجه آمده است.";
  }
  return "قبل از اجرای گسترده، تیم مارکتینگ باید تعریف موفقیت، پنجره سنجش نتیجه و گروه کنترل را نهایی کند.";
}

function riskNotes(state) {
  const notes = [];
  const status = decisionStatus(state);
  if (state.readiness.status !== "ready") {
    notes.push("داده برای ادعای اثر افزایشی کامل نیست و خروجی باید فقط diagnostic تلقی شود.");
  }
  if (!state.outcome) {
    notes.push("تا قبل از نتیجه واقعی، عددهای مالی برآورد هستند و نباید مبنای افزایش بودجه شوند.");
  }
  if (status === "needs_review") {
    notes.push("شکاف منفی بین پیش‌بینی و نتیجه واقعی نشان می‌دهد سگمنت هدف، مقدار مشوق یا کیفیت ثبت نتیجه نیاز به بازبینی دارد.");
  }
  if (state.outcome?.summary?.controlUsers === 0) {
    notes.push("بدون گروه کنترل، اثر افزایشی قابل دفاع نیست.");
  }
  if ((state.outcome?.summary?.treatmentUsers || 0) < 100) {
    notes.push("این خروجی برای نمایش محصول و تصمیم پایلوت مناسب است؛ برای تصمیم تجاری واقعی باید روی نمونه بزرگ‌تر اجرا شود.");
  }
  return notes.length ? notes : ["ریسک اصلی پایین است، اما اجرای گسترده باید مرحله‌ای و با سقف بودجه انجام شود."];
}

function nextActions(status) {
  if (status === "scale") {
    return [
      "بودجه مرحله بعد را محدود و از قبل تصویب کنید.",
      "گروه کنترل را در اجرای بعدی نگه دارید.",
      "گزارش هفتگی سود افزایشی، نرخ تبدیل و هزینه مشوق را برای CMO و CFO ارسال کنید."
    ];
  }
  if (status === "stop") {
    return [
      "اجرای گسترده این کمپین را متوقف کنید.",
      "سگمنت‌هایی را که مشوق گرفته‌اند اما رفتارشان تغییر نکرده بررسی کنید.",
      "یک پیشنهاد جدید با مشوق کمتر یا پیام غیرتخفیفی طراحی کنید."
    ];
  }
  if (status === "needs_review") {
    return [
      "کیفیت گروه کنترل، نسبت نمونه و پنجره سنجش نتیجه را بررسی کنید.",
      "سگمنت هدف و مقدار مشوق را قبل از اجرای بزرگ‌تر بازبینی کنید.",
      "یک پایلوت کوچک‌تر با سیاست اصلاح‌شده و معیار موفقیت روشن اجرا کنید."
    ];
  }
  return [
    "کمپین را با گروه کنترل ثابت اجرا کنید.",
    "exposure و نتیجه را در سطح مشتری ثبت کنید.",
    "پس از بسته‌شدن پنجره سنجش، گزارش نهایی را صادر کنید."
  ];
}

function renderKpis(state) {
  const snapshot = state.savingsSnapshot;
  const outcome = state.outcome?.summary;
  const cards = [
    ["بودجه قابل بازتخصیص", formatMoney(snapshot.avoidableIncentiveCost), "فرصت کاهش هدررفت مشوق"],
    ["سود مشاهده‌شده", formatMoney(snapshot.expectedIncrementalProfit), snapshot.claimLevelFa],
    ["بازده پایلوت", `${formatNumber(snapshot.pilotRoi)}×`, `اعتماد: ${snapshot.confidenceFa}`],
    ["شکاف برآورد", outcome ? formatMoney(outcome.predictionGap) : "در انتظار نتیجه", "معیار اصلی برای تصمیم افزایش بودجه"]
  ];
  document.getElementById("reportKpis").innerHTML = `<span class="mini-label">Financial Snapshot</span><h2>عددهایی که مدیر مالی می‌پرسد</h2>` + cards.map(([label, value, note]) => `
    <div class="report-kpi-row">
      <span>${escapeHtml(label)}</span>
      <strong class="number">${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </div>
  `).join("");
}

function renderVarianceChart(state) {
  const snapshot = state.savingsSnapshot;
  const outcome = state.outcome?.summary;
  const predicted = Math.max(0, outcome?.predictedIncrementalProfit || snapshot.expectedIncrementalProfit || 0);
  const observed = Math.max(0, outcome?.observedIncrementalProfit || snapshot.expectedIncrementalProfit || 0);
  const maxValue = Math.max(predicted, observed, 1);
  const rows = [
    ["برآورد اولیه", predicted, "expected"],
    ["نتیجه مشاهده‌شده", observed, "observed"]
  ];
  const gap = outcome ? outcome.observedIncrementalProfit - outcome.predictedIncrementalProfit : 0;
  document.getElementById("varianceChart").innerHTML = `
    <div class="chart-bars">
      ${rows.map(([label, value, kind]) => `
        <div class="chart-bar-row ${kind}">
          <div class="chart-bar-label"><span>${escapeHtml(label)}</span><strong class="number">${escapeHtml(formatMoney(value))}</strong></div>
          <div class="chart-track"><span style="width:${Math.max(8, Math.round((value / maxValue) * 100))}%"></span></div>
        </div>
      `).join("")}
    </div>
    <div class="chart-gap ${gap < 0 ? "negative" : "positive"}">
      <span>شکاف تصمیم</span>
      <strong class="number">${escapeHtml(outcome ? formatMoney(gap) : "در انتظار نتیجه")}</strong>
      <small>${gap < 0 ? "برای افزایش بودجه کافی نیست" : "برای اجرای محدود قابل بررسی است"}</small>
    </div>
  `;
}

function renderBridgeChart(state) {
  const snapshot = state.savingsSnapshot;
  const outcome = state.outcome?.summary;
  const items = [
    ["بودجه قابل بازتخصیص", snapshot.avoidableIncentiveCost || 0, "neutral"],
    ["سود مشاهده‌شده", snapshot.expectedIncrementalProfit || 0, "positive"],
    ["شکاف برآورد", outcome?.predictionGap || 0, "negative"]
  ];
  const maxValue = Math.max(...items.map(item => Math.abs(item[1])), 1);
  document.getElementById("bridgeChart").innerHTML = items.map(([label, value, tone]) => `
    <div class="bridge-item ${tone}">
      <div class="bridge-value">
        <span>${escapeHtml(label)}</span>
        <strong class="number">${escapeHtml(formatMoney(value))}</strong>
      </div>
      <div class="bridge-column"><span style="height:${Math.max(14, Math.round((Math.abs(value) / maxValue) * 100))}%"></span></div>
      <small>${tone === "negative" ? "نیازمند بازبینی" : tone === "positive" ? "اثر مثبت ثبت‌شده" : "فرصت کاهش هزینه"}</small>
    </div>
  `).join("");
}

function renderConfidenceGauge(state, status) {
  const score = status === "scale" ? 78 : status === "needs_review" ? 46 : status === "stop" ? 28 : 58;
  document.getElementById("confidenceGauge").innerHTML = `
    <div class="gauge-ring" style="--score:${score}">
      <strong class="number">${formatNumber(score)}٪</strong>
      <span>${escapeHtml(state.savingsSnapshot.confidenceFa)}</span>
    </div>
    <p>${status === "needs_review" ? "نتیجه مثبت است، اما اختلاف با برآورد اولیه اجازه افزایش بودجه فوری نمی‌دهد." : "سطح اعتماد بر اساس کیفیت داده، گروه کنترل و نتیجه پایلوت محاسبه شده است."}</p>
  `;
}

function renderSteps(state) {
  document.getElementById("workspaceStepsReport").innerHTML = state.workspace.steps.map(step => `
    <div class="report-step ${step.complete ? "complete" : ""}">
      <span aria-hidden="true">${step.complete ? "✓" : "•"}</span>
      <strong>${escapeHtml(step.labelFa)}</strong>
      <small>${escapeHtml(step.statusFa)}</small>
    </div>
  `).join("");
}

function renderLists(state, status) {
  document.getElementById("riskList").innerHTML = riskNotes(state).map(item => `<li>${escapeHtml(item)}</li>`).join("");
  document.getElementById("nextActionList").innerHTML = nextActions(status).map(item => `<li>${escapeHtml(item)}</li>`).join("");
}

async function downloadMarkdown() {
  const response = await fetch("/api/pilot/readout.md", { credentials: "same-origin" });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "marginlift-pilot-readout.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function initReport() {
  try {
    const [session, state] = await Promise.all([
      fetchJson("/api/session"),
      fetchJson("/api/pilot/workspace")
    ]);
    const status = decisionStatus(state);
    document.getElementById("reportCoverText").textContent = `گزارش تصمیم برای ${session.organization.name}: کاهش هدررفت مشوق، سنجش نتیجه پایلوت و تعیین مسیر افزایش بودجه.`;
    document.getElementById("reportDecisionCard").className = `report-decision-card ${decisionTone(status)}`;
    document.getElementById("reportDecisionCard").innerHTML = `<span>پیشنهاد تصمیم</span><strong>${escapeHtml(decisionLabel(status))}</strong><small>${escapeHtml(state.savingsSnapshot.confidenceFa)} / ${escapeHtml(state.savingsSnapshot.claimLevelFa)}</small>`;
    document.getElementById("ceoSummary").textContent = ceoSummary(status);
    document.getElementById("marketingSummary").textContent = marketingSummary(status);
    document.getElementById("evidenceBadge").textContent = state.savingsSnapshot.claimLevelFa;
    document.getElementById("confidenceBadge").textContent = `اعتماد: ${state.savingsSnapshot.confidenceFa}`;
    document.getElementById("workspaceBadge").textContent = state.workspace.overallStatusFa;
    renderKpis(state);
    renderVarianceChart(state);
    renderBridgeChart(state);
    renderConfidenceGauge(state, status);
    renderSteps(state);
    renderLists(state, status);
  } catch (error) {
    document.getElementById("executiveReport").innerHTML = `<section class="panel report-error"><h1>گزارش آماده نشد</h1><p>${escapeHtml(error.message)}</p><a class="primary-button" href="/login">ورود به پنل</a></section>`;
  }
}

document.getElementById("printReportButton").addEventListener("click", () => window.print());
document.getElementById("downloadMarkdownButton").addEventListener("click", downloadMarkdown);
initReport();
