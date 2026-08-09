# Sprint 4: Production Data Platform

## خروجی قابل قبول

- production بدون PostgreSQL یا secret معتبر بالا نمی‌آید.
- JSON موجود فقط در اولین راه‌اندازی PostgreSQL و وقتی state خالی است مهاجرت می‌شود.
- CSV خام با AES-256-GCM ذخیره و فقط با session و نقش مناسب دریافت می‌شود.
- import، outcome، تغییر نقش، دانلود و حذف artifact وارد audit زنجیره‌ای می‌شوند.
- کارهای integrity در صف durable ثبت می‌شوند و retry محدود دارند.
- سلامت دیتابیس عمومی و metrics، صف، audit و اعضا فقط برای مدیر قابل مشاهده‌اند.

## APIهای اضافه‌شده

- `GET /api/access/members`
- `POST /api/access/members`
- `PATCH /api/access/members/:id`
- `GET /api/audit-log`
- `GET /api/artifacts`
- `GET /api/artifacts/:id/download`
- `DELETE /api/artifacts/:id`
- `GET /api/ops/metrics`
- `GET /api/ops/jobs`

## Migration Contract

1. قبل از deploy از `data/db.json` نسخه پشتیبان بگیرید.
2. PostgreSQL خالی را بالا بیاورید.
3. `npm run db:migrate` جدول‌ها را می‌سازد و JSON را تنها در صورت نبود state وارد می‌کند.
4. health باید `driver: postgres` برگرداند.
5. تعداد سازمان، کاربر، تحلیل، experiment و outcome را با نسخه قبلی مقایسه کنید.
6. تا پایان smoke test فایل JSON قبلی را حذف نکنید.

## Runbook رخداد

- health قرمز: ابتدا سلامت `postgres` و سپس log دارای `requestId` را بررسی کنید.
- job شکست‌خورده: `GET /api/ops/jobs`، خطای آخر و تعداد تلاش را ببینید؛ retry نامحدود نیست.
- audit نامعتبر: import و تغییر policy را متوقف کنید و backup سالم را مبنا قرار دهید.
- کلید artifact افشا شد: ورود فایل را متوقف، کلید جدید تولید و artifactهای لازم را دوباره رمزنگاری کنید. metadata نسخه کلید را نگه می‌دارد، اما rotation خودکار هنوز جزو نسخه بعدی است.
