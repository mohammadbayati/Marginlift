const faInteger = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faDecimal = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const faDate = new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" });

function formatNumber(value) {
  return faInteger.format(Number(value || 0));
}

function formatMoney(value) {
  if (value === null || value === undefined) return "داده موجود نیست";
  const number = Number(value || 0);
  const sign = number < 0 ? "−" : "";
  const absolute = Math.abs(number);
  if (absolute >= 1000000) return `${sign}${faDecimal.format(absolute / 1000000)} میلیون تومان`;
  return `${sign}${faInteger.format(absolute)} تومان`;
}

function formatRatio(value) {
  return value === null || value === undefined ? "داده موجود نیست" : `${faDecimal.format(value)}×`;
}

function formatPercent(value) {
  return `${faDecimal.format(Number(value || 0))}٪`;
}

function formatStatPercent(value) {
  return value === null || value === undefined ? "محاسبه نشد" : `${faDecimal.format(Number(value) * 100)}٪`;
}

function formatPValue(value) {
  return value === null || value === undefined ? "محاسبه نشد" : new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 4 }).format(Number(value));
}

function localizeTerms(value) {
  return String(value ?? "")
    .replace(/scale\s*\/\s*stop/gi, "گسترش یا توقف")
    .replace(/holdout/gi, "گروه کنترل")
    .replace(/outcome/gi, "نتیجه")
    .replace(/exposure/gi, "مواجهه با کمپین")
    .replace(/CRM/g, "ارتباط با مشتری");
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

function decisionContent(status) {
  const content = {
    scale: {
      tone: "positive",
      headline: "بودجه را مرحله‌ای و با سقف مشخص افزایش دهید.",
      label: "گسترش کنترل‌شده",
      note: "اثر مالی مثبت ثبت شده است؛ گروه کنترل و سقف هزینه در اجرای بعدی حفظ شود.",
      gate: "آزادسازی مرحله‌ای بودجه با کنترل هفتگی سود افزایشی",
      lock: "دروازه بودجه با کنترل مالی باز است"
    },
    stop: {
      tone: "negative",
      headline: "اجرای گسترده این سیاست را متوقف کنید.",
      label: "توقف اجرای گسترده",
      note: "اثر مالی قابل دفاع ثبت نشده و ادامه سیاست فعلی ریسک هدررفت بودجه دارد.",
      gate: "بودجه جدید تا طراحی فرضیه و سیاست تازه آزاد نشود",
      lock: "دروازه بودجه بسته است"
    },
    needs_review: {
      tone: "review",
      headline: "فعلاً بودجه مشوق را افزایش ندهید.",
      label: "اصلاح زنجیره شواهد",
      note: "حداقل یکی از شروط Registry، تخصیص، زمان‌بندی، SRM یا قرارداد داده تأیید نشده است.",
      gate: "پس از رفع همه ایرادهای Integrity Gate و ثبت یک پایلوت prospective",
      lock: "قفل تصمیم فعال است"
    },
    iterate: {
      tone: "review",
      headline: "پایلوت را با طراحی ثابت و نمونه کافی تکرار کنید.",
      label: "شواهد نامطمئن؛ تکرار هدفمند",
      note: "برآورد نقطه‌ای برای تصمیم کافی نیست و فاصله اطمینان یا guardrailها هنوز نتیجه قطعی نمی‌دهند.",
      gate: "تکمیل حجم نمونه از پیش تعیین‌شده بدون تغییر معیار یا توقف زودهنگام",
      lock: "بودجه گسترده بسته؛ بودجه پایلوت کنترل‌شده مجاز است"
    },
    pending: {
      tone: "pending",
      headline: "پیش از تصمیم بودجه‌ای، نتیجه پایلوت را ثبت کنید.",
      label: "در انتظار نتیجه پایلوت",
      note: "عددهای فعلی برآورد هستند و هنوز اثر واقعی تأیید نشده است.",
      gate: "بعد از بسته‌شدن پنجره نتیجه و ورود داده واقعی پایلوت",
      lock: "تصمیم بودجه‌ای در انتظار شواهد است"
    }
  };
  return content[status] || content.pending;
}

function ceoSummary(status) {
  if (status === "scale") return "پایلوت اثر مالی مثبت و قابل دفاع نشان داده است. اجرای بعدی باید محدود، مرحله‌ای و فقط روی سگمنت‌های مشابه انجام شود تا سود افزایشی در مقیاس بزرگ‌تر دوباره تأیید شود.";
  if (status === "stop") return "پایلوت ارزش اقتصادی قابل دفاع ایجاد نکرده است. افزایش بودجه در این وضعیت، هزینه مشوق را بالا می‌برد بدون آنکه تغییر رفتار مشتری اثبات شده باشد.";
  if (status === "needs_review") return "زنجیره شواهد آزمایش کامل نیست و نتیجه فعلی، حتی اگر سود مثبت نشان دهد، مبنای قابل دفاعی برای افزایش بودجه نیست.";
  if (status === "iterate") return "نتیجه فعلی نه مجوز گسترش است و نه حکم توقف قطعی. عدم‌قطعیت باید با همان معیار اصلی و حجم نمونه کافی کاهش یابد.";
  return "داده اولیه آماده است، اما تا پیش از دریافت نتیجه واقعی پایلوت هیچ عدد مالی نباید به‌عنوان اثر تأییدشده مبنای افزایش بودجه قرار گیرد.";
}

function marketingSummary(status) {
  if (status === "scale") return "پیام و سگمنت فعلی توانسته‌اند رفتار مشتری را با هزینه قابل دفاع تغییر دهند. مرحله بعد باید همان الگوی رفتاری را حفظ کند و فقط دامنه اجرا را کنترل‌شده افزایش دهد.";
  if (status === "stop") return "پیام، سگمنت یا مقدار مشوق فعلی رفتار مشتری را به‌اندازه کافی تغییر نداده است. کمپین بعدی باید با فرضیه‌ای تازه و ترجیحاً مشوق کمتر یا غیرتخفیفی طراحی شود.";
  if (status === "needs_review") return "سلامت اجرای آزمایش تأیید نشده است؛ ابتدا تخصیص، exposure، پنجره نتیجه و کیفیت گروه کنترل را اصلاح کنید و سپس درباره کمپین قضاوت کنید.";
  if (status === "iterate") return "سیگنال اولیه وجود دارد، اما برای تغییر کمپین یا بودجه کافی نیست. نسخه فعلی را ثابت نگه دارید و نمونه را تا کف ثبت‌شده کامل کنید.";
  return "تیم مارکتینگ باید پیش از اجرا، تعریف موفقیت، پنجره سنجش نتیجه و گروه کنترل را نهایی کند تا نتیجه بعدی قابلیت دفاع مالی داشته باشد.";
}

function riskNotes(state) {
  const notes = [];
  const status = decisionStatus(state);
  const outcome = state.outcome?.summary;
  if (state.readiness.status !== "ready") notes.push("قرارداد داده برای ادعای اثر افزایشی کامل نیست؛ خروجی فعلی فقط برای شناخت تاریخی قابل استفاده است.");
  if (!outcome) notes.push("نتیجه واقعی پایلوت هنوز ثبت نشده و عددهای مالی فعلی برآورد هستند.");
  if (status === "needs_review") notes.push("نقص در زنجیره شواهد، هرگونه نتیجه‌گیری بودجه‌ای را مسدود می‌کند.");
  if (status === "iterate") notes.push("فاصله اطمینان یا guardrailها هنوز صفر یا آستانه آسیب را قطع می‌کنند؛ نتیجه قطعی نیست.");
  if (outcome?.controlUsers === 0) notes.push("بدون گروه کنترل، اثر افزایشی از خرید طبیعی مشتری جدا نمی‌شود.");
  if (outcome && (outcome.treatmentUsers < 50 || outcome.controlUsers < 50)) notes.push("حجم نمونه برای تصمیم تجاری سراسری کافی نیست و عدم‌قطعیت نتیجه بالاست.");
  return notes.length ? notes : ["ریسک اصلی پایین است؛ بااین‌حال اجرای گسترده باید مرحله‌ای، سقف‌دار و همراه با گروه کنترل باقی بماند."];
}

function nextActions(status) {
  if (status === "scale") {
    return [
      { window: "۴۸ ساعت", owner: "مدیر مالی و رشد", title: "تصویب سقف بودجه", detail: "بودجه مرحله بعد، دامنه سگمنت و معیار توقف را پیش از اجرا ثبت کنید." },
      { window: "هفته اول", owner: "تیم ارتباط با مشتری", title: "اجرای محدود", detail: "فقط سگمنت‌های مشابه پایلوت را فعال و گروه کنترل را در هر سگمنت حفظ کنید." },
      { window: "هفتگی", owner: "تحلیل و مالی", title: "کنترل سود افزایشی", detail: "سود، هزینه مشوق و انحراف از نتیجه پایلوت را در هر چرخه بازبینی کنید." }
    ];
  }
  if (status === "stop") {
    return [
      { window: "امروز", owner: "مدیر رشد", title: "توقف گسترش", detail: "فعال‌سازی جدید را متوقف و بودجه استفاده‌نشده را مسدود کنید." },
      { window: "هفته اول", owner: "ارتباط با مشتری و تحلیل", title: "تحلیل شکست", detail: "رفتار دریافت‌کنندگان مشوق را با کنترل و سگمنت‌های بدون پاسخ مقایسه کنید." },
      { window: "هفته دوم", owner: "مارکتینگ", title: "طراحی فرضیه تازه", detail: "یک پیام غیرتخفیفی یا مشوق کمتر با معیار موفقیت از پیش مصوب طراحی کنید." }
    ];
  }
  if (status === "needs_review") {
    return [
      { window: "۴۸ ساعت", owner: "تیم داده", title: "ممیزی شواهد", detail: "نسبت نمونه، تخصیص گروه‌ها، پنجره نتیجه و ثبت هزینه واقعی را دوباره بررسی کنید." },
      { window: "هفته اول", owner: "ارتباط با مشتری و مارکتینگ", title: "اصلاح سیاست هدف‌گیری", detail: "سگمنت هدف، مقدار مشوق و زمان تماس را بر اساس مشتریان پاسخ‌داده و پاسخ‌نداده بازطراحی کنید." },
      { window: "۲ تا ۴ هفته", owner: "رشد و مالی", title: "بازاجرای پایلوت", detail: "پایلوت کوچک‌تر را با گروه کنترل کافی، سقف بودجه و معیار موفقیت مصوب اجرا کنید." }
    ];
  }
  if (status === "iterate") {
    return [
      { window: "۴۸ ساعت", owner: "تحلیل و رشد", title: "قفل مجدد Analysis Plan", detail: "معیار اصلی، بازوها، کف نمونه و پنجره نتیجه را بدون تغییر ثبت کنید." },
      { window: "۲ تا ۴ هفته", owner: "ارتباط با مشتری", title: "تکمیل نمونه", detail: "پایلوت را بدون peeking یا توقف زودهنگام تا کف نمونه ادامه دهید." },
      { window: "پس از پایان پنجره", owner: "تحلیل و مالی", title: "تحلیل یک‌باره", detail: "CI، guardrail و ROI را فقط پس از بسته‌شدن پنجره دوباره محاسبه کنید." }
    ];
  }
  return [
    { window: "هفته اول", owner: "تیم داده", title: "تکمیل قرارداد نتیجه", detail: "شناسه مشتری، گروه تخصیص، زمان مواجهه، درآمد و هزینه واقعی را آماده کنید." },
    { window: "پیش از اجرا", owner: "مدیر رشد", title: "قفل‌کردن طراحی آزمایش", detail: "گروه کنترل، بازه سنجش و معیار موفقیت را پیش از شروع تغییرناپذیر کنید." },
    { window: "پس از پایان پنجره", owner: "تحلیل و مالی", title: "صدور تصمیم نهایی", detail: "نتیجه واقعی را وارد و تصمیم گسترش، بازبینی یا توقف را ثبت کنید." }
  ];
}

function outcomeMetrics(state) {
  const snapshot = state.savingsSnapshot;
  const outcome = state.outcome?.summary;
  const predicted = Number(outcome?.predictedIncrementalProfit || snapshot.expectedIncrementalProfit || 0);
  const observed = Number(outcome?.observedIncrementalProfit ?? snapshot.expectedIncrementalProfit ?? 0);
  const gap = outcome ? observed - predicted : 0;
  const realization = predicted > 0 ? (observed / predicted) * 100 : 0;
  return { snapshot, outcome, predicted, observed, gap, realization };
}

function renderKpis(state) {
  const { snapshot, outcome, observed } = outcomeMetrics(state);
  const primary = state.outcome?.statistics?.primary;
  const cards = [
    { label: outcome ? "سود افزایشی مشاهده‌شده" : "تغییر سود مشارکتی برآوردی", value: formatMoney(snapshot.expectedIncrementalProfit), note: snapshot.claimLevelFa, tone: observed < 0 ? "risk" : "profit" },
    { label: "اثر ITT به‌ازای مشتری", value: primary?.valid ? formatMoney(primary.estimate) : "محاسبه نشد", note: state.outcome?.statistics?.estimandFa || "پس از آزمایش سالم محاسبه می‌شود", tone: primary?.ciLow > 0 ? "profit" : "risk" },
    { label: "فاصله اطمینان ۹۵٪", value: primary?.valid ? `${formatMoney(primary.ciLow)} تا ${formatMoney(primary.ciHigh)}` : "محاسبه نشد", note: primary?.valid ? `p-value: ${formatPValue(primary.pValue)}` : "عدم‌قطعیت قابل برآورد نیست", tone: primary?.direction === "positive" ? "profit" : "risk" },
    { label: "توان مشاهده‌شده", value: formatStatPercent(primary?.achievedPower), note: primary?.valid ? `MDE: ${formatMoney(primary.minimumDetectableEffect)}` : "حجم یا واریانس کافی نیست", tone: primary?.achievedPower >= 0.8 ? "roi" : "risk" }
  ];
  document.getElementById("reportKpis").innerHTML = cards.map(card => `
    <article class="report-kpi report-kpi--${card.tone}">
      <span>${escapeHtml(card.label)}</span>
      <strong class="number">${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.note)}</small>
    </article>
  `).join("");
}

function renderVarianceChart(state) {
  const { outcome, predicted, observed, gap, realization } = outcomeMetrics(state);
  const maxValue = Math.max(Math.abs(predicted), Math.abs(observed), 1);
  const rows = [
    { label: "برآورد اولیه", value: predicted, tone: "expected" },
    { label: "نتیجه واقعی", value: observed, tone: "observed" }
  ];
  document.getElementById("realizationBadge").textContent = outcome ? `${formatPercent(realization)} تحقق` : "در انتظار نتیجه";
  document.getElementById("varianceChart").innerHTML = `
    <div class="variance-bars">
      ${rows.map(row => `
        <div class="variance-row variance-row--${row.tone}">
          <div class="variance-label"><span>${escapeHtml(row.label)}</span><strong class="number">${escapeHtml(formatMoney(row.value))}</strong></div>
          <div class="variance-track" aria-hidden="true"><span style="--bar-size:${Math.max(5, (Math.abs(row.value) / maxValue) * 100)}%"></span></div>
        </div>
      `).join("")}
    </div>
    <div class="variance-callout ${gap < 0 ? "is-negative" : "is-positive"}">
      <span>فاصله برآورد و واقعیت</span>
      <strong class="number">${escapeHtml(outcome ? formatMoney(gap) : "در انتظار نتیجه")}</strong>
      <p>${gap < 0 ? "نتیجه مثبت است، اما هنوز برای افزایش بودجه کافی نیست." : "نتیجه برای اجرای محدود و کنترل‌شده قابل بررسی است."}</p>
    </div>
  `;
}

function renderBridgeChart(state) {
  const { snapshot, outcome, observed, gap } = outcomeMetrics(state);
  const signals = [
    { label: outcome ? "سود مشاهده‌شده پایلوت" : "تغییر سود مشارکتی برآوردی", value: observed, note: outcome ? "هنوز اثر causal تأییدشده نیست" : "برآورد تاریخی سیاست", tone: observed < 0 ? "risk" : "profit" },
    { label: "شکاف هزینه مشاهده‌شده", value: snapshot.avoidableIncentiveCost, note: "فرصت برآوردی؛ نیازمند اثبات", tone: snapshot.avoidableIncentiveCost < 0 ? "risk" : "saving" },
    { label: "انحراف از برآورد", value: gap, note: gap < 0 ? "ریسک مدل یا سیاست" : "فراتر از برآورد", tone: gap < 0 ? "risk" : "profit" }
  ];
  document.getElementById("bridgeChart").innerHTML = signals.map((signal, index) => `
    <div class="financial-signal financial-signal--${signal.tone}">
      <span class="financial-signal-index">۰${index + 1}</span>
      <div>
        <span>${escapeHtml(signal.label)}</span>
        <strong class="number">${escapeHtml(formatMoney(signal.value))}</strong>
        <small>${escapeHtml(signal.note)}</small>
      </div>
    </div>
  `).join("");
}

function renderEvidencePassport(state, governanceOverview) {
  const { outcome } = outcomeMetrics(state);
  const integrity = state.outcome?.integrity;
  const statistics = state.outcome?.statistics;
  const integrityCheck = key => integrity?.checks?.find(item => item.key === key);
  const readinessCheck = key => Boolean(state.readiness.checks.find(item => item.key === key)?.passed);
  const testedGuardrails = statistics?.guardrails?.filter(item => item.status !== "unavailable") || [];
  const guardrailsPassed = testedGuardrails.length > 0 && testedGuardrails.every(item => item.status === "pass");
  const drift = governanceOverview?.modelGovernance?.drift;
  const ledger = governanceOverview?.decisionLedger?.integrity;
  const governancePassed = Boolean(ledger?.valid) && ["stable", "baseline_pending"].includes(drift?.status);
  const checks = [
    { label: "اتصال به Experiment Registry", detail: state.experiment?.id || "ثبت نشده", passed: Boolean(state.experiment?.acceptsOutcome) },
    { label: "تخصیص تصادفی", detail: integrityCheck("randomization")?.detailFa || "پیش از اجرا باید تأیید شود", passed: Boolean(integrityCheck("randomization")?.passed) },
    { label: "ثبت پیش از exposure", detail: integrityCheck("preregistration")?.detailFa || "Analysis Plan باید پیش از اجرا قفل شود", passed: Boolean(integrityCheck("preregistration")?.passed) },
    { label: "سلامت exposure", detail: integrityCheck("exposure")?.detailFa || "پس از outcome سنجیده می‌شود", passed: Boolean(integrityCheck("exposure")?.passed) },
    { label: "بسته‌شدن پنجره نتیجه", detail: integrityCheck("outcome_window")?.detailFa || "در انتظار نتیجه", passed: Boolean(integrityCheck("outcome_window")?.passed) },
    { label: "تعادل حجم گروه‌ها (SRM)", detail: integrityCheck("srm")?.detailFa || "در انتظار نتیجه", passed: Boolean(integrityCheck("srm")?.passed) },
    { label: "کفایت حجم نمونه", detail: statistics ? `${formatNumber(statistics.sample.treatment)} اقدام / ${formatNumber(statistics.sample.control)} کنترل` : "در انتظار نتیجه", passed: Boolean(statistics?.sample?.adequate) },
    { label: "فاصله اطمینان اثر", detail: statistics?.primary?.valid ? `${formatMoney(statistics.primary.ciLow)} تا ${formatMoney(statistics.primary.ciHigh)}` : "محاسبه نشد", passed: Boolean(statistics?.primary?.valid) },
    { label: "Guardrailهای تجاری", detail: testedGuardrails.length ? testedGuardrails.map(item => `${item.labelFa}: ${item.statusFa}`).join("؛ ") : "در انتظار نتیجه", passed: guardrailsPassed },
    { label: "حاشیه سود", detail: readinessCheck("gross_margin") ? "موجود" : "ناقص", passed: readinessCheck("gross_margin") },
    { label: "حاکمیت و سلامت مدل", detail: `${drift?.statusFa || "در انتظار snapshot"}؛ ${ledger?.statusFa || "دفتر تصمیم آماده نیست"}`, passed: governancePassed },
  ];
  document.getElementById("evidencePassport").innerHTML = `
    <div class="passport-summary">
      <span>آمادگی داده</span>
      <strong class="number">${formatPercent(state.readiness.score)}</strong>
      <small>${escapeHtml(integrity?.statusFa || "Integrity Gate در انتظار outcome")}</small>
    </div>
    <div class="passport-checks">
      ${checks.map(check => `
        <div class="passport-check ${check.passed ? "is-passed" : "is-watch"}">
          <span class="passport-icon" aria-hidden="true">${check.passed ? "✓" : "!"}</span>
          <div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></div>
          <span class="passport-state">${check.passed ? "تأیید" : "بررسی"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSteps(state) {
  document.getElementById("workspaceStepsReport").innerHTML = state.workspace.steps.map((step, index) => {
    const warning = step.statusFa.includes("اصلاح");
    const tone = step.complete ? "is-complete" : warning ? "is-warning" : "is-pending";
    return `
      <div class="report-step ${tone}">
        <span class="report-step-index number">${formatNumber(index + 1)}</span>
        <div><strong>${escapeHtml(localizeTerms(step.labelFa))}</strong><small>${escapeHtml(localizeTerms(step.statusFa))}</small></div>
      </div>
    `;
  }).join("");
}

function renderLists(state, status) {
  document.getElementById("riskList").innerHTML = riskNotes(state).map((item, index) => `
    <li><span class="number">${formatNumber(index + 1)}</span><p>${escapeHtml(item)}</p></li>
  `).join("");
  document.getElementById("nextActionList").innerHTML = nextActions(status).map((item, index) => `
    <li>
      <div class="action-card-top"><span class="action-number number">${formatNumber(index + 1)}</span><span class="action-window">${escapeHtml(item.window)}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.detail)}</p>
      <div class="action-owner"><span>مالک</span><strong>${escapeHtml(item.owner)}</strong></div>
    </li>
  `).join("");
}

async function downloadMarkdown() {
  const response = await fetch("/api/pilot/readout.md", { credentials: "same-origin" });
  if (!response.ok) throw new Error("دریافت متن گزارش ممکن نشد.");
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
    const [session, state, governance] = await Promise.all([
      fetchJson("/api/session"),
      fetchJson("/api/pilot/workspace"),
      fetchJson("/api/model-governance/overview")
    ]);
    const status = decisionStatus(state);
    const decision = decisionContent(status);
    const organization = session.organization.name;

    document.body.dataset.decisionTone = decision.tone;
    document.getElementById("toolbarOrganization").textContent = organization;
    document.getElementById("decisionHeadline").textContent = decision.headline;
    document.getElementById("reportCoverText").textContent = `تصمیم پیشنهادی برای ${organization} بر اساس نتیجه پایلوت، هزینه واقعی مشوق و کیفیت شواهد.`;
    document.getElementById("reportDecisionCard").className = `report-decision-card report-decision-card--${decision.tone}`;
    document.getElementById("reportDecisionCard").innerHTML = `
      <span class="report-decision-label">پیشنهاد تصمیم</span>
      <strong>${escapeHtml(decision.label)}</strong>
      <p>${escapeHtml(decision.note)}</p>
      <div class="report-decision-lock"><span aria-hidden="true">◆</span><span>${escapeHtml(decision.lock)}</span></div>
    `;
    document.getElementById("ceoSummary").textContent = ceoSummary(status);
    document.getElementById("marketingSummary").textContent = marketingSummary(status);
    document.getElementById("evidenceBadge").textContent = state.savingsSnapshot.claimLevelFa;
    document.getElementById("confidenceBadge").textContent = `اعتماد: ${state.savingsSnapshot.confidenceFa}`;
    document.getElementById("reportDate").textContent = faDate.format(new Date());
    document.getElementById("confidenceWord").textContent = state.savingsSnapshot.confidenceFa;
    document.getElementById("workspaceBadge").textContent = localizeTerms(state.workspace.overallStatusFa);
    document.getElementById("budgetGateText").textContent = decision.gate;
    document.getElementById("budgetGateRule").innerHTML = `<span>وضعیت فعلی</span><strong>${escapeHtml(decision.lock)}</strong>`;
    document.getElementById("decisionOwner").textContent = localizeTerms(state.workspace.ownerFa);
    document.getElementById("decisionDeadline").textContent = `مهلت تصمیم: ${localizeTerms(state.workspace.decisionDeadlineFa)}`;

    renderKpis(state);
    renderVarianceChart(state);
    renderBridgeChart(state);
    renderEvidencePassport(state, governance);
    renderSteps(state);
    renderLists(state, status);
    renderCommandCenter(state).catch(() => {});
    requestAnimationFrame(() => document.documentElement.classList.add("report-ready"));
  } catch (error) {
    document.getElementById("executiveReport").innerHTML = `<section class="report-load-error"><h1>گزارش آماده نشد</h1><p>${escapeHtml(error.message)}</p><a href="/login">بازگشت به مرکز تصمیم</a></section>`;
  }
}

function initViewTabs() {
  const tabs = document.querySelectorAll(".report-view-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const target = tab.dataset.view;
      document.querySelectorAll(".report-view").forEach(view => {
        const isTarget = view.id === (target === "command-center" ? "viewCommandCenter" : "viewDataScienceLab");
        view.classList.toggle("active", isTarget);
        view.hidden = !isTarget;
      });
    });
  });
}

async function renderCommandCenter(state) {
  const snapshot = state.savingsSnapshot;
  const outcome = state.outcome?.summary;
  const observed = Number(outcome?.observedIncrementalProfit ?? snapshot.expectedIncrementalProfit ?? 0);

  let wasteReport = null;
  try { wasteReport = await fetchJson("/api/v1/shadow/waste-report"); } catch (_) {}

  if (wasteReport && wasteReport.totalEvaluations > 0) {
    document.getElementById("totalWasteBudget").textContent = formatMoney(wasteReport.totalWasteBudget);
    document.getElementById("sureThingWaste").textContent = formatMoney(wasteReport.sureThingWaste);
    document.getElementById("sureThingCount").textContent = `${formatNumber(wasteReport.sureThingCount)} مشتری — بدون نیاز به مشوق خرید می‌کنند`;
    document.getElementById("sleepingDogWaste").textContent = formatMoney(wasteReport.sleepingDogWaste);
    document.getElementById("sleepingDogCount").textContent = `${formatNumber(wasteReport.sleepingDogCount)} مشتری — مشوق اثر معکوس داشته`;
    document.getElementById("wasteRateValue").textContent = formatNumber(wasteReport.wasteRate);
    document.querySelector(".waste-rate-fill").style.setProperty("--waste-pct", `${Math.min(100, wasteReport.wasteRate)}%`);
  } else {
    const avoidable = Math.abs(Number(snapshot.avoidableIncentiveCost || 0));
    document.getElementById("totalWasteBudget").textContent = avoidable > 0 ? formatMoney(avoidable) : "داده سایه موجود نیست";
    const wasteRate = snapshot.totalCost > 0 ? Math.round((avoidable / snapshot.totalCost) * 100) : 0;
    document.getElementById("wasteRateValue").textContent = formatNumber(wasteRate);
    document.querySelector(".waste-rate-fill").style.setProperty("--waste-pct", `${Math.min(100, wasteRate)}%`);
  }

  document.getElementById("netIncrementalRevenue").textContent = formatMoney(observed);
  const persuadableProfit = Number(snapshot.expectedIncrementalProfit || 0);
  const savings = Math.abs(Number(snapshot.avoidableIncentiveCost || 0));
  document.getElementById("persuadableRevenue").textContent = formatMoney(persuadableProfit);
  document.getElementById("savingsFromWasteRemoval").textContent = formatMoney(savings);
  const totalInvestment = Number(snapshot.totalCost || 1);
  const roi = totalInvestment > 0 ? ((persuadableProfit + savings) / totalInvestment) : 0;
  document.getElementById("optimizationRoi").textContent = `${formatNumber(Math.round(roi * 100))}٪`;
}

document.getElementById("printReportButton").addEventListener("click", () => window.print());
document.getElementById("downloadMarkdownButton").addEventListener("click", () => downloadMarkdown().catch(error => window.alert(error.message)));
document.getElementById("authorizeCampaignBtn").addEventListener("click", () => {
  window.alert("درخواست بهینه‌سازی ثبت شد. تیم MarginLift با شما تماس خواهد گرفت.");
});
initViewTabs();
initReport();
