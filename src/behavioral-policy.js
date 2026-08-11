const CODEX_LENSES = Object.freeze([
  {
    key: "too_much_information",
    labelFa: "اطلاعات بیش‌ازحد",
    responseFa: "انتخاب‌ها را کم و تفاوت اقتصادی آن‌ها را روشن کنید."
  },
  {
    key: "not_enough_meaning",
    labelFa: "معنای ناکافی",
    responseFa: "خط مبنا، بازه عدم‌قطعیت و توضیح رقیب را کنار توصیه نشان دهید."
  },
  {
    key: "need_to_act_fast",
    labelFa: "فشار برای اقدام سریع",
    responseFa: "عدم اقدام را گزینه واقعی نگه دارید و اجرای زنده را به holdout مشروط کنید."
  },
  {
    key: "what_should_we_remember",
    labelFa: "حافظه انتخابی",
    responseFa: "نتیجه‌های ناموفق و اختلاف پیش‌بینی با واقعیت را نیز در دفتر تصمیم نگه دارید."
  }
]);

function buildBehavioralWorkspace({ retentionState = {}, overview = {}, behavioralExperiment = null } = {}) {
  const retention = retentionState.workspace || retentionState || {};
  const states = new Map((retention.states || []).map(item => [item.key, item]));
  const evidence = overview.evidence || [];
  const hasHistoricalBaseline = retention.evidenceLevel === "observational_baseline"
    && retention.status === "baseline_ready"
    && retentionState.stale !== true;
  const hasReferenceControl = evidence.some(item => item.labelFa === "کنترل معتبر" && item.status === "pass");
  const hasControl = Boolean(behavioralExperiment?.registeredAt && behavioralExperiment?.holdoutRate > 0);
  const hasMargin = evidence.some(item => item.labelFa === "مدل هزینه" && item.status === "pass");
  const hasObservedOutcome = Boolean(behavioralExperiment?.outcomeClosedAt);
  const coverageDays = Number(retention.metrics?.coverageDays || 0);

  const safeguards = [
    guard("base_rate", "خط مبنا قبل از روایت", hasHistoricalBaseline,
      hasHistoricalBaseline ? "چرخه خرید و نرخ پایه از داده تاریخی ساخته شده است." : "بدون خط مبنا، یک داستان جذاب می‌تواند با اثر واقعی اشتباه شود."),
    guard("confirmation", "شواهد مخالف و گروه کنترل", hasControl,
      hasControl
        ? "گروه کنترل به همین نسخه مداخله لینک شده و امکان رد فرضیه محبوب را فراهم می‌کند."
        : hasReferenceControl
          ? "کنترل کمپین موجود است، اما به نسخه این مداخله لینک نشده و قفل اجرا را باز نمی‌کند."
          : "تا پیش از holdout اختصاصی، توصیه رفتاری فقط یک فرضیه است."),
    guard("availability", "پوشش زمانی کافی", coverageDays >= 90,
      coverageDays >= 90 ? `پوشش داده ${coverageDays} روز است.` : "داده کوتاه‌مدت ممکن است رخدادهای اخیر را بیش‌ازحد مهم نشان دهد."),
    guard("action_bias", "حق عدم اقدام", true,
      "«بدون اقدام» در موتور تصمیم یک انتخاب معتبر و قابل ثبت است."),
    guard("outcome_bias", "بازخوانی نتیجه واقعی", hasObservedOutcome,
      hasObservedOutcome ? "نتیجه مشاهده‌شده با پیش‌بینی مقایسه می‌شود." : "پس از بسته‌شدن پنجره outcome، نتیجه باید بدون بازنویسی فرضیه ثبت شود."),
    guard("automation_bias", "تأیید انسانی پیش از اجرا", false,
      "اتصال مستقیم به CRM تا زمان ثبت مالک، سقف تماس و تأیید انسانی مسدود بماند.")
  ];

  const ethicalContract = [
    check("no_individual_diagnosis", "عدم برچسب روان‌شناختی فردی", "pass", "سامانه رفتار مشاهده‌شده را تحلیل می‌کند؛ ذهن، شخصیت یا سوگیری یک فرد را تشخیص نمی‌دهد."),
    check("hypothesis_only", "مکانیزم رفتاری به‌عنوان فرضیه", "pass", "نام هر اصل رفتاری در سطح سیاست ثبت می‌شود و تا آزمایش، ادعای اثربخشی نیست."),
    check("minimum_intervention", "کم‌هزینه‌ترین اقدام اول", "pass", "یادآوری یا کاهش اصطکاک پیش از هر مشوق پولی بررسی می‌شود."),
    check("holdout_required", "گروه کنترل و توقف از پیش تعریف‌شده", hasControl ? "pass" : "blocked", hasControl ? "کنترل معتبر در داده موجود است." : "اجرای زنده بدون holdout مجاز نیست."),
    check("frequency_cap", "سقف تماس در همه کانال‌ها", "blocked", "پیش از اتصال CRM باید شمار تماس بین کمپین‌ها یکپارچه و enforce شود."),
    check("opt_out", "حق انصراف و ترجیح کانال", "blocked", "قرارداد داده فعلی وضعیت رضایت و opt-out را دریافت نمی‌کند."),
    check("financial_guardrail", "گاردریل سود و هزینه", hasMargin ? "pass" : "blocked", hasMargin ? "حاشیه سود در تصمیم لحاظ شده است." : "مشوق بدون داده حاشیه سود مجاز نیست.")
  ];

  const candidates = [
    intervention({
      id: "timely_reminder",
      titleFa: "یادآوری در زمان درست",
      audienceFa: "مشتریان نزدیک موعد خرید",
      audienceCount: stateCount(states, "due"),
      mechanismFa: "برجستگی و نشانه یادآوری",
      treatmentFa: "یک پیام کوتاه با مسیر مستقیم به خرید قبلی؛ بدون تخفیف.",
      controlFa: "عدم ارسال پیام",
      primaryMetricFa: "سود نگهداشت افزایشی به‌ازای مشتری تخصیص‌یافته",
      guardrailFa: "لغو پیام، شکایت و خرید زودتر از نیاز",
      status: hasHistoricalBaseline ? "shadow_ready" : "needs_baseline"
    }),
    intervention({
      id: "friction_reduction",
      titleFa: "کاهش اصطکاک بازگشت",
      audienceFa: "مشتریان عبورکرده از چرخه",
      audienceCount: stateCount(states, "lapsed"),
      mechanismFa: "سهولت شناختی و کاهش بار انتخاب",
      treatmentFa: "نمایش یک تا سه گزینه مرتبط با سابقه واقعی، بدون گزینه پیش‌فرض فریبنده.",
      controlFa: "تجربه فعلی خرید",
      primaryMetricFa: "خرید مجدد افزایشی و حاشیه سود",
      guardrailFa: "کاهش تنوع انتخاب، مرجوعی و تماس پشتیبانی",
      status: hasHistoricalBaseline ? "shadow_ready" : "needs_baseline"
    }),
    intervention({
      id: "non_monetary_reactivation",
      titleFa: "بازگشت غیرپولی",
      audienceFa: "مشتریان غیرفعال",
      audienceCount: stateCount(states, "dormant"),
      mechanismFa: "خودارتباطی و یادآوری ارزش قبلی",
      treatmentFa: "یادآوری مزیت یا سابقه استفاده مرتبط؛ بدون فوریت ساختگی.",
      controlFa: "عدم تماس",
      primaryMetricFa: "بازگشت افزایشی بدون هزینه مشوق",
      guardrailFa: "نرخ unsubscribe، شکایت و تماس تکراری",
      status: hasHistoricalBaseline ? "shadow_ready" : "needs_baseline"
    }),
    intervention({
      id: "incentive_eligibility_test",
      titleFa: "آزمون صلاحیت مشوق",
      audienceFa: "فقط سگمنت دارای اثر افزایشی محتمل",
      audienceCount: Number(overview.summary?.atRiskAudience || 0),
      mechanismFa: "ارزش ادراک‌شده با قاب‌بندی شفاف",
      treatmentFa: "مشوق محدود در برابر پیام غیرپولی و کنترل؛ مبلغ و انقضا صریح.",
      controlFa: "کنترل + گزینه غیرپولی",
      primaryMetricFa: "سود افزایشی پس از هزینه واقعی مشوق و کانال",
      guardrailFa: "درآمد، عادت به تخفیف، عدالت تخصیص و شکایت",
      status: hasControl && hasMargin ? "experiment_ready" : "blocked"
    }),
    intervention({
      id: "intentional_no_action",
      titleFa: "عدم اقدام آگاهانه",
      audienceFa: "اثر نامطمئن یا هزینه بیشتر از منفعت",
      audienceCount: stateCount(states, "long_term_lost"),
      mechanismFa: "محافظت در برابر action bias",
      treatmentFa: "عدم تماس و حفظ بودجه؛ فقط نمونه‌گیری محدود برای یادگیری.",
      controlFa: "سیاست فعلی کسب‌وکار",
      primaryMetricFa: "هزینه اجتناب‌شده بدون افت سود",
      guardrailFa: "از دست‌دادن مشتری پرارزش و سوگیری ناشی از سکوت",
      status: "available"
    })
  ];

  const passedChecks = ethicalContract.filter(item => item.status === "pass").length;
  const readinessScore = Math.round((passedChecks / ethicalContract.length) * 100);
  const status = !hasHistoricalBaseline
    ? "needs_baseline"
    : hasControl && hasMargin
      ? "ready_for_controlled_test"
      : "ready_for_shadow";

  return {
    version: "behavioral_policy_v1",
    status,
    statusFa: ({
      needs_baseline: "نیازمند خط مبنا",
      ready_for_shadow: "آماده Shadow Mode",
      ready_for_controlled_test: "آماده آزمون کنترل‌شده"
    })[status],
    evidenceLevel: "behavioral_hypothesis",
    evidenceLabelFa: "فرضیه رفتاری؛ نه تشخیص روان‌شناختی",
    targetLevel: "policy_or_segment",
    individualPsychologyInference: false,
    readinessScore,
    codexLenses: CODEX_LENSES,
    candidates,
    safeguards,
    ethicalContract,
    nextActionFa: nextAction(status, ethicalContract)
  };
}

function intervention(input) {
  return {
    ...input,
    evidenceLevel: "hypothesis_only",
    targetLevel: "segment_or_policy",
    holdoutRequired: input.id !== "intentional_no_action",
    individualDiagnosis: false
  };
}

function guard(key, labelFa, passed, detailFa) {
  return { key, labelFa, status: passed ? "pass" : "review", detailFa };
}

function check(key, labelFa, status, detailFa) {
  return { key, labelFa, status, detailFa };
}

function stateCount(states, key) {
  return Number(states.get(key)?.count || 0);
}

function nextAction(status, checks) {
  if (status === "needs_baseline") return "ابتدا چرخه خرید و نرخ پایه را از داده تراکنش بسازید.";
  const blocked = checks.filter(item => item.status === "blocked").map(item => item.labelFa);
  if (blocked.length) return `پیش از اجرای زنده این گاردریل‌ها را ببندید: ${blocked.join("، ")}.`;
  return "یک مداخله را در Shadow Mode انتخاب و قرارداد آزمایش آن را از پیش ثبت کنید.";
}

module.exports = {
  buildBehavioralWorkspace
};
