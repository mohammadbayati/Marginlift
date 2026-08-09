# معماری استقرار MarginLift

## توپولوژی production

```text
Internet
  -> Cloudflare DNS/WAF
  -> Caddy :80/:443
  -> app :3000 (internal only)
       -> postgres :5432 (internal only)
       -> encrypted artifact volume
       -> durable worker
```

`app`، `postgres` و `caddy` در یک شبکه Docker قرار دارند. هیچ پورتی برای app یا PostgreSQL روی host منتشر نمی‌شود.

## Persistence

- `postgres_data`: منبع اصلی داده تجاری و صف کار.
- `artifact_data`: CSVهای AES-256-GCM؛ کلید داخل `.env` و خارج از دیتابیس است.
- `./data/db.json`: فقط ورودی migration از نسخه قدیمی و fallback توسعه محلی.
- `./backups`: dump دیتابیس و archive فایل رمزنگاری‌شده با retention چهارده‌روزه.

## Boot sequence

1. build image و نصب dependency با `npm ci --omit=dev`.
2. اجرای PostgreSQL و عبور از `pg_isready`.
3. اجرای `npm run db:migrate`؛ ساخت schema و import یک‌باره JSON در دیتابیس خالی.
4. اجرای app و عبور health با `driver: postgres`.
5. اجرای Caddy پس از healthy شدن app.

## Fail-fast

production بدون HTTPS origin، session secret حداقل ۳۲ کاراکتری، PostgreSQL URL و artifact key معتبر بالا نمی‌آید. script استقرار نیز متغیرهای لازم را قبل از build بررسی می‌کند.

## محدودیت مقیاس

داده تجاری فعلاً در یک سند JSONB تراکنشی نگه‌داری می‌شود و writeها serialize می‌شوند. این انتخاب برای یک instance پایلوت محافظه‌کارانه است؛ scale افقی به schema دامنه‌ای tenant-aware و object storage بیرونی نیاز دارد.
