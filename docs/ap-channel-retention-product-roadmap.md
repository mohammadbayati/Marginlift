# PRD و نقشه اجرایی MVP خرید مجدد بسته اینترنت

نسخه: `0.1`

وضعیت: `Discovery approved; Build gate conditional`

## ۱. تصمیم محصول

MarginLift برای آپ یک داشبورد Churn عمومی نمی‌سازد. نسخه اولیه یک workflow تصمیم‌گیری service-led است که:

1. داده خرید بسته اینترنت را ممیزی می‌کند.
2. موعد خرید بعدی و احتمال خروج از چرخه آپ را برآورد می‌کند.
3. کاربر را در وضعیت قابل‌فهم کسب‌وکاری قرار می‌دهد.
4. Risk را با Saveability، ارزش مالی و هزینه اقدام ترکیب می‌کند.
5. audience و policy پیشنهادی با گزینه واقعی `no_action` می‌سازد.
6. اثر policy را در holdout زنده اندازه‌گیری می‌کند.

MVP زمانی کامل است که یک تیم CRM بتواند از CSV ناشناس به audience قابل اجرا و Experiment Brief برسد؛ نه زمانی که تعداد صفحه‌های داشبورد زیاد شود.

## ۲. مسئله و کاربران

### مسئله

آپ نمی‌تواند از داده داخلی خود نتیجه بگیرد کاربر از رقیب خرید کرده است؛ اما می‌تواند کاهش خرید مجدد در کانال خود را مشاهده و مدیریت کند. policy ثابت ممکن است کاربران با cadence متفاوت، خرید طبیعی، قابلیت بازگشت متفاوت و ارزش مالی متفاوت را یکسان هدف بگیرد.

### کاربران محصول

| نقش | کار اصلی |
| --- | --- |
| مدیر تلکام / CMO | تصمیم درباره ارزش اقتصادی و ادامه پایلوت |
| مدیر CRM / Growth | دریافت audience، action و زمان اجرای کمپین |
| Data / BI | تأیید قرارداد داده، lineage و سلامت metric |
| CFO / مالی | تأیید contribution profit و هزینه مشوق |
| MarginLift Analyst | اجرای ممیزی، مدل، policy و readout در نسخه service-led |

## ۳. معیار موفقیت

### North Star پس از پایلوت

`Verified incremental contribution profit per eligible customer`

### معیارهای پشتیبان

- کاهش نرخ `Dormant` در cohort واجد شرایط.
- خرید مجدد ۳۰، ۹۰ و ۱۸۰روزه در کانال آپ.
- هزینه مشوق و هزینه کانال به‌ازای خرید افزایشی.
- calibration احتمال survival در افق‌های اصلی.
- درصد تصمیم‌های `no_action` بدون نقض guardrail درآمد.

### چیزی که موفقیت نیست

- AUC بالا بدون calibration و value case.
- conversion بیشتر با مشوق گران‌تر.
- کاهش churn تاریخی بدون holdout.
- رضایت از UI یا تعریف و تمجید از دمو.

## ۴. نقشه فرضیات

| نوع | فرضیه پرریسک | روش آزمون | گیت |
| --- | --- | --- | --- |
| مطلوبیت | owner برای retention سودمحور بودجه می‌دهد | Mom Test و پیشنهاد Diagnostic | تعهد داده + مسیر خرید رسمی |
| امکان‌پذیری | شناسه پایدار، نوع بسته و تاریخچه کافی وجود دارد | schema و ۱۰۰ ردیف ناشناس | Data Readiness غیرمسدود |
| اندازه‌گیری | policy فعلی و exposure قابل ثبت‌اند | walkthrough CRM | assignment و outcome قابل قفل |
| اقتصاد | ارزش محافظت‌شده از هزینه پروژه بیشتر است | Value Case با مالی | سناریوی محافظه‌کارانه قابل دفاع |
| اجرا | CRM می‌تواند audience جدید و `no_action` را اجرا کند | dry run یا shadow export | اجرای بدون خطا و بدون overlap |
| علیت | آپ holdout را می‌پذیرد | Experiment Brief | owner، sample و stopping rule تأییدشده |

**بالاترین ریسک فعلی:** داده point-in-time و امکان holdout؛ نه انتخاب الگوریتم.

## ۵. دامنه MVP

### داخل دامنه

- ورود CSV و schema نسخه‌بندی‌شده.
- ممیزی حریم خصوصی و Data Readiness.
- cleaning log و quarantine بدون imputation مخفی.
- cohort، cadence و Kaplan-Meier baseline.
- مدل Discrete-Time Survival baseline.
- احتمال عدم خرید در ۳۰، ۹۰ و ۱۸۰ روز.
- وضعیت‌های `Active / Due / Lapsed / Dormant / Reactivated`.
- reason code و سطح اعتماد.
- policy rule-based سودمحور و `no_action`.
- export مخاطبان و Experiment Brief.
- workspace پایلوت و Executive Readout.

### خارج از دامنه

- تشخیص خرید از کانال رقیب.
- scoring بلادرنگ.
- ارسال مستقیم پیام یا تخفیف.
- connector مستقیم CRM در پایلوت نخست.
- چند vertical یا چند use case هم‌زمان.
- deep learning، reinforcement learning و real-time feature store.
- ادعای causal پیش از holdout سالم.

## ۶. معماری هدف MVP

```text
Browser / RTL Workspace
          |
Node API + Auth + RBAC
          |
PostgreSQL + encrypted artifact metadata
          |
Durable batch job queue
          |
Python ML worker
  cleaning -> snapshots -> survival -> policy -> readout
```

تصمیم معماری:

- modular monolith؛ microservice اضافه ساخته نمی‌شود.
- Node مالک workflow، دسترسی، audit و API است.
- Python فقط batch analytics و model artifact را اجرا می‌کند.
- PostgreSQL پس از عبور Data Gate منبع حقیقت می‌شود.
- دیتابیس JSON فعلی برای دمو باقی می‌ماند و قبل از Gate 1 توسعه دامنه‌ای نمی‌گیرد.
- import و model run با idempotency key اجرا می‌شوند.
- هر prediction به dataset، feature، label و model version قابل ردیابی است.

## ۷. فازهای اجرا

### فاز صفر: Discovery و Data Gate

**هدف:** اثبات اینکه مسئله، داده، owner و مسیر خرید وجود دارند.

**کارها:**

- برگزاری جلسه نخست طبق بسته آپ.
- جلسه مشترک تلکام، CRM و Data.
- دریافت schema و ۱۰۰ ردیف ناشناس.
- نسخه‌بندی تعریف Channel Churn و eligibility.
- اجرای ممیزی و Value Case مقدماتی.

**خروجی:** `Proceed / Fix Data / Stop`.

**گیت خروج:**

- حداقل یک جلسه با امتیاز ۷ از ۱۰.
- CRM owner و Data owner مشخص.
- schema یا نمونه واقعی دریافت‌شده.
- مسیر Diagnostic پولی یا فرایند رسمی پایلوت روشن.

**Effort:** ۳ تا ۵ نفرروز؛ یک تا دو هفته تقویمی به‌دلیل هماهنگی سازمانی.

**تنظیم Codex:** همین مدل، effort بالا برای تحلیل جلسه و قرارداد داده؛ کدنویسی محصول ممنوع.

### فاز یک: Data Readiness MVP

**هدف:** تبدیل فایل واقعی به dataset قابل ممیزی و point-in-time.

**قابلیت‌ها:**

- قرارداد اختصاصی transaction و intervention.
- schema mapping کنترل‌شده.
- immutable raw import، checksum و audit trail.
- اعتبارسنجی نوع، timezone، duplicate، refund و PII.
- cleaning plan، quarantine و clean dataset version.
- snapshot builder بدون leakage و گزارش censoring.

**API حداقلی:**

```text
POST /api/v1/channel-retention/imports
GET  /api/v1/channel-retention/imports/:id/readiness
POST /api/v1/channel-retention/datasets
GET  /api/v1/channel-retention/datasets/:id
```

**گیت خروج:**

- نمونه واقعی وضعیت `ready` بگیرد.
- PII مستقیم رد شود.
- raw و clean row count reconciliation داشته باشند.
- یک dataset با cut-off، feature version و label version بازتولید شود.
- تست tenant isolation، idempotency و فایل خراب پاس شود.

**Effort:** ۶ تا ۹ نفرروز.

**تنظیم Codex:** effort بالا؛ یک task برای backend/data contract و یک task جدا برای تست و security review.

### فاز دو: Survival Baseline

**هدف:** ساخت تخمین زمان خرید بعدی که از baseline ساده بهتر و قابل توضیح باشد.

**ترتیب مدل‌ها:**

1. empirical cadence و Kaplan-Meier بر اساس cohort.
2. Discrete-Time Logistic Hazard به‌عنوان مدل اصلی MVP.
3. Cox PH فقط برای benchmark و بررسی نسبت خطر.
4. Gradient-Boosted Survival فقط challenger پس از عبور baseline.

مدل جداگانه ۳۰، ۹۰ و ۱۸۰روزه ساخته نمی‌شود؛ احتمال‌ها از یک survival curve سازگار استخراج می‌شوند.

**Featureهای اولیه:**

- recency، frequency، tenure و فاصله‌های خرید.
- نوع، اعتبار و اپراتور بسته.
- تغییر cadence و روند مبلغ.
- سابقه تخفیف و واکنش به کمپین.
- refund/failure rate و app engagement فقط در صورت کیفیت کافی.

**معیارها:**

- Integrated Brier Score و Brier در افق‌های اصلی.
- time-dependent AUC و concordance برای رتبه‌بندی، نه به‌تنهایی.
- calibration plot و calibration error در ۳۰/۹۰/۱۸۰ روز.
- lift و capture rate در top risk bands.
- sliceهای اپراتور، نوع بسته، tenure و cohort زمانی.
- پایداری در حداقل دو temporal holdout.

**گیت خروج:**

- leakage testها پاس شوند.
- مدل اصلی از constant و Kaplan-Meier baseline در Brier بهتر باشد.
- calibration قابل قبول و جهت نتایج در دو پنجره زمانی پایدار باشد.
- هر risk score دارای model version، cut-off و reason code باشد.
- اگر challenger برتری پایدار ندارد، همان baseline ساده حفظ شود.

**Effort:** ۹ تا ۱۳ نفرروز.

**تنظیم Codex:** effort بالا یا بسیار بالا؛ اجرای مستقل data-science review و adversarial leakage review.

### فاز سه: Decisioning و Analyst Workspace

**هدف:** تبدیل risk score به تصمیم قابل استفاده CRM؛ این فاز MVP قابل نمایش را کامل می‌کند.

**Policy اولیه:**

```text
Expected Decision Value
= P(save because of action) * expected contribution profit
- incentive cost
- channel cost
- risk penalty
```

تا پیش از داده treatment معتبر، `P(save because of action)` تخمین causal نیست و policy با برچسب `observational` یا rule-based نمایش داده می‌شود.

**پنج نمای محصول:**

1. Data Readiness و خطاهای قابل اصلاح.
2. Retention Overview و survival curve.
3. Customer Decisions با reason، confidence و `no_action`.
4. Pilot Workspace و وضعیت ownerها.
5. Executive Readout با تصمیم و سطح شواهد.

**گیت خروج:**

- کاربر CRM بتواند audience را با ستون‌های قراردادی export کند.
- هیچ توصیه‌ای بدون evidence label، reason code و policy version صادر نشود.
- سود یا صرفه‌جویی منفی به‌عنوان موفقیت نمایش داده نشود.
- workflow کامل در RTL و دسکتاپ بدون توضیح توسعه‌دهنده اجرا شود.
- مدیر در تست کاربر ظرف ۶۰ ثانیه تصمیم، عدد، ریسک و اقدام بعدی را پیدا کند.

**Effort:** ۸ تا ۱۲ نفرروز.

**تنظیم Codex:** backend و decisioning با effort بالا؛ UI با effort متوسط رو به بالا. موشن فقط transitionهای وضعیت و reduced-motion.

### فاز چهار: Shadow Mode و Pilot Readiness

**هدف:** بررسی اینکه مدل و workflow در داده تازه سالم می‌مانند، بدون اثر بر مشتری نهایی.

**کارها:**

- score batch هفتگی یا متناسب با cadence.
- مقایسه prediction با outcome پس از بسته‌شدن پنجره.
- drift، freshness، calibration و segment stability.
- dry-run audience export با CRM.
- طراحی و pre-register کردن آزمایش policy.
- محاسبه sample size با baseline و MDE واقعی.

**گیت خروج:**

- حداقل دو run متوالی بدون خطای داده یا train/serve skew.
- CRM audience را بدون overlap و با exclusion درست اجرا کند.
- sample، مدت، owner، primary metric و stopping rule قفل شوند.
- تصمیم امنیتی و حقوقی انتقال داده ثبت شود.

**Effort:** ۶ تا ۹ نفرروز و دو چرخه داده برای مشاهده پایداری.

**تنظیم Codex:** effort بالا برای observability، experiment contract و threat review.

### فاز پنج: Live Holdout

**هدف:** اثبات اینکه policy MarginLift نسبت به policy فعلی سود بیشتری ایجاد می‌کند.

**طراحی:**

- واحد تخصیص: `customer_id_hash`.
- کنترل: audience انتخاب‌شده با policy فعلی CRM.
- treatment: audience انتخاب‌شده با policy MarginLift.
- متن، کانال، زمان و مقدار مشوق در آزمون اول یکسان.
- تحلیل اصلی: Intention-To-Treat.
- metric اصلی: contribution profit به‌ازای eligible customer.
- guardrail: درآمد، conversion، مشوق، opt-out، شکایت و SRM.

**گیت خروج:**

- outcome window بسته و tracking معتبر باشد.
- نتیجه با interval و محدودیت گزارش شود.
- `Scale` فقط با سود مثبت و guardrail سالم.
- `Iterate` برای جهت مثبت اما عدم‌قطعیت یا مشکل اصلاح‌پذیر.
- `Stop` برای زیان، شکست guardrail یا آزمایش نامعتبر.

**Effort ساخت:** ۵ تا ۸ نفرروز.

**زمان تقویمی:** نتیجه اصلی ۹۰ روز؛ follow-up پایداری در ۱۸۰ روز. این زمان با نیروی بیشتر کوتاه نمی‌شود.

**تنظیم Codex:** effort بالا برای تحلیل و decision receipt؛ هیچ تغییر model یا policy وسط آزمون مجاز نیست.

### فاز شش: Productization پس از Proof

**شروع فقط اگر:** پایلوت سالم، تعهد ادامه و workflow مشترک حداقل دو مشتری وجود داشته باشد.

**قابلیت‌ها:**

- PostgreSQL کامل tenant-aware و migration نهایی از state فعلی.
- job queue پایدار، retry و alerting.
- RBAC تفکیک‌شده برای import، approve، export و readout.
- connector اول بر اساس workflow واقعی، نه حدس.
- billing، onboarding و SLA محدود.
- monitoring drift و policy performance.

**Effort:** ۱۲ تا ۲۰ نفرروز برای نسخه نخست؛ connectorها جداگانه برآورد می‌شوند.

**تنظیم Codex:** effort بالا؛ security scan، API review، migration validation و production checklist اجباری.

## ۸. جمع‌بندی effort

| نقطه تحویل | Effort مهندسی | زمان تقویمی محتمل |
| --- | ---: | ---: |
| Data-ready diagnostic | ۹ تا ۱۴ نفرروز | ۲ تا ۴ هفته با هماهنگی داده |
| MVP قابل نمایش و export | ۲۶ تا ۳۹ نفرروز | ۶ تا ۹ هفته برای یک توسعه‌دهنده متمرکز |
| Pilot-ready shadow system | ۳۲ تا ۴۸ نفرروز | ۸ تا ۱۲ هفته + چرخه داده |
| Readout معتبر | ۳۷ تا ۵۶ نفرروز | زمان بالا + حداقل ۹۰ روز outcome |

این برآورد شامل تأخیر حقوقی، امنیتی و دریافت داده نیست. سرعت تحویل با حذف گیت‌ها بالا نمی‌رود؛ فقط احتمال تولید نتیجه غلط بیشتر می‌شود.

## ۹. ترتیب Sprintها

| Sprint | دامنه | شرط شروع |
| --- | --- | --- |
| Sprint 0 | Discovery، schema و data gate | جلسه آپ |
| Sprint 1 | Import، readiness و clean dataset | نمونه واقعی |
| Sprint 2 | snapshot، censoring و baseline | dataset ready |
| Sprint 3 | survival model و evaluation | baseline reproducible |
| Sprint 4 | decision policy، export و readout | model gate passed |
| Sprint 5 | shadow mode و experiment registry | CRM owner ready |
| Sprint 6 | live holdout instrumentation | experiment approved |

## ۱۰. Definition of Done نسخه اولیه

MVP اولیه فقط وقتی Done است که این سناریو انتهابه‌انتها پاس شود:

> با فرض دریافت فایل ناشناس معتبر، وقتی Analyst import را اجرا می‌کند، سیستم باید readiness و cleaning report تولید کند؛ dataset point-in-time بسازد؛ survival risk و وضعیت هر کاربر را با نسخه و reason نمایش دهد؛ audience قابل اجرا و `no_action` صادر کند؛ و Experiment Brief را بدون ادعای causal پیش از holdout تحویل دهد.

معیارهای غیرعملکردی:

- import تکراری داده را دو بار ثبت نکند.
- PII مستقیم و schema ناسازگار با خطای قابل اصلاح رد شوند.
- هیچ prediction یا decision بدون lineage ذخیره نشود.
- خروجی فارسی RTL، اعداد خوانا و متن بدون به‌هم‌ریختگی داشته باشد.
- رخدادهای حساس audit شوند و tenant به داده tenant دیگر دسترسی نداشته باشد.
- خروجی مدل در اجرای مجدد با artifact یکسان بازتولید شود.

## ۱۱. تصمیم شروع

**الآن فقط Sprint 0 مجاز است.** Sprint 1 پس از دریافت schema یا نمونه واقعی آغاز می‌شود. ساخت مدل، دیتابیس دامنه‌ای و UI جدید پیش از عبور این گیت، خلاف تصمیم محصول است.

