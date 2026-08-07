# Runbook اتصال marginlift.ir به origin

این سند برای لحظه‌ای است که مقصد اجرای Node مشخص شده باشد.

## وضعیت فعلی

در آخرین بررسی، nameserverهای دامنه روی Cloudflare فعال بودند اما برای apex و `www` رکورد `A` یا `CNAME` وجود نداشت. بنابراین سرویس هنوز به origin متصل نشده است.

## اطلاعاتی که باید پر شوند

| مقدار | نمونه | مقدار واقعی |
| --- | --- | --- |
| origin type | CNAME یا IP |  |
| origin hostname/IP | `marginlift-origin.example.com` |  |
| app port | `443` پشت reverse proxy |  |
| health path | `/api/health` |  |
| deploy owner | Founder / Engineering |  |

## ترتیب cutover

1. اپ را با `NODE_ENV=production`، `APP_ORIGIN=https://marginlift.ir`، `SESSION_SECRET` و `MARGINLIFT_DB_PATH` روی origin اجرا کن.
2. از خود origin مطمئن شو `https://<origin-host>/api/health` پاسخ `200` دارد.
3. در Cloudflare DNS، رکورد `@` را به origin اضافه کن و proxy را روشن کن.
4. رکورد `www` را به `marginlift.ir` یا همان origin وصل کن و redirect را فعال کن.
5. SSL/TLS را روی `Full (strict)` بگذار و certificate origin را بررسی کن.
6. Always Use HTTPS، WAF managed rules و rate limit مسیرهای auth/import را فعال کن.
7. پس از انتشار، cache را برای مسیرهای `/api/*` bypass کن؛ پاسخ‌های API نباید cache شوند.

## تست پس از انتشار

```text
https://marginlift.ir/api/health             -> 200
https://marginlift.ir/sales.html             -> 200
https://marginlift.ir/privacy.html           -> 200
https://marginlift.ir/security.html          -> 200
https://marginlift.ir/terms.html             -> 200
```

سپس با یک حساب تست، ورود، upload فایل مصنوعی، Data Readiness و دانلود readout را اجرا کن. تا قبل از این تست‌ها فایل واقعی مشتری را وارد نکن.

## rollback

اگر SSL خطای ۵۲۶ داد، certificate و hostname origin را بررسی کن. اگر اپ خطای ۵۰۰ داد، رکورد DNS را تغییر نده؛ ابتدا health، env و volume را روی origin بررسی کن. در صورت نیاز proxy را موقتاً خاموش و DNS را به مقصد staging برگردان، سپس بعد از رفع مشکل دوباره proxy را روشن کن.
