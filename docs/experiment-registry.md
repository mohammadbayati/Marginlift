# Experiment Registry و Outcome Integrity Gate

## هدف

هیچ فایل outcome نباید صرفا با شباهت نام ستون‌ها به یک ادعای اثر افزایشی تبدیل شود. هر outcome باید به یک آزمایش ثبت‌شده وصل باشد و قبل از ورود به تصمیم مدیریتی از گیت سلامت عبور کند.

## قرارداد Experiment

با هر ورود داده مشتری، یک Experiment Registry ساخته می‌شود که شامل موارد زیر است:

- شناسه پایدار آزمایش و شناسه تحلیل مبنا
- اثرانگشت SHA-256 داده assignment
- روش تخصیص، گروه‌ها، نسبت مورد انتظار و پنجره outcome
- رجیستری خصوصی `customer_id`، گروه تخصیص‌یافته و exposure
- وضعیت سلامت assignment

API عمومی فقط خلاصه گروه‌ها و وضعیت سلامت را برمی‌گرداند و رجیستری مشتریان را افشا نمی‌کند.

اعلام دستی `assignmentMethod=randomized` معتبر محسوب نمی‌شود. randomization فقط وقتی تأیید می‌شود که MarginLift با مسیر ثبت prospective، assignment را روی سرور تولید و evidence الگوریتم، seed hash، population hash و زمان تولید را ثبت کرده باشد.

## ثبت پایلوت Prospective

پس از Data Onboarding:

1. `POST /api/experiments/register` جمعیت واجد شرایط را از policy فعلی می‌گیرد.
2. کنترل با الگوریتم `sha256_ranked_holdout_v1` و seed تصادفی سرور انتخاب می‌شود.
   seed خام فقط در رکورد داخلی نگهداری می‌شود تا تخصیص قابل بازتولید باشد؛ API عمومی تنها hash آن را نمایش می‌دهد.
3. Analysis Plan و جمعیت آزمایش همان لحظه قفل می‌شوند.
4. فایل اجرای کمپین از `GET /api/experiments/current/assignments.csv` دریافت می‌شود.
5. تا پایان یا ورود outcome، ثبت دوباره آزمایش فعال با خطای `409` مسدود است.

## قواعد ورود Outcome

درخواست `POST /api/outcomes/import` باید `experimentId` داشته باشد. موارد زیر خطای قطعی و باعث رد کامل فایل با پاسخ `422` هستند:

- `customer_id` تکراری در outcome
- مشتری خارج از Registry
- عدم تطابق `assigned_group` با assignment ثبت‌شده
- گروه ناشناخته
- درآمد، هزینه یا margin نامعتبر
- نبود `exposed_at` برای treatment

موارد زیر فایل را نگه می‌دارند، اما تصمیم scale را مسدود می‌کنند:

- تخصیص غیرتصادفی یا تأییدنشده
- آلودگی گروه کنترل
- پوشش outcome کمتر از ۹۵ درصد
- بسته‌نشدن پنجره outcome
- Sample Ratio Mismatch با آستانه `p < 0.01`
- تعداد مورد انتظار کمتر از ۵ در هر گروه

## نسخه‌بندی و Provenance

هر outcome پذیرفته‌شده یک نسخه افزایشی می‌گیرد. نسخه جدید رکورد قبلی را پاک نمی‌کند و با `supersedesOutcomeId` به آن متصل می‌شود. هر نسخه این موارد را ثبت می‌کند:

- اثرانگشت داده assignment
- اثرانگشت فایل outcome
- نسخه schema هر دو فایل
- شناسه Experiment و تحلیل مبنا
- شماره نسخه outcome

## سطح شواهد

عبور از Integrity Gate به‌تنهایی به معنی اثبات نهایی اثر causal نیست. این گیت فقط حداقل سلامت اجرایی را تأیید می‌کند. ارتقا به اثر افزایشی تأییدشده به استنباط آماری، بازه اطمینان، guardrailها و تأیید قرارداد مالی نیاز دارد.

## رفتار داده‌های قدیمی

رکوردهای قدیمی بدون `experimentId` حذف نمی‌شوند، اما برای outcome جدید و تصمیم scale معتبر نیستند. کاربر باید CSV مشتری را دوباره وارد کند تا Registry ساخته شود. outcomeهای بدون اتصال نیز در Workspace جدید نمایش داده نمی‌شوند.

## APIها

- `GET /api/experiments/current`: خلاصه امن Experiment فعال
- `POST /api/experiments/register`: ساخت و قفل assignment پایلوت prospective
- `GET /api/experiments/current/assignments.csv`: فایل assignment قابل اجرا
- `POST /api/outcomes/import`: ورود outcome متصل و اجرای Integrity Gate
- `GET /api/pilot/workspace`: وضعیت آزمایش، گیت و آخرین نسخه outcome
- `GET /api/pilot/readout.md`: گزارش مدیریتی همراه شناسنامه و provenance
