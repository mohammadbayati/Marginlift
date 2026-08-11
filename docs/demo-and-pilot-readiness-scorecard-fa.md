# Scorecard آمادگی MarginLift

نسخه: ۱.۰
تعریف «۱۰۰٪»: همه دروازه‌های اجباری زیر باید شواهد قابل تکرار داشته باشند. این امتیاز به معنی نبود ریسک یا اثبات Product-Market Fit نیست.

## ۱. Demo-Ready

| دروازه | معیار قبولی | شاهد |
| --- | --- | --- |
| دسترسی عمومی | دامنه اصلی و HTTPS پاسخ ۲۰۰ بدهند | `npm run production:smoke` |
| سلامت زیرساخت | Health برابر `ok` و storage برابر PostgreSQL باشد | Production smoke |
| ورود کنترل‌شده | ثبت‌نام عمومی خاموش و ورود فقط با حساب صادرشده باشد | `/api/public-config` و تست config |
| حساب مهمان | نقش `viewer`، رمز موقت قوی و تاریخ انقضا داشته باشد | `npm run demo-user` |
| عدم تغییر داده | import، export حساس و عملیات analyst برای viewer پاسخ ۴۰۳ بدهند | Production smoke |
| مسیر نمایشی کامل | صفحات تصمیم، نگهداشت، داده، پایلوت و governance بدون خطا باز شوند | Production smoke و QA مرورگر |
| پیام شفاف | داده مصنوعی و محدودیت ادعای علّی واضح باشد | UI و راهنمای دمو |
| گزارش مدیریتی | گزارش PDF از outcome نمونه قابل مشاهده باشد | سناریوی مرورگر |
| امنیت پایه وب | CSP، HSTS، منع iframe، nosniff و no-referrer فعال باشند | تست server و Production smoke |
| پایداری مسیرها | فایل مفقود ۴۰۴ بدهد و فرایند سرور سالم بماند | تست server |
| راهنمای مشتری | ورود، مسیر ۷ دقیقه‌ای، محدودیت‌ها و قدم بعدی روشن باشند | `docs/demo-user-guide-fa.txt` |
| بازگشت‌پذیری انتشار | نسخه قبلی و بکاپ قبل از deploy نگه‌داری شوند | اسکریپت deploy |

**قاعده امتیاز:** هر ردیف ۱ امتیاز دارد؛ فقط ۱۲ از ۱۲ برابر ۱۰۰٪ است. هر شکست، وضعیت را فوراً `NO-GO` می‌کند.

## ۲. Service-Led Pilot-Ready

| دروازه | معیار قبولی | شاهد |
| --- | --- | --- |
| تعریف مسئله | outcome، افق زمانی، واحد تحلیل و تصمیم نهایی مکتوب باشند | Pilot kickoff pack |
| قرارداد داده | ستون‌های لازم، معنای هر ستون و مالک داده مشخص باشند | Pilot data request |
| حریم خصوصی | شناسه ناشناس؛ PII مستقیم در ورودی رد شود | pipeline و تست‌ها |
| آمادگی داده | خروجی `ready`، `diagnostic_only` یا `needs_fix` بدون ادعای بیش از شواهد | Data Readiness |
| خط مبنا | baseline، model card و نسخه policy ثبت شوند | Model Governance |
| طراحی آزمایش | holdout، تخصیص، KPI، guardrail و پنجره outcome پیش‌ثبت شوند | Experiment Registry |
| کنترل اجرا | Shadow Mode و کنترل ظرفیت قبل از ارسال واقعی انجام شوند | Retention Workspace |
| Outcome Loop | نتیجه فقط به experiment معتبر متصل و integrity بررسی شود | Outcome API و تست‌ها |
| تصمیم مدیریتی | scale، revise یا stop همراه با عدم‌قطعیت و دلیل صادر شود | Executive readout |
| کنترل دسترسی | نقش‌های owner/admin/analyst/viewer و audit log فعال باشند | RBAC tests |
| تداوم خدمت | PostgreSQL، بکاپ روزانه، restore-test و rollback موجود باشند | VM scripts و timer |
| تحویل مشتری | RACI، cadence، acceptance، incident path و خروجی‌های هفتگی مشخص باشند | Service-led pilot runbook |

**قاعده امتیاز:** هر ردیف ۱ امتیاز دارد؛ فقط ۱۲ از ۱۲ برابر ۱۰۰٪ آمادگی داخلی برای شروع پایلوت است.

## دروازه فعال‌سازی هر مشتری

حتی با آمادگی داخلی ۱۰۰٪، پایلوت واقعی تا تکمیل این پنج مورد شروع نمی‌شود:

1. مالک کسب‌وکاری و مالک داده معرفی شده‌اند.
2. مسئله، KPI اصلی، guardrail و بودجه به تأیید کتبی رسیده‌اند.
3. نمونه داده ناشناس Data Readiness را پاس کرده است.
4. holdout و پنجره outcome قبل از اجرا ثبت شده‌اند.
5. سطح دسترسی، نگه‌داری داده و مسیر incident مورد توافق است.

کمبود هر مورد بالا یعنی `NO-GO` برای اجرای live، نه مجوز حدس‌زدن یا پرکردن جای خالی با مدل.
