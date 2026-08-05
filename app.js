const fa = new Intl.NumberFormat("fa-IR");

const colors = {
  control: "#315b9a",
  push_only: "#087f8c",
  small_discount: "#218653",
  high_incentive: "#c98212",
  useful: "#15af60",
  waste: "#c9463d",
  neutral: "#6a4c93",
  high: "#c98212"
};

const fallbackAnalysis = {
  campaign: {
    name: "بازگشت با کش‌بک",
    audience: 10000,
    totalSpend: 420000000,
    reportedRevenue: 1850000000,
    nonIncrementalSpend: 118000000,
    nextSavings: 82000000,
    revenuePreserved: 96,
    marginLift: 14,
    confidence: 84
  },
  treatments: [
    { key: "control", labelFa: "گروه کنترل", conversion: 8.4, costPerUser: 0 },
    { key: "push_only", labelFa: "فقط پوش", conversion: 9.8, costPerUser: 0 },
    { key: "small_discount", labelFa: "تخفیف کوچک", conversion: 11.6, costPerUser: 25000 },
    { key: "high_incentive", labelFa: "مشوق قوی", conversion: 13.1, costPerUser: 75000 }
  ],
  segments: [
    {
      nameFa: "کاربران وفادار اخیر",
      users: 3100,
      actionFa: "بدون پیشنهاد",
      uplift: 1.1,
      reasonFa: "احتمال خرید بدون تخفیف بالاست و مشوق پولی حاشیه سود را کم می‌کند."
    },
    {
      nameFa: "کاربران خاموش اما قابل‌فعال‌سازی",
      users: 2400,
      actionFa: "فقط پوش",
      uplift: 2.0,
      reasonFa: "پیام کم‌هزینه برای ساختن اثر افزایشی کافی است."
    },
    {
      nameFa: "کاربران حساس به تخفیف",
      users: 3200,
      actionFa: "تخفیف کوچک",
      uplift: 5.8,
      reasonFa: "واکنش افزایشی، پیشنهاد متوسط را توجیه می‌کند."
    },
    {
      nameFa: "کاربران غیرفعال باارزش بالا",
      users: 1300,
      actionFa: "مشوق قوی",
      uplift: 7.4,
      reasonFa: "اثر افزایشی و ارزش سفارش بالاتر، مشوق قوی‌تر را توجیه می‌کند."
    }
  ],
  actions: [
    {
      titleFa: "بدون پیشنهاد",
      users: 3100,
      cost: 0,
      revenue: 580000000,
      noteFa: "به کاربرانی که احتمالاً بدون تخفیف هم خرید می‌کنند، تخفیف نده."
    },
    {
      titleFa: "فقط پوش",
      users: 2400,
      cost: 0,
      revenue: 310000000,
      noteFa: "قبل از خرج‌کردن مشوق پولی، از کانال رایگان استفاده کن."
    },
    {
      titleFa: "تخفیف کوچک",
      users: 3200,
      cost: 80000000,
      revenue: 720000000,
      noteFa: "کاربران قابل‌متقاعدسازی را با هزینه کنترل‌شده هدف بگیر."
    },
    {
      titleFa: "مشوق قوی",
      users: 1300,
      cost: 97500000,
      revenue: 390000000,
      noteFa: "مشوق قوی را برای کاربران غیرفعال اما باارزش بالا نگه دار."
    }
  ],
  wasteItems: [
    { label: "مشوق مفید", value: 48, colorKey: "useful" },
    { label: "کاربران قطعی", value: 28, colorKey: "high" },
    { label: "هدررفت کم‌واکنش", value: 24, colorKey: "waste" }
  ],
  insight: "۲۸٪ از هزینه مشوق برای کاربرانی خرج‌شده که احتمالاً بدون تخفیف هم خرید می‌کردند."
};

let currentAnalysis = fallbackAnalysis;
let currentEventSummary = { totalEvents: 0, funnel: [], latest: [] };
let activeSession = null;

function formatMoney(value) {
  if (value >= 1000000000) return `${fa.format(Number((value / 1000000000).toFixed(2)))} میلیارد تومان`;
  return `${fa.format(Math.round(value / 1000000))} میلیون تومان`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "درخواست ناموفق بود.");
  }
  return payload.data;
}

function trackEvent(event, properties = {}) {
  const payload = JSON.stringify({
    event,
    path: window.location.pathname,
    properties
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/events", blob);
    return;
  }

  fetch("/api/events", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: payload
  }).catch(() => {});
}

function setText(id, value) {
  const target = document.getElementById(id);
  if (target) target.textContent = value;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "زمان نامشخص";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function renderHeroMetrics() {
  const target = document.getElementById("heroMetrics");
  if (!target) return;
  const campaign = currentAnalysis.campaign;
  target.innerHTML = [
    ["هدررفت تخمینی", formatMoney(campaign.nonIncrementalSpend)],
    ["صرفه‌جویی کمپین بعدی", formatMoney(campaign.nextSavings)],
    ["درآمد حفظ‌شده", `${fa.format(campaign.revenuePreserved)}٪`]
  ].map(([label, value]) => `
    <div class="hero-metric">
      <strong class="number">${value}</strong>
      <span>${label}</span>
    </div>
  `).join("");
}

function renderMetricGrid() {
  const campaign = currentAnalysis.campaign;
  const cards = [
    ["مخاطبان کمپین", fa.format(campaign.audience), "کاربر در کمپین بازگشت تاریخی"],
    ["هزینه مشوق", formatMoney(campaign.totalSpend), "هزینه کش‌بک و تخفیف در سیاست فعلی"],
    ["درآمد گزارش‌شده", formatMoney(campaign.reportedRevenue), "فروش ثبت‌شده پس از اجرای کمپین"],
    ["هدررفت تخمینی", formatMoney(campaign.nonIncrementalSpend), "بخشی از مشوق که احتمالاً خرید تازه نساخته است"]
  ];

  document.getElementById("metricGrid").innerHTML = cards.map(([label, value, note]) => `
    <div class="metric-card">
      <span>${label}</span>
      <strong class="number">${value}</strong>
      <small>${note}</small>
    </div>
  `).join("");
}

function renderTreatmentChart() {
  const treatments = currentAnalysis.treatments;
  const max = Math.max(...treatments.map(item => item.conversion));
  document.getElementById("treatmentChart").innerHTML = treatments.map(item => {
    const width = max > 0 ? (item.conversion / max) * 100 : 0;
    const color = colors[item.key] || colors.neutral;
    return `
      <div class="bar-row">
        <div class="bar-label">${item.labelFa}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:${color}"></div></div>
        <div class="bar-value number">${fa.format(item.conversion)}٪</div>
      </div>
    `;
  }).join("");
}

function renderWaste() {
  const items = currentAnalysis.wasteItems || fallbackAnalysis.wasteItems;

  document.getElementById("wasteLegend").innerHTML = items.map(item => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${colors[item.colorKey] || colors.neutral}"></span>
      <span class="legend-label">${item.label}</span>
      <span class="legend-value number">${fa.format(item.value)}٪</span>
    </div>
  `).join("");
}

function renderGuardrails() {
  const guardrails = currentAnalysis.guardrails || [
    {
      labelFa: "کیفیت داده",
      valueFa: "نمونه",
      status: "pass",
      noteFa: "داده نمونه با گروه کنترل آماده است."
    }
  ];

  document.getElementById("guardrailCards").innerHTML = guardrails.map(item => `
    <div class="guardrail-card ${item.status || "pass"}">
      <span>${item.labelFa}</span>
      <strong class="number">${item.valueFa}</strong>
      <p>${item.noteFa}</p>
    </div>
  `).join("");
}

function renderSegments() {
  document.getElementById("segmentRows").innerHTML = currentAnalysis.segments.map(segment => `
    <tr>
      <td><strong>${segment.nameFa}</strong></td>
      <td class="number">${fa.format(segment.users)}</td>
      <td>${segment.actionFa}</td>
      <td class="number">${fa.format(segment.uplift)} واحد</td>
      <td class="number">${formatInterval(segment.ciLow, segment.ciHigh)}</td>
      <td>${segment.confidenceLevel || "متوسط"}</td>
      <td>${segment.reasonFa}</td>
    </tr>
  `).join("");
}

function formatInterval(low, high) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "—";
  return `${fa.format(low)} تا ${fa.format(high)}`;
}

function renderActions() {
  document.getElementById("actionCards").innerHTML = currentAnalysis.actions.map(action => `
    <div class="action-card" style="border-top: 5px solid ${actionColor(action.titleFa)}">
      <h4>${action.titleFa}</h4>
      <strong class="number">${fa.format(action.users)}</strong>
      <span>کاربر</span>
      <p><b>هزینه:</b> ${formatMoney(action.cost)}</p>
      <p><b>درآمد محافظت‌شده:</b> ${formatMoney(action.revenue)}</p>
      <p>${action.noteFa}</p>
    </div>
  `).join("");
}

function renderSummary() {
  const campaign = currentAnalysis.campaign;
  const cards = [
    ["کاهش هزینه مشوق", `${fa.format(campaign.totalSpend > 0 ? Math.round((campaign.nextSavings / campaign.totalSpend) * 1000) / 10 : 0)}٪`],
    ["درآمد حفظ‌شده", `${fa.format(campaign.revenuePreserved)}٪`],
    ["بهبود حاشیه سود", `${fa.format(campaign.marginLift)}٪`]
  ];

  document.getElementById("summaryGrid").innerHTML = cards.map(([label, value]) => `
    <div class="summary-card">
      <span>${label}</span>
      <strong class="number">${value}</strong>
    </div>
  `).join("");
}

function renderEventSummary(error) {
  const funnelTarget = document.getElementById("eventFunnel");
  const activityTarget = document.getElementById("activityList");
  if (!funnelTarget || !activityTarget) return;

  if (error) {
    funnelTarget.innerHTML = "";
    activityTarget.innerHTML = `<div class="activity-empty">خلاصه فعالیت فعلاً در دسترس نیست.</div>`;
    return;
  }

  const funnel = currentEventSummary.funnel.length ? currentEventSummary.funnel : [
    { labelFa: "بازدید داشبورد", count: 0 },
    { labelFa: "ورود موفق", count: 0 },
    { labelFa: "تحلیل CSV", count: 0 },
    { labelFa: "خروجی گزارش", count: 0 }
  ];

  funnelTarget.innerHTML = funnel.map(item => `
    <article class="funnel-card">
      <span>${item.labelFa}</span>
      <strong class="number">${fa.format(item.count || 0)}</strong>
    </article>
  `).join("");

  if (!currentEventSummary.latest.length) {
    activityTarget.innerHTML = `
      <div class="activity-empty">
        هنوز فعالیت قابل‌نمایش ثبت نشده است. ورود، آپلود CSV یا دریافت گزارش این بخش را زنده می‌کند.
      </div>
    `;
    return;
  }

  activityTarget.innerHTML = currentEventSummary.latest.map(item => {
    const properties = Object.entries(item.properties || {})
      .slice(0, 2)
      .map(([key, value]) => `${key}: ${value}`)
      .join("، ");
    return `
      <article class="activity-item">
        <div>
          <strong>${item.labelFa || item.event}</strong>
          <span>${properties || "بدون جزئیات اضافی"}</span>
        </div>
        <time class="number" datetime="${item.createdAt}">${formatDateTime(item.createdAt)}</time>
      </article>
    `;
  }).join("");
}

function renderDashboard() {
  const campaign = currentAnalysis.campaign;
  setText("statusCampaignName", campaign.name || "کمپین تحلیل‌شده");
  setText("campaignMode", currentAnalysis.isDemo ? "داده نمونه برای دمو" : "تحلیل ذخیره‌شده روی سرور");
  setText("roiSavings", formatMoney(campaign.nextSavings));
  setText("roiPreserved", `با حفظ ${fa.format(campaign.revenuePreserved)}٪ درآمد گزارش‌شده`);
  setText("insightHeadline", currentAnalysis.insight || fallbackAnalysis.insight);
  setText("confidenceValue", `${fa.format(campaign.confidence || 72)}٪`);
  setText("analysisPeriod", currentAnalysis.isDemo ? "داده نمونه" : "آخرین فایل واردشده");
  renderHeroMetrics();
  renderMetricGrid();
  renderGuardrails();
  renderTreatmentChart();
  renderWaste();
  renderSegments();
  renderActions();
  renderSummary();
  renderEventSummary();
}

function actionColor(actionFa) {
  if (actionFa === "فقط پوش") return colors.push_only;
  if (actionFa === "تخفیف کوچک") return colors.small_discount;
  if (actionFa === "مشوق قوی") return colors.high_incentive;
  return colors.neutral;
}

function setAuthMode(mode) {
  document.querySelectorAll("[data-auth-tab]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.authTab === mode);
  });
  document.getElementById("loginForm").classList.toggle("active", mode === "login");
  document.getElementById("signupForm").classList.toggle("active", mode === "signup");
}

function showDashboard(session) {
  activeSession = session || activeSession;
  if (activeSession?.organization?.name) {
    setText("workspaceName", activeSession.organization.name);
  }
  document.getElementById("authShell").classList.add("is-hidden");
  document.getElementById("appShell").classList.remove("is-hidden");
}

function showAuth() {
  activeSession = null;
  document.getElementById("appShell").classList.add("is-hidden");
  document.getElementById("authShell").classList.remove("is-hidden");
}

async function loadCurrentCampaign() {
  const analysis = await apiRequest("/api/campaigns/current");
  currentAnalysis = analysis;
  renderDashboard();
  await loadEventSummary();
}

async function loadEventSummary() {
  try {
    currentEventSummary = await apiRequest("/api/events/summary");
    renderEventSummary();
  } catch (error) {
    renderEventSummary(error);
  }
}

function setMessage(id, text, kind = "neutral") {
  const target = document.getElementById(id);
  if (!target) return;
  target.textContent = text;
  target.dataset.kind = kind;
}

function initAuth() {
  document.querySelectorAll("[data-auth-tab]").forEach(tab => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authTab));
  });

  document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    setMessage("loginMessage", "در حال ورود…");
    try {
      const session = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("loginEmail").value.trim(),
          password: document.getElementById("loginPassword").value
        })
      });
      trackEvent("login_completed", { method: "email" });
      showDashboard(session);
      await loadCurrentCampaign();
    } catch (error) {
      setMessage("loginMessage", error.message, "error");
    }
  });

  document.getElementById("signupForm").addEventListener("submit", async event => {
    event.preventDefault();
    setMessage("signupMessage", "در حال ساخت فضای کاری…");
    try {
      const session = await apiRequest("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          companyName: document.getElementById("companyName").value.trim(),
          email: document.getElementById("signupEmail").value.trim(),
          password: document.getElementById("signupPassword").value
        })
      });
      trackEvent("signup_completed", { method: "email" });
      showDashboard(session);
      await loadCurrentCampaign();
    } catch (error) {
      setMessage("signupMessage", error.message, "error");
    }
  });

  document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
    } finally {
      showAuth();
    }
  });

  document.getElementById("exportReportButton").addEventListener("click", exportReport);
}

function initUpload() {
  document.getElementById("campaignUploadForm").addEventListener("submit", async event => {
    event.preventDefault();
    const file = document.getElementById("campaignCsvFile").files[0];
    if (!file) {
      setMessage("uploadMessage", "فایل CSV را انتخاب کنید.", "error");
      return;
    }

    setMessage("uploadMessage", "در حال تحلیل کمپین…");
    try {
      const csvText = await file.text();
      const analysis = await apiRequest("/api/campaigns/import", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("campaignUploadName").value.trim(),
          csvText
        })
      });
      currentAnalysis = analysis;
      renderDashboard();
      trackEvent("campaign_imported", {
        campaign_name: document.getElementById("campaignUploadName").value.trim(),
        has_file: true
      });
      await loadEventSummary();
      setMessage("uploadMessage", "تحلیل کمپین ذخیره شد و داشبورد به‌روزرسانی شد.", "success");
    } catch (error) {
      setMessage("uploadMessage", error.message, "error");
    }
  });
}

async function exportReport() {
  trackEvent("report_export_started", {
    campaign_name: currentAnalysis.campaign?.name || "unknown"
  });
  try {
    const response = await fetch("/api/campaigns/current/report", {
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error("گزارش آماده نشد.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "marginlift-campaign-report.md";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    await loadEventSummary();
  } catch (error) {
    window.alert(error.message);
  }
}

async function initSession() {
  renderDashboard();
  trackEvent("app_loaded", { surface: "dashboard" });
  try {
    const session = await apiRequest("/api/session");
    if (session) {
      showDashboard(session);
      await loadCurrentCampaign();
    } else {
      showAuth();
    }
  } catch (error) {
    showAuth();
    setMessage("loginMessage", "برای استفاده از محصول واقعی، دمو را با npm start اجرا کنید.", "error");
  }
}

function init() {
  initAuth();
  initUpload();
  initSession();
}

init();
