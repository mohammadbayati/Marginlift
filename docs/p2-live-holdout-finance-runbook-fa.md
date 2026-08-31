# راهنمای اجرای P2: Live Holdout و Finance Readout

## خروجی مورد انتظار

در پایان P2 فقط یکی از سه تصمیم صادر می‌شود:

- `Scale`: کران پایین فاصله اطمینان سود مثبت است، Guardrailها پاس شده‌اند و Finance اعداد را تطبیق داده است.
- `Review`: نتیجه معتبر است اما عدم‌قطعیت برای افزایش بودجه زیاد است.
- `Stop`: سود نقطه‌ای منفی یا حداقل یک Guardrail نقض شده است.

## ۱. پیش‌نیاز غیرقابل دورزدن

Metric Contract باید قبل از Assignment قفل شده باشد و شامل این موارد باشد:

- پنجره Outcome دقیقاً ۳۰ روز
- حداقل نمونه هر سیاست
- کف درآمد افزایشی
- سقف افزایش opt-out
- سقف افزایش شکایت
- سقف افزایش هزینه مشوق به‌ازای مشتری
- تأیید CRM، Data و Finance

دو Shadow Run متوالی و سالم نیز الزامی است. سامانه در غیر این صورت آزمایش را ثبت نمی‌کند.

## ۲. ثبت و اجرای Assignment

1. در صفحه «پایلوت»، «ثبت آزمایش» را بزنید.
2. فایل Assignment را دانلود کنید.
3. فایل را بدون تغییر در registry سمت مشتری ثبت کنید.
4. `assignment_registry_hash` و `outcome_closes_at` را نگه دارید.
5. تحلیل اصلی ITT است؛ delivery ناموفق باعث خروج کاربر از گروه نمی‌شود.

Assignment با hash پایدار رتبه‌بندی و به‌صورت ۱:۱ بین `current_crm_policy` و `marginlift_policy` تقسیم می‌شود. همان analysis دوباره Assignment تازه تولید نمی‌کند.

## ۳. ساخت Outcome سی‌روزه

پس از بسته‌شدن پنجره، قالب SQL زیر را با schema تأییدشده مشتری تطبیق دهید:

`ops/pilot/retention-outcome-30d.template.sql`

هدر CSV مرجع نیز در `ops/pilot/retention-outcome-30d.template.csv` قرار دارد.

هر Assignment دقیقاً یک ردیف Outcome دارد. نبود خرید باید با `repurchased=false` و مقادیر مالی صفر ثبت شود؛ حذف ردیف مجاز نیست. ستون `contaminated` نیز باید از ممیزی کمپین‌های هم‌زمان استخراج شود؛ مقدار خالی مجوز تصمیم نهایی نمی‌گیرد.

## ۴. کنترل مستقل Python

```powershell
python scripts/verify_live_holdout.py assignment.csv outcome.csv `
  --min-incremental-net-revenue 0 `
  --max-incremental-incentive-cost 2000 `
  --max-opt-out-delta 0.005 `
  --max-complaint-delta 0.002 `
  --json
```

مقادیر threshold باید دقیقاً از Metric Contract قفل‌شده برداشته شوند. خروجی Python هنوز `pilot_estimate` است و به‌تنهایی مجوز Scale نمی‌دهد.

## ۵. Preview و Import

1. CSV Outcome را در صفحه «پایلوت» انتخاب کنید.
2. «ممیزی Outcome» را بزنید.
3. فقط همان فایل Previewشده را Import کنید؛ تغییر یک مقدار باعث رد hash می‌شود.
4. نسخه‌ای که Finance تأیید کند، immutable است.

گیت‌ها شامل Registry، زمان تخصیص، پنجره ۳۰روزه، پوشش حداقل ۹۵٪، SRM، sample support و کامل‌بودن اعداد مالی است.

## ۶. تطبیق Finance

Finance باید پنج جمع مستقل را از دفتر یا mart مالی وارد کند:

- درآمد خالص
- حاشیه سود مشارکتی
- هزینه مشوق
- هزینه کانال
- بازپرداخت

تأیید فقط زمانی ممکن است که اختلاف هر پنج مقدار داخل tolerance مصوب باشد. تأیید متنی بدون عدد پذیرفته نمی‌شود.

## مرز ادعا

تا پیش از بسته‌شدن پنجره، عبور گیت‌های integrity و reconciliation مالی، عبارت «سود تأییدشده» و تصمیم Scale ممنوع است.
