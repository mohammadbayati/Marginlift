# Analytics Tracking Plan

هدف این طرح، سنجش این است که مشتری در دمو و پایلوت واقعا به ارزش MarginLift می‌رسد یا نه.

## Naming convention

همه eventها با فرمت `object_action` و snake_case ثبت می‌شوند.

## Event Taxonomy

| Event | Trigger | پارامترها | چرا مهم است |
| --- | --- | --- | --- |
| app_loaded | بارگذاری داشبورد | surface | شروع تجربه |
| signup_completed | ساخت حساب | method | lead activation |
| login_completed | ورود موفق | method | بازگشت کاربر |
| campaign_imported | تحلیل CSV | campaign_name، has_file | لحظه اصلی activation |
| report_export_started | کلیک دریافت گزارش | campaign_name | قصد استفاده بیرونی |
| report_exported | ساخت گزارش سمت سرور | campaign_id، campaign_name | خروجی قابل‌ارائه |

## Conversion Definition

کاربر وقتی به activation می‌رسد که:

1. وارد workspace شود.
2. یک کمپین را تحلیل کند.
3. گزارش را export کند یا policy پیشنهادی را ببیند.

## Data Safety

- IP، user agent کامل، ایمیل مقصد یا داده شخصی کمپین ذخیره نمی‌شود.
- eventها در توسعه داخل JSON DB و در production داخل state تراکنشی PostgreSQL ذخیره می‌شوند.
- در نسخه production باید consent، retention policy و حذف داده اضافه شود.

## Production Next Steps

- اتصال به PostHog یا GA4 فقط بعد از تصمیم consent.
- ثبت `pilot_requested` در صفحه فروش.
- ثبت `data_request_downloaded` در صفحه پایلوت.
- گسترش dashboard داخلی funnel به cohort و retention در سطح workspace.

## In-Product Summary

در مرحله hardening دوم، خلاصه eventها داخل داشبورد اضافه شد:

- endpoint داخلی `GET /api/events/summary` برای workspace لاگین‌شده.
- فانل فارسی: بازدید داشبورد، ورود موفق، تحلیل CSV و خروجی گزارش.
- لیست فعالیت‌های اخیر برای نشان‌دادن adoption در پایلوت.
- محدودیت ذخیره‌سازی محلی روی ۱۰۰۰ event آخر برای سبک‌ماندن دمو.
