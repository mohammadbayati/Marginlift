const riskProfiles = [
  {
    match: "وفادار",
    riskBandFa: "کم",
    riskScore: 18,
    economicTierFa: "ارزش متوسط",
    rationaleFa: "رفتار اخیر پایدار است؛ تماس پولی احتمالا ارزش افزوده‌ای ندارد."
  },
  {
    match: "خاموش",
    riskBandFa: "زیاد",
    riskScore: 78,
    economicTierFa: "ارزش بالا",
    rationaleFa: "افت تعامل، این گروه را برای بازگشت هدف مناسبی می‌کند؛ هزینه را قبل از تماس اعتبارسنجی کن."
  },
  {
    match: "حساس",
    riskBandFa: "متوسط",
    riskScore: 58,
    economicTierFa: "ارزش بالا",
    rationaleFa: "واکنش به قیمت دیده می‌شود، اما شواهد برای خرج کامل هنوز قطعی نیست."
  }
];

const fallbackRiskProfile = {
  riskBandFa: "نامشخص",
  riskScore: null,
  economicTierFa: "نامشخص",
  rationaleFa: "برای امتیازدهی واقعی، داده‌ی فردی و تعریف رسمی ریزش لازم است."
};

function buildDecisionOverview(analysis) {
  const segments = analysis.segments || [];
  const qualityScore = analysis.quality?.score || 0;
  const hasControl = (analysis.treatments || []).some(treatment => treatment.key === "control");
  const hasMargin = (analysis.campaign?.baselineContributionProfit || 0) > 0;
  const enrichedSegments = segments.map((segment, index) => enrichSegment(segment, index));
  const upliftLab = buildUpliftLab(analysis, enrichedSegments);
  const atRiskAudience = enrichedSegments
    .filter(segment => ["زیاد", "متوسط"].includes(segment.riskBandFa))
    .reduce((sum, segment) => sum + segment.users, 0);
  const highValueAtRisk = enrichedSegments
    .filter(segment => segment.riskBandFa === "زیاد" && segment.economicTierFa === "ارزش بالا")
    .reduce((sum, segment) => sum + segment.users, 0);
  const protectedProfit = enrichedSegments
    .filter(segment => segment.riskBandFa !== "کم")
    .reduce((sum, segment) => sum + Math.max(0, segment.projectedContributionProfit), 0);
  const readinessScore = Math.round(
    (qualityScore + (hasControl ? 85 : 25) + (hasMargin ? 80 : 30) + 65 + (hasControl ? 70 : 25)) / 5
  );

  return {
    contract: {
      unitFa: "مشتری؛ در دمو فعلی، سگمنت به‌عنوان واحد موقت",
      churnDefinitionFa: "عدم تراکنش در ۳۰ روز بعد از پنجره مشاهده",
      observationWindowFa: "۹۰ روز رفتار گذشته",
      predictionWindowFa: "۳۰ روز آینده",
      outcomeWindowFa: "۳۰ روز پس از اقدام",
      primaryKpiFa: "سود نگهداشت افزایشی",
      statusFa: "پیش‌فرض قابل تنظیم"
    },
    readiness: {
      score: readinessScore,
      labelFa: readinessScore >= 75 ? "آماده برای پایلوت" : "نیازمند تکمیل داده",
      noteFa: "این امتیاز آمادگی داده و تصمیم است، نه دقت مدل churn."
    },
    summary: {
      audience: analysis.campaign?.audience || 0,
      atRiskAudience,
      highValueAtRisk,
      protectedProfit: Math.round(protectedProfit),
      recommendedSavings: analysis.campaign?.nextSavings || 0,
      revenuePreserved: analysis.campaign?.revenuePreserved || 0,
      confidence: analysis.campaign?.confidence || 0,
      sourceFa: "برآورد اولیه در سطح سگمنت"
    },
    decisionQueue: enrichedSegments,
    upliftLab,
    stages: [
      stage("داده مشتری", qualityScore >= 65 ? "در حال تکمیل" : "مسدود", `${qualityScore}٪ کیفیت فایل ورودی`, qualityScore >= 65),
      stage("تعریف ریزش", "آماده تنظیم", "۳۰ روز عدم تراکنش", true),
      stage("امتیاز ریسک", "نمونه اولیه", "هنوز داده فردی وارد نشده است", false),
      stage("ارزش مشتری / CLV", hasMargin ? "فعال" : "مسدود", hasMargin ? "حاشیه سود در محاسبه است" : "حاشیه سود لازم است", hasMargin),
      stage("اثر افزایشی", hasControl ? "شواهد اولیه" : "مسدود", hasControl ? "مقایسه با گروه کنترل موجود است" : "گروه کنترل لازم است", hasControl),
      stage("اقدام بعدی", "پیشنهاد شده", "هزینه، سود و اطمینان در تصمیم لحاظ شده", true),
      stage("آزمایش و یادگیری", hasControl ? "آماده طراحی" : "مسدود", "holdout واقعی قبل از خودکارسازی لازم است", hasControl)
    ],
    evidence: [
      { labelFa: "کنترل معتبر", valueFa: hasControl ? "موجود" : "ناقص", status: hasControl ? "pass" : "warn" },
      { labelFa: "مدل هزینه", valueFa: hasMargin ? "کامل‌تر" : "ناقص", status: hasMargin ? "pass" : "warn" },
      { labelFa: "امتیاز فردی churn", valueFa: "هنوز موجود نیست", status: "warn" },
      { labelFa: "اقدام بدون مشوق", valueFa: "معتبر", status: "pass" }
    ],
    limitationsFa: [
      "این نسخه در سطح سگمنت تصمیم می‌دهد؛ برای امتیازدهی مشتری، customer_id و رویدادهای نقطه‌ای لازم است.",
      "اثر افزایشی با داده‌ی مشاهده‌شده برآورد می‌شود و تا اجرای holdout تصادفی، نتیجه قطعی causal نیست.",
      "No Action یک گزینه واقعی است و برای مشتریان با ارزش افزوده نامطمئن، اقدام پولی صادر نمی‌شود."
    ]
  };
}

function buildUpliftLab(analysis, decisionQueue) {
  const treatments = analysis.treatments || [];
  const segments = analysis.segments || [];
  const qiniCurve = buildQiniCurve(segments);
  const bestPoint = qiniCurve.reduce((best, point) =>
    point.cumulativeProfit > best.cumulativeProfit ? point : best,
  qiniCurve[0] || emptyQiniPoint());
  const positiveProfitSegments = segments.filter(segment => (segment.incrementalProfit || 0) > 0);
  const incrementalProfit = positiveProfitSegments.reduce((sum, segment) => sum + (segment.incrementalProfit || 0), 0);
  const control = treatments.find(treatment => treatment.key === "control");
  const bestTreatment = treatments
    .filter(treatment => treatment.key !== "control")
    .slice()
    .sort((a, b) => b.lift - a.lift || a.costPerUser - b.costPerUser)[0];

  return {
    titleFa: "لابراتوار Uplift و Qini",
    subtitleFa: "رتبه‌بندی مشتریان بر اساس اثر افزایشی، نه صرفا احتمال خرید.",
    summary: {
      incrementalProfit: Math.round(incrementalProfit),
      bestTargetShare: bestPoint.targetShare,
      bestTargetUsers: bestPoint.users,
      bestTreatmentFa: bestTreatment?.labelFa || "نیازمند داده بیشتر",
      controlConversion: control?.conversion || 0,
      modelStatusFa: control ? "قابل اجرای پایلوت سگمنتی" : "نیازمند گروه کنترل"
    },
    reactionMix: buildReactionMix(decisionQueue),
    qiniCurve,
    treatmentComparison: treatments.map(treatment => ({
      key: treatment.key,
      labelFa: treatment.labelFa,
      users: treatment.users,
      conversion: treatment.conversion,
      lift: treatment.lift,
      ciLow: treatment.ciLow,
      ciHigh: treatment.ciHigh,
      costPerUser: treatment.costPerUser,
      grossMarginRate: treatment.grossMarginRate,
      verdictFa: treatmentVerdict(treatment)
    })),
    modelCards: [
      modelCard("T-Learner", "هر اقدام را جداگانه با کنترل مقایسه می‌کند.", "بهترین شروع برای داده‌های کمپین تجمیعی", "فعال در نسخه سگمنتی"),
      modelCard("X-Learner", "برای عدم‌تعادل بین کنترل و درمان پایدارتر است.", "وقتی حجم گروه‌ها متفاوت است", "مرحله بعد"),
      modelCard("Uplift Tree", "قواعد قابل‌فهم برای تیم مارکتینگ می‌سازد.", "وقتی توضیح‌پذیری مهم‌تر از دقت خام است", "مرحله بعد"),
      modelCard("Causal Forest", "اثر درمان ناهمگن را با عدم‌قطعیت بهتر تخمین می‌زند.", "برای نسخه فردی و دیتای بزرگ", "بعد از Customer 360")
    ],
    experimentDesign: {
      hypothesisFa: "اگر مشوق‌ها فقط به سگمنت‌های دارای سود افزایشی مثبت تخصیص داده شوند، سود نگهداشت نسبت به سیاست baseline افزایش می‌یابد، چون تخفیف از مشتریان قطعی و کم‌اثر حذف می‌شود.",
      primaryMetricFa: "سود افزایشی هر مشتری هدف‌گیری‌شده",
      guardrailsFa: ["درآمد حفظ‌شده", "هزینه مشوق", "نرخ لغو/نارضایتی", "نسبت نمونه کنترل"],
      minimumEvidenceFa: "حداقل یک گروه کنترل پایدار، تعریف outcome، و ثبت exposure برای هر اقدام."
    }
  };
}

function buildQiniCurve(segments) {
  const ordered = segments
    .map(segment => ({
      nameFa: segment.nameFa,
      users: segment.users,
      incrementalProfit: Math.round(segment.incrementalProfit || 0),
      uplift: segment.uplift || 0,
      actionFa: segment.actionFa,
      score: (segment.incrementalProfit || 0) + (segment.uplift || 0) * 10000
    }))
    .sort((a, b) => b.score - a.score);

  const totalUsers = Math.max(1, ordered.reduce((sum, segment) => sum + segment.users, 0));
  let cumulativeUsers = 0;
  let cumulativeProfit = 0;

  return ordered.map(segment => {
    cumulativeUsers += segment.users;
    cumulativeProfit += segment.incrementalProfit;
    return {
      segmentFa: segment.nameFa,
      actionFa: segment.actionFa,
      users: cumulativeUsers,
      targetShare: Math.round((cumulativeUsers / totalUsers) * 100),
      cumulativeProfit: Math.round(cumulativeProfit),
      uplift: segment.uplift
    };
  });
}

function buildReactionMix(decisionQueue) {
  const mix = {
    persuadable: reaction("قابل‌نجات", "Persuadables", "با اقدام درست، سود افزایشی مثبت می‌سازند."),
    sureThing: reaction("خریدار قطعی", "Sure Things", "احتمالا بدون تخفیف هم برمی‌گردند."),
    testMore: reaction("نیازمند آزمایش", "Uncertain", "اثر مثبت دیده می‌شود اما هنوز برای اجرای کامل کافی نیست."),
    avoid: reaction("عدم اقدام", "Lost / Sleeping", "خرج‌کردن ممکن است بی‌اثر یا زیان‌ده باشد.")
  };

  decisionQueue.forEach(segment => {
    const bucket = classifyReaction(segment);
    mix[bucket].users += segment.users;
    mix[bucket].segments.push(segment.nameFa);
  });

  return Object.values(mix);
}

function classifyReaction(segment) {
  if (segment.decisionStatusFa === "اجرا" && segment.uplift > 0) return "persuadable";
  if (segment.nextBestActionFa === "بدون پیشنهاد" || segment.riskBandFa === "کم") return "sureThing";
  if (segment.decisionStatusFa === "آزمایش بیشتر") return "testMore";
  return "avoid";
}

function treatmentVerdict(treatment) {
  if (treatment.key === "control") return "خط مبنا";
  if (treatment.lift <= 0 || treatment.ciHigh <= 0) return "رد برای اقدام پولی";
  if (treatment.ciLow > 0 && treatment.costPerUser > 0) return "قابل اجرا با سقف بودجه";
  if (treatment.lift > 0) return "نیازمند holdout بیشتر";
  return "نامشخص";
}

function enrichSegment(segment, index) {
  const profile = riskProfiles.find(item => segment.nameFa.includes(item.match)) || fallbackRiskProfile;
  return {
    id: `segment_${index + 1}`,
    nameFa: segment.nameFa,
    users: segment.users,
    riskBandFa: profile.riskBandFa,
    riskScore: profile.riskScore,
    economicTierFa: profile.economicTierFa,
    nextBestActionFa: segment.actionFa,
    decisionStatusFa: segment.decisionStatusFa || "آزمایش بیشتر",
    confidenceLevelFa: segment.confidenceLevel || "متوسط",
    projectedContributionProfit: segment.projectedContributionProfit || 0,
    incrementalProfit: segment.incrementalProfit || 0,
    lowerBoundProfit: segment.lowerBoundProfit || 0,
    uplift: segment.uplift || 0,
    rationaleFa: profile.rationaleFa,
    sourceFa: "برآورد سگمنت؛ جایگزین مدل فردی نیست"
  };
}

function reaction(titleFa, label, noteFa) {
  return { titleFa, label, noteFa, users: 0, segments: [] };
}

function modelCard(name, methodFa, bestForFa, statusFa) {
  return { name, methodFa, bestForFa, statusFa };
}

function emptyQiniPoint() {
  return {
    segmentFa: "بدون داده",
    actionFa: "نامشخص",
    users: 0,
    targetShare: 0,
    cumulativeProfit: 0,
    uplift: 0
  };
}

function stage(labelFa, statusFa, detailFa, passed) {
  return { labelFa, statusFa, detailFa, passed };
}

module.exports = {
  buildDecisionOverview
};
