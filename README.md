# دموی MVP MarginLift

دموی استاتیک مسابقه برای RFS #049؛ یک پلتفرم تصمیم‌گیری برای uplift، churn و بودجه مشوق.

برای نسخه محصولی، پروژه را با Node اجرا کنید:

```bash
npm start
```

بعد این آدرس را باز کنید:

```text
http://localhost:3000
```

صفحه فروش:

```text
http://localhost:3000/sales.html
```

صفحه پیشنهاد پایلوت:

```text
http://localhost:3000/pilot.html
```

صفحه deck سرمایه‌گذار/مسابقه:

```text
http://localhost:3000/deck.html
```

هاب ارسال و ارائه:

```text
http://localhost:3000/submission.html
```

این نسخه با داده مصنوعی و deterministic نشان می‌دهد چطور یک موتور تصمیم‌گیری مشوق می‌تواند با منطق uplift و گروه کنترل، هدررفت تخفیف را کاهش دهد.

## این دمو چه چیزی را نشان می‌دهد

- نمای کلی کمپین تاریخی.
- ورود و ثبت‌نام واقعی با session سمت سرور.
- آپلود CSV کمپین و تحلیل سمت سرور.
- بخش محصول قابل‌فروش برای توضیح دقیق پیشنهاد B2B.
- مقایسه گروه کنترل با کاربران دریافت‌کننده مشوق.
- uplift در سطح سگمنت.
- بازه اطمینان، کیفیت داده و گاردریل تصمیم.
- تخمین هدررفت مشوق.
- برنامه اقدام پیشنهادی برای کمپین بعدی.
- خلاصه ROI برای مدیر رشد یا CRM.
- صفحه فروش، one-pager، اسکریپت دمو، pitch deck outline و برنامه GTM.
- بنچمارک رقبا از آژانس‌های Digital Marketing و AI Marketing و تبدیل ایده‌های قابل‌استفاده به بخش‌های audit، اتاق شواهد و proof stack.
- Pilot Kit شامل data request، experiment brief، proposal و صفحه قابل‌ارسال پایلوت.
- Investor Kit شامل source of truth، memo، talk track، Q&A و deck وب‌محور.
- Submission Kit شامل hub ارائه، چک‌لیست آمادگی، نقشه راه ۳۰روزه و متریک‌های PMF.
- Product hardening شامل event tracking محلی، export گزارش کمپین و پنل سلامت پایلوت.

## جهت طراحی

نسخه فعلی برای مخاطب فارسی‌زبان و ارائه مسابقه بازطراحی شده است:

- راست‌چین کامل با جداسازی کنترل‌شده واژه‌های انگلیسی مثل `MarginLift` و `uplift`.
- فونت اصلی `Vazirmatn` با fallback امن روی `IRANSansX` و فونت‌های سیستمی.
- اعداد فارسی با `fa-IR`.
- چیدمان داشبورد متراکم با sidebar، نوار workspace، کارت‌های KPI، پنل insight، جدول decisioning و بخش پایلوت.
- الهام بصری از داشبوردهای مدرن eCommerce و B2B analytics، بدون کپی مستقیم.

## داده

فایل `synthetic-campaign-data.csv` یک دیتاست aggregate و کوچک برای توضیح منطق دمو است. اگر کاربر کمپین جدید وارد نکند، backend همین فایل را تحلیل می‌کند و خروجی را به داشبورد می‌دهد.

منطق مرحله ۲ در این سند توضیح داده شده است:

```text
docs/analysis-engine.md
```

بنچمارک رقبا و ایده‌هایی که از آن وارد محصول شده‌اند:

```text
docs/competitive-benchmark-digital-marketing.md
```

## نکته مهم

همه اعداد فرضی و مصنوعی‌اند. هدف آن‌ها storytelling مسابقه و مکالمه با اولین مشتری‌هاست، نه ادعای نتیجه واقعی مشتری.

در توسعه محلی از JSON DB استفاده می‌شود؛ production روی PostgreSQL، backup، audit زنجیره‌ای و کنترل دسترسی نقش‌محور اجرا می‌شود.

## Hardening

- `docs/product-hardening-1.md`: event tracking محلی و خروجی گزارش.
- `docs/product-hardening-2.md`: فانل استفاده، فعالیت‌های اخیر و تست integration سرور.

## بازبینی راهبردی نسخه ۲

- `docs/product-reassessment-2026.md`: جمع‌بندی کتاب‌ها، ممیزی محصول و محاسبات، معماری هدف و برنامه اجرایی ۱۲ هفته‌ای.
- `docs/claim-ladder.md`: قرارداد سطح شواهد و زبان مجاز برای KPIها و تصمیم‌های مالی.
- `docs/experiment-registry.md`: قرارداد Experiment Registry، گیت سلامت outcome، نسخه‌بندی و رفتار داده‌های قدیمی.
- `docs/statistical-decision-engine.md`: قرارداد estimand، CI، MDE، CUPED، guardrail و قواعد Scale / Iterate / Stop.
- `docs/model-governance.md`: بک‌تست، calibration، Champion/Challenger، drift و Decision Ledger.

## تست

```bash
npm test
```

## حساب دمو برای ارزیابی مشتری

راهنمای قابل‌ارسال به ارزیاب در `docs/demo-user-guide-fa.md` قرار دارد. حساب دمو باید با نقش `viewer` و تاریخ انقضای کوتاه ساخته شود تا داده‌ها فقط قابل مشاهده باشند:

```bash
npm run demo-user -- --email=reviewer@example.com --name="مهمان دمو" --days=7
```

رمز تصادفی فقط در خروجی فرمان نمایش داده می‌شود و نباید داخل Git یا فایل راهنما ثبت شود.

## Sprint 4: زیرساخت production

نسخه production اکنون از PostgreSQL به‌عنوان منبع اصلی، ذخیره رمزنگاری‌شده CSV، نقش‌های `viewer` / `analyst` / `admin` / `owner`، audit زنجیره‌ای، صف durable و metrics عملیاتی استفاده می‌کند. JSON فقط fallback توسعه محلی است.

راهنمای مهاجرت و استقرار:

```text
docs/sprint4-production-platform.md
docs/vm-deployment.md
```

## انتشار روی marginlift.ir

معماری انتشار فعلی این است: Cloudflare برای DNS، SSL/TLS و WAF؛ Node.js/Docker روی یک origin با volume پایدار. جزئیات در این اسناد است:

- `docs/production-readiness-audit.md`
- `docs/deployment-architecture.md`
- `docs/production-launch-checklist.md`
- `docs/cloudflare-cutover-runbook.md`
- `docs/vm-deployment.md`

فایل `.env.example` متغیرهای محیط را نشان می‌دهد. در production حتماً `APP_ORIGIN`، `SESSION_SECRET`، `POSTGRES_PASSWORD` و `ARTIFACT_ENCRYPTION_KEY` را تنظیم کنید. برای backup کامل VM:

```bash
/opt/marginlift/ops/vm/backup.sh
```

این نسخه برای pilot service-led و یک instance طراحی شده است؛ قبل از scale افقی، سند JSONB تراکنشی باید به جدول‌های tenant-aware دامنه‌ای تفکیک شود.
