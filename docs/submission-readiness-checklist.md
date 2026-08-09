---
artifact: launch-checklist
version: "1.0"
created: 2026-08-05
status: in-progress
---

# چک‌لیست آمادگی ارائه MarginLift

## Launch Overview

| مورد | مقدار |
| --- | --- |
| What | بسته دمو، فروش، پایلوت و investor deck برای MarginLift |
| Launch Type | Competition / pilot sales readiness |
| Launch Owner | Founder |
| Go/No-Go Decision Maker | Founder |
| Target Outcome | آماده‌بودن برای ارسال به داور، مشتری پایلوت و سرمایه‌گذار |

## Engineering Readiness

| آیتم | مالک | وضعیت | یادداشت |
| --- | --- | --- | --- |
| [x] دمو با سرور محلی اجرا می‌شود | Founder / Engineering | Done | `npm start` |
| [x] ورود، ثبت‌نام و session کار می‌کند | Engineering | Done | demo account فعال است |
| [x] CSV upload و تحلیل سمت سرور کار می‌کند | Engineering | Done | تست واحد پاس شده |
| [x] routeهای demo/sales/pilot/deck/submission سرو می‌شوند | Engineering | Done | روی پورت تست تأیید شد |
| [x] data store production-ready برای پایلوت | Engineering | PostgreSQL + backup + migration | تکمیل در Sprint 4 |
| [ ] role-based access و audit log | Engineering | Blocker برای مشتری enterprise | activity log محصولی اضافه شد؛ audit log امنیتی هنوز production لازم دارد |

## QA & Testing

| آیتم | مالک | وضعیت | یادداشت |
| --- | --- | --- | --- |
| [x] تست analysis engine | Engineering | Done | `npm test` |
| [x] route smoke test | Engineering | Done | صفحات اصلی `200` |
| [ ] تست مرورگر desktop/mobile با screenshot | Founder / QA | To Do | قبل از ارسال نهایی انجام شود |
| [ ] تست CSV مشتری واقعی/نیمه‌واقعی | Founder / Data | To Do | بعد از اولین data-share |
| [ ] تست خطاهای فایل ناقص | Engineering | To Do | پیام خطا باید فارسی و روشن باشد |

## Design & UX

| آیتم | مالک | وضعیت | یادداشت |
| --- | --- | --- | --- |
| [x] RTL فارسی و فونت فارسی | Design | Done | Vazirmatn با fallback |
| [x] صفحه فروش | Design | Done | شامل Campaign Waste Audit |
| [x] صفحه پایلوت | Design | Done | قابل‌ارسال به مشتری |
| [x] deck وب‌محور | Design | Done | برای ارائه داور/سرمایه‌گذار |
| [x] hub ارائه | Design | Done | مسیرهای اصلی یک‌جا |
| [ ] polish نهایی با screenshot | Design | To Do | بررسی overlap، mobile و چاپ |

## Marketing & Sales

| آیتم | مالک | وضعیت | یادداشت |
| --- | --- | --- | --- |
| [x] one-pager | Founder | Done | `docs/sales-one-pager.md` |
| [x] outreach sequence | Founder | Done | `docs/outreach-messages.md` |
| [x] target account list | Founder | Done | `docs/first-customer-targets.md` |
| [x] qualification script | Founder | Done | `docs/qualification-call-script.md` |
| [x] competitive benchmark | Founder | Done | شامل Quantcast |
| [ ] ارسال ۱۵ پیام دستی | Founder | To Do | مرحله GTM واقعی |
| [ ] ساخت ۲ معرفی گرم | Founder | To Do | اولویت بالا |

## Investor Readiness

| آیتم | مالک | وضعیت | یادداشت |
| --- | --- | --- | --- |
| [x] investor source of truth | Founder | Done | اعداد و ادعاهای canonical |
| [x] investor memo | Founder | Done | قابل‌ارسال |
| [x] demo day talk track | Founder | Done | ۳ دقیقه |
| [x] investor Q&A | Founder | Done | آماده تمرین |
| [ ] market sizing bottom-up | Founder / Analyst | To Do | نیاز به داده واقعی بازار |
| [ ] financial model spreadsheet | Founder / Finance | To Do | بعد از validation اولیه |

## Legal & Data Safety

| آیتم | مالک | وضعیت | یادداشت |
| --- | --- | --- | --- |
| [x] درخواست داده بدون PII | Founder | Done | `docs/pilot-data-request.md` |
| [x] محدودیت ادعاهای causal مشخص شده | Founder | Done | بدون کنترل‌گروه ادعای قطعی نمی‌شود |
| [ ] قالب NDA / DPA سبک | Legal | To Do | برای مشتری جدی |
| [ ] privacy/security page | Founder / Legal | To Do | قبل از فروش enterprise |

## Analytics & Monitoring

| آیتم | مالک | وضعیت | یادداشت |
| --- | --- | --- | --- |
| [x] event tracking برای دمو | Engineering | Done | app_loaded، login، signup، import و report export ثبت می‌شوند |
| [ ] error logging production | Engineering | To Do | فعلا local logs |
| [x] pilot KPI dashboard | Founder / Data | Done | فانل و فعالیت‌های اخیر داخل داشبورد نمایش داده می‌شود |

## Go/No-Go Criteria

### Must Have برای ارسال به مسابقه

- [x] دمو قابل اجرا باشد.
- [x] صفحه فروش و صفحه پایلوت آماده باشد.
- [x] deck و talk track آماده باشد.
- [x] ادعاهای غیرقابل‌اثبات حذف شده باشند.
- [x] مسیر اجرای پایلوت بدون production integration مشخص باشد.

### Must Have برای فروش جدی به مشتری

- [ ] data privacy / NDA template.
- [ ] تست با داده واقعی یا نیمه‌واقعی.
- [ ] خروجی PDF یا export قابل‌ارسال.
- [ ] security و access control پایه.
- [ ] مالکیت و قیمت پایلوت شفاف.

## Rollback Plan

اگر دمو در ارائه خراب شد:

1. از صفحه deck و اسکرین‌های توضیحی استفاده شود.
2. sample CSV و README برای اجرای محلی ارائه شود.
3. خروجی‌های markdown پایلوت و investor memo به‌عنوان بسته جایگزین ارسال شوند.

Rollback Owner: Founder

Rollback Time Estimate: کمتر از ۱۰ دقیقه برای تغییر مسیر ارائه.

## Check-in Schedule

| زمان | کار |
| --- | --- |
| T-۷ روز | تست کامل دمو و مرور deck |
| T-۳ روز | تمرین talk track و Q&A |
| T-۱ روز | گرفتن screenshot نهایی و تست routeها |
| روز ارائه | اجرای دمو، deck، سپس Q&A |

## Open Issues

| مسئله | اثر | تصمیم |
| --- | --- | --- |
| state تجاری یک سند JSONB است | محدودیت scale افقی | پس از اثبات پایلوت به جدول‌های tenant-aware تفکیک شود |
| market sizing دقیق ندارد | ضعف در investor deck | بعد از انتخاب بازار هدف با bottom-up تکمیل شود |
| هنوز traction واقعی ندارد | ریسک سرمایه‌گذار | مرحله بعد باید outreach واقعی و LOI باشد |
| activity log هنوز امنیتی نیست | ریسک enterprise | فعلا برای adoption پایلوت است؛ audit trail رسمی بعدا اضافه شود |
