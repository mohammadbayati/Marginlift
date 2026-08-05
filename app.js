const fa = new Intl.NumberFormat("fa-IR");

const colors = {
  control: "#315b9a",
  push: "#087f8c",
  small: "#218653",
  high: "#c98212",
  useful: "#218653",
  waste: "#c9463d",
  neutral: "#6a4c93"
};

const campaign = {
  audience: 10000,
  totalSpend: 420000000,
  reportedRevenue: 1850000000,
  nonIncrementalSpend: 118000000,
  nextSavings: 82000000,
  revenuePreserved: 96,
  marginLift: 14
};

const sessionKey = "marginlift-demo-session";

const treatments = [
  { name: "Control", labelFa: "گروه کنترل", key: "control", conversion: 8.4, costPerUser: 0 },
  { name: "Push only", labelFa: "فقط پوش", key: "push", conversion: 9.8, costPerUser: 0 },
  { name: "Small discount", labelFa: "تخفیف کوچک", key: "small", conversion: 11.6, costPerUser: 25000 },
  { name: "High incentive", labelFa: "مشوق قوی", key: "high", conversion: 13.1, costPerUser: 75000 }
];

const segments = [
  {
    name: "Recent loyal users",
    nameFa: "کاربران وفادار اخیر",
    users: 3100,
    action: "No offer",
    actionFa: "بدون پیشنهاد",
    uplift: 1.1,
    reason: "High purchase probability even without discount.",
    reasonFa: "احتمال خرید حتی بدون تخفیف بالاست."
  },
  {
    name: "Sleeping but reachable",
    nameFa: "کاربران خاموش اما قابل‌فعال‌سازی",
    users: 2400,
    action: "Push only",
    actionFa: "فقط پوش",
    uplift: 2.0,
    reason: "Low-cost message creates enough lift.",
    reasonFa: "پیام کم‌هزینه برای ساختن اثر افزایشی کافی است."
  },
  {
    name: "Discount-sensitive users",
    nameFa: "کاربران حساس به تخفیف",
    users: 3200,
    action: "Small discount",
    actionFa: "تخفیف کوچک",
    uplift: 5.8,
    reason: "Incremental response justifies a moderate offer.",
    reasonFa: "واکنش افزایشی، پیشنهاد متوسط را توجیه می‌کند."
  },
  {
    name: "High-value dormant users",
    nameFa: "کاربران غیرفعال باارزش بالا",
    users: 1300,
    action: "High incentive",
    actionFa: "مشوق قوی",
    uplift: 7.4,
    reason: "میانگین ارزش سفارش و حاشیه سود بالاتر می‌تواند مشوق قوی‌تر را توجیه کند.",
    reasonFa: "میانگین ارزش سفارش و حاشیه سود بالاتر می‌تواند مشوق قوی‌تر را توجیه کند."
  }
];

const actions = [
  {
    title: "No offer",
    titleFa: "بدون پیشنهاد",
    users: 3100,
    cost: 0,
    revenue: 580000000,
    color: colors.neutral,
    note: "Avoid discounting sure things.",
    noteFa: "به کاربرانی که احتمالاً بدون تخفیف هم خرید می‌کنند، تخفیف نده."
  },
  {
    title: "Push only",
    titleFa: "فقط پوش",
    users: 2400,
    cost: 0,
    revenue: 310000000,
    color: colors.push,
    note: "Use a free channel before paid incentives.",
    noteFa: "قبل از خرج‌کردن مشوق پولی، از کانال رایگان استفاده کن."
  },
  {
    title: "Small discount",
    titleFa: "تخفیف کوچک",
    users: 3200,
    cost: 80000000,
    revenue: 720000000,
    color: colors.small,
    note: "کاربران قابل‌متقاعدسازی را با هزینه کنترل‌شده هدف بگیر.",
    noteFa: "کاربران قابل‌متقاعدسازی را با هزینه کنترل‌شده هدف بگیر."
  },
  {
    title: "High incentive",
    titleFa: "مشوق قوی",
    users: 1300,
    cost: 97500000,
    revenue: 390000000,
    color: colors.high,
    note: "Reserve stronger offers for high-value dormant users.",
    noteFa: "مشوق قوی را برای کاربران غیرفعال اما باارزش بالا نگه دار."
  }
];

function formatMoney(value) {
  if (value >= 1000000000) return `${fa.format(Number((value / 1000000000).toFixed(2)))} میلیارد تومان`;
  return `${fa.format(Math.round(value / 1000000))} میلیون تومان`;
}

function renderHeroMetrics() {
  const target = document.getElementById("heroMetrics");
  if (!target) return;
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
  const cards = [
    ["مخاطبان کمپین", fa.format(campaign.audience), "کاربر در کمپین بازگشت تاریخی"],
    ["هزینه مشوق", formatMoney(campaign.totalSpend), "هزینه کش‌بک و تخفیف"],
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
  const max = Math.max(...treatments.map(item => item.conversion));
  document.getElementById("treatmentChart").innerHTML = treatments.map(item => {
    const width = (item.conversion / max) * 100;
    const color = item.key === "control" ? colors.control :
      item.key === "push" ? colors.push :
      item.key === "small" ? colors.small : colors.high;
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
  const items = [
    { label: "مشوق مفید", value: 48, color: colors.useful },
    { label: "کاربران قطعی", value: 28, color: colors.high },
    { label: "هدررفت کم‌واکنش", value: 24, color: colors.waste }
  ];

  document.getElementById("wasteLegend").innerHTML = items.map(item => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${item.color}"></span>
      <span class="legend-label">${item.label}</span>
      <span class="legend-value number">${fa.format(item.value)}٪</span>
    </div>
  `).join("");
}

function renderSegments() {
  document.getElementById("segmentRows").innerHTML = segments.map(segment => `
    <tr>
      <td><strong>${segment.nameFa}</strong></td>
      <td class="number">${fa.format(segment.users)}</td>
      <td>${segment.actionFa}</td>
      <td class="number">${fa.format(segment.uplift)} واحد</td>
      <td>${segment.reasonFa}</td>
    </tr>
  `).join("");
}

function renderActions() {
  document.getElementById("actionCards").innerHTML = actions.map(action => `
    <div class="action-card" style="border-top: 5px solid ${action.color}">
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
  const cards = [
    ["کاهش هزینه مشوق", "۱۹.۵٪"],
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

function setAuthMode(mode) {
  document.querySelectorAll("[data-auth-tab]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.authTab === mode);
  });
  document.getElementById("loginForm").classList.toggle("active", mode === "login");
  document.getElementById("signupForm").classList.toggle("active", mode === "signup");
}

function showDashboard() {
  document.getElementById("authShell").classList.add("is-hidden");
  document.getElementById("appShell").classList.remove("is-hidden");
}

function showAuth() {
  document.getElementById("appShell").classList.add("is-hidden");
  document.getElementById("authShell").classList.remove("is-hidden");
}

function saveSession(payload) {
  localStorage.setItem(sessionKey, JSON.stringify(payload));
  showDashboard();
}

function initAuth() {
  document.querySelectorAll("[data-auth-tab]").forEach(tab => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authTab));
  });

  document.getElementById("loginForm").addEventListener("submit", event => {
    event.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    saveSession({ email, workspace: "Demo workspace", mode: "login" });
  });

  document.getElementById("signupForm").addEventListener("submit", event => {
    event.preventDefault();
    const email = document.getElementById("signupEmail").value.trim();
    const workspace = document.getElementById("companyName").value.trim();
    saveSession({ email, workspace, mode: "signup" });
  });

  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem(sessionKey);
    showAuth();
  });

  if (localStorage.getItem(sessionKey)) {
    showDashboard();
  }
}

function init() {
  initAuth();
  renderMetricGrid();
  renderTreatmentChart();
  renderWaste();
  renderSegments();
  renderActions();
  renderSummary();
}

init();
