# گیت‌های ساخت سرویس Churn

## ترتیب تصمیم

```text
Mom Test
  -> تعهد داده یا پول
  -> ممیزی داده
  -> تحلیل دستی
  -> مدل baseline آفلاین
  -> shadow mode
  -> آزمایش policy
  -> readout مالی
  -> ساخت محصول تکرارپذیر
```

عبور از هر مرحله لازم است. علاقه به دمو، AUC آفلاین یا یک نمودار خوب جایگزین گیت قبلی نمی‌شود.

## Gate 0 - مسئله و خریدار

ورودی: پنج مصاحبه طبق `churn-mom-test-discovery.md`.

معیار عبور:

- حداقل چهار جلسه با امتیاز Mom Test برابر ۷ یا بیشتر.
- تکرار مسئله بدون معرفی MarginLift در حداقل سه شرکت.
- شناسایی کاربر عملیاتی، صاحب داده و خریدار اقتصادی.
- حداقل یک تعهد پولی، LOI یا فرایند رسمی پایلوت.

در صورت شکست: ساخت متوقف و ICP یا مسئله بازتعریف می‌شود.

## Gate 1 - امکان داده

ورودی: فایل رویدادی ناشناس طبق `churn-data-contract.md`.

معیار عبور:

- ممیزی `needs_data_fix` نباشد.
- حداقل یک فایل واقعی وضعیت `ready` بگیرد.
- تعریف churn با چرخه خرید مشتری تطبیق داده شود.
- snapshot و label به‌شکل point-in-time قابل ساخت باشند.
- PII مستقیم وارد سامانه نشود.

در وضعیت `diagnostic_only` فقط تحلیل cohort و RFM تحویل می‌شود؛ مدل ساخته نمی‌شود.

## Gate 2 - مدل آفلاین

### خط مبنا

- پیش‌بینی ثابت بر اساس prevalence.
- امتیاز قاعده‌محور فعلی MarginLift.
- Logistic Regression کالیبره‌شده به‌عنوان نخستین مدل قابل آموزش.

Gradient Boosting فقط challenger است.

### تقسیم داده

- Train: قدیمی‌ترین پنجره‌های کامل.
- Development: پنجره زمانی بعدی برای انتخاب feature و threshold.
- Test: جدیدترین پنجره کامل و دست‌نخورده.
- customer و outcome بعد از `index_date` نباید وارد feature شوند.

### معیار عبور

- همه leakage testها پاس شوند.
- PR-AUC از prevalence baseline بهتر باشد.
- Brier Score از پیش‌بینی ثابت بهتر باشد.
- Lift در ۲۰٪ پرریسک حداقل دو برابر نرخ پایه باشد.
- calibration و performance slice برای cohortهای اصلی گزارش شود.
- نتیجه در حداقل دو پنجره زمانی هم‌جهت باشد.

این معیارها پیش‌فرض‌اند و پس از مشاهده prevalence واقعی نسخه‌بندی می‌شوند.

## فعال‌شدن Arbor

Arbor قبل از Gate 2 اجرا نمی‌شود. ورودی لازم:

```text
M0: Logistic Regression کالیبره‌شده و قابل اجرا
O: بهبود کیفیت رتبه‌بندی و calibration بدون افت sliceها
E_dev: ارزیابی روی پنجره development
E_test: پنجره زمانی held-out که در جست‌وجو دیده نمی‌شود
```

فرضیه‌های مناسب برای Hypothesis Tree:

- پنجره‌های متفاوت recency و frequency.
- نرمال‌سازی بر اساس cadence هر cohort.
- class weighting و threshold سودمحور.
- calibration با Platt یا isotonic.
- Gradient Boosting با featureهای محدود و قابل توضیح.

هر candidate فقط در صورت بهبود evaluator تست و عبور slice guardrail جایگزین baseline می‌شود. Test set ابزار جست‌وجو نیست.

## Gate 3 - Shadow Mode

مدل هر هفته score تولید می‌کند، اما هیچ پیام یا تخفیفی اجرا نمی‌شود.

معیار عبور:

- feature freshness و train/serve parity سالم باشد.
- prediction، model version و feature version ثبت شوند.
- calibration پس از رسیدن outcome واقعی حفظ شود.
- تیم CRM بتواند دلیل score و محدودیت آن را توضیح دهد.
- drift بحرانی یا افت شدید completeness وجود نداشته باشد.

## Gate 4 - آزمایش Policy

### فرضیه

اگر سیاست فعلی نگهداشت برای جمعیت واجد شرایط با سیاست MarginLift جایگزین شود، سود مشارکتی افزایشی به‌ازای مشتری بیشتر می‌شود؛ چون تخفیف از مشتریان کم‌اثر حذف و به مشتریان قابل‌نجات اختصاص داده می‌شود.

### طراحی

| جزء | قرارداد |
| --- | --- |
| واحد تخصیص | `customer_id` hash‌شده |
| کنترل | سیاست فعلی CRM |
| treatment | سیاست MarginLift با گزینه واقعی `no_action` |
| معیار اصلی | contribution profit به‌ازای مشتری واجد شرایط |
| guardrail | درآمد، conversion، شکایت، opt-out و هزینه مشوق |
| تحلیل اصلی | Intention-To-Treat |
| تخصیص | ۵۰/۵۰، مگر اینکه محدودیت ریسک طرح محافظه‌کارانه را توجیه کند |
| مدت | حداقل یک چرخه کامل خرید؛ قبل از شروع قفل می‌شود |

### پیش از اجرا

- baseline، MDE، alpha، power و sample size محاسبه و ثبت شوند.
- eligibility، exclusion، stopping rule و owner مشخص باشند.
- assignment روی سرور تولید و قبل از exposure قفل شود.
- A/A یا QA instrumentation انجام شود.
- چند کمپین هم‌زمان و coupon leakage بررسی شوند.

### حین اجرا

- نتیجه برای برنده اعلام‌کردن زودهنگام بررسی نمی‌شود.
- SRM، خرابی tracking و guardrail ایمنی پایش می‌شوند.
- policy، audience و تخفیف وسط آزمایش تغییر نمی‌کنند.

### تصمیم

- `Scale`: lower bound سود افزایشی مثبت و همه guardrailها سالم.
- `Iterate`: جهت اقتصادی امیدوارکننده ولی عدم‌قطعیت یا مشکل قابل اصلاح وجود دارد.
- `Stop`: ارزش منفی، شکست guardrail یا سلامت نامعتبر آزمایش.

## Backend پس از عبور Gate 1

معماری در شروع modular monolith می‌ماند:

```text
Node API + Auth + RBAC
        |
PostgreSQL + encrypted artifacts
        |
Durable job queue
        |
Python batch ML worker
```

Microservice، Redis و scoring بلادرنگ تا زمان اثبات حجم و latency لازم نیستند.

### موجودیت‌ها

- `churn_definition`
- `data_source`
- `customer_event`
- `feature_snapshot`
- `label_snapshot`
- `dataset_version`
- `model_version`
- `prediction_run`
- `customer_prediction`
- `policy_version`
- `policy_decision`

همه موجودیت‌های tenant-scoped باید `organization_id`، زمان ایجاد، نسخه و audit metadata داشته باشند.

### API پیشنهادی

```text
POST /api/v1/churn/data-audits
GET  /api/v1/churn/data-audits/:id
POST /api/v1/churn/model-runs
GET  /api/v1/churn/model-runs/:id
POST /api/v1/churn/score-runs
GET  /api/v1/churn/score-runs/:id
GET  /api/v1/churn/customers
GET  /api/v1/churn/model-health
```

عملیات سنگین `202 Accepted` و شناسه job برمی‌گردانند. import و score run باید idempotency key داشته باشند.

### الزامات امنیت و کیفیت

- PII مستقیم رد شود و شناسه فقط hash‌شده نگه‌داری شود.
- RBAC روی import، training، approval و export جدا باشد.
- validation سمت سرور و محدودیت حجم فایل اجباری است.
- migration، rollback، audit و retention policy قبل از داده واقعی آماده باشند.
- تست‌ها شامل unit، contract، integration، migration و tenant isolation باشند.
- model artifact، feature version و decision باید قابل ردیابی باشند.

## Gate 5 - ساخت محصول تکرارپذیر

ساخت UI کامل، connector و اتوماسیون فقط زمانی آغاز می‌شود که:

- حداقل یک پایلوت سالم readout شده باشد.
- مشتری برای ادامه، تمدید یا قرارداد ماهانه تعهد داده باشد.
- گردش‌کار مشترک حداقل دو مشتری شناسایی شده باشد.
- بخش دستی فرایند و دلیل خودکارسازی آن روشن باشد.

تا قبل از این گیت، کار service-led باقی می‌ماند.
