# چک‌لیست انتشار MarginLift

## دروازه go / no-go

انتشار عمومی فقط وقتی انجام شود که `npm test` سبز باشد، دامنه با HTTPS باز شود، `/api/health` پاسخ سالم بدهد، login و import روی محیط staging اجرا شده باشد، backup restore تست شده باشد و صفحات حریم خصوصی و امنیت اطلاعات واقعی ارائه‌دهنده را داشته باشند.

## فاز صفر: آماده‌سازی داخلی

- [ ] نام حقوقی، مالک داده، کانال تماس و مسئول incident مشخص شود.
- [ ] `SESSION_SECRET` با مقدار تصادفی حداقل ۳۲ کاراکتر ساخته و در secret manager میزبان ثبت شود.
- [ ] `APP_ORIGIN=https://marginlift.ir` ثبت شود.
- [x] PostgreSQL volume پایدار باشد و health مقدار `driver: postgres` برگرداند.
- [ ] `POSTGRES_PASSWORD` و `ARTIFACT_ENCRYPTION_KEY` تصادفی و خارج از Git نگه‌داری شوند.
- [ ] restore آخرین dump و artifact archive در محیط جدا آزمایش شود.
- [ ] volume پایدار برای `/app/data` ایجاد شود.
- [ ] برنامه backup روزانه و نگهداری چند نسخه تعیین شود.
- [ ] حساب دمو فقط در local/staging باقی بماند.

## فاز یک: اتصال Cloudflare

- [ ] nameserverها در ثبت‌کننده دامنه تغییر کنند و status دامنه Active شود.
- [ ] رکورد `@` و `www` ایجاد و proxy برای ترافیک وب روشن شود.
- [ ] SSL/TLS روی `Full (strict)` قرار گیرد.
- [ ] Always Use HTTPS فعال شود.
- [ ] WAF managed rules فعال شود.
- [ ] برای `/api/auth/*` و importها rate limit یا challenge تنظیم شود.
- [ ] origin مستقیم با firewall یا allowlist شبکه محدود شود.

## فاز VM

- [ ] `docker-compose.production.yml` روی VM اجرا شود.
- [ ] Caddy روی پورت‌های ۸۰ و ۴۴۳ certificate معتبر بگیرد.
- [ ] اپ فقط روی شبکه داخلی Docker در دسترس باشد.
- [ ] backup روزانه با `ops/vm/backup.sh` فعال شود.
- [ ] CI روی هر push تست و Docker build را اجرا کند.

## فاز دو: smoke test staging

- [ ] `/api/health` پاسخ `200` برگرداند.
- [ ] صفحات `/sales.html`، `/privacy.html`، `/terms.html` و `/security.html` پاسخ `200` بدهند.
- [ ] ثبت‌نام، ورود، خروج و session cookie بررسی شود.
- [ ] CSV مصنوعی campaign، customer و outcome وارد شود.
- [ ] readout با برچسب شواهد درست دانلود شود.
- [ ] payload بزرگ با پاسخ `413` رد شود.
- [ ] origin مستقیم از اینترنت قابل دسترسی نباشد یا دست‌کم پاسخ عمومی ندهد.

## فاز سه: اولین مشتری پایلوت

پیام اصلی: «ما جایگزین CRM نیستیم؛ تصمیم می‌گیریم کجا تخفیف بدهید و کجا ندهید.»

- [ ] قبل از داده واقعی، Diagnostic با فایل ناشناس اجرا شود.
- [ ] بدون control فقط `observational estimate` نمایش داده شود.
- [ ] برای Live Pilot، holdout و outcome window با مشتری امضا شود.
- [ ] قبل از scale، readout شامل KPI، guardrail، نتیجه و توصیه باشد.
- [ ] اگر outcome با پیش‌بینی نمی‌خواند، تصمیم `needs review` باقی بماند.

## فاز چهار: launch momentum

### Owned

- [ ] صفحه فروش، دمو، pilot package و صفحات اعتماد روی دامنه اصلی باشند.
- [ ] یک فرم یا کانال تماس برای درخواست Diagnostic آماده باشد.
- [ ] هر پایلوت به case study ناشناس و قابل انتشار تبدیل شود.

### Rented

- [ ] سه محتوای فارسی درباره هدررفت تخفیف، holdout و سود افزایشی منتشر شود.
- [ ] از داشبورد فقط اعداد synthetic یا با اجازه مشتری استفاده شود.

### Borrowed

- [ ] برای مدیران CRM، Growth و CFO معرفی گرم از شبکه‌های موجود گرفته شود.
- [ ] یک جلسه کوتاه با شریک اجرایی کمپین یا آژانس بازاریابی برگزار شود.

## rollback

در خطای انتشار، ترافیک را به staging یا صفحه دمو برگردان، آخرین backup سالم را نگه دار و تا بررسی لاگ‌ها import داده واقعی را متوقف کن. rollback به معنی حذف دیتابیس یا بازنویسی فایل‌های مشتری نیست.
