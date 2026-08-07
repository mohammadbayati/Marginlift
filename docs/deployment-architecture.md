# معماری استقرار MarginLift روی marginlift.ir

## تصمیم پیشنهادی

برای نسخه فعلی، معماری دو لایه کافی و کم‌ریسک است:

```text
کاربر
  |
  v
Cloudflare DNS + Universal SSL + WAF + HTTPS redirect
  |
  v
Origin Node.js / Docker / یک instance
  |
  +--> volume پایدار: /app/data/db.json
  +--> backup زمان‌بندی‌شده خارج از volume اصلی
```

Cloudflare برای `A`، `AAAA` یا `CNAME` امکان proxy کردن ترافیک را دارد؛ رکورد origin اصلی باید orange-cloud باشد تا درخواست قبل از رسیدن به origin از Cloudflare عبور کند. راهنمای رسمی رکوردهای DNS در [مستندات Cloudflare](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/) است.

## تنظیم دامنه

1. دامنه `marginlift.ir` را به Cloudflare اضافه و nameserverهای اعلام‌شده را در ثبت‌کننده دامنه تنظیم کن.
2. رکورد `A` یا `CNAME` برای `@` را به origin میزبان Node وصل کن و proxy را روشن کن.
3. برای `www` یک CNAME به `marginlift.ir` بساز و در نهایت با Redirect Rule به دامنه اصلی هدایت کن.
4. در origin فقط پورت HTTPS میزبان را باز بگذار و health check را روی `/api/health` قرار بده.

## SSL/TLS

حالت پیشنهادی `Full (strict)` است، چون Cloudflare هم اتصال کاربر تا edge و هم اتصال edge تا origin را رمزنگاری می‌کند و certificate معتبر origin را بررسی می‌کند. طبق [راهنمای Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)، origin باید روی ۴۴۳ certificate منقضی‌نشده و منطبق با hostname ارائه کند.

تنظیمات پایه:

- SSL/TLS encryption mode: `Full (strict)`
- Always Use HTTPS: روشن
- Minimum TLS Version: مقدار امن پیشنهادی حساب Cloudflare
- HSTS: بعد از اطمینان از HTTPS کامل، فعال شود
- Origin certificate: گواهی معتبر عمومی یا Cloudflare Origin CA

## WAF و rate limiting

در فاز اول، WAF managed rules را فعال کن و برای مسیرهای زیر rule جدا داشته باش:

- `/api/auth/*`: challenge یا rate limit سخت‌گیرانه‌تر
- `/api/imports/*` و `/api/outcomes/import`: محدودیت method، اندازه و نرخ درخواست
- `/api/*`: فقط ترافیک HTTPS و الگوی user-agent غیرعادی بررسی شود

Custom Rules در Cloudflare با expression و actionهایی مثل Block و Managed Challenge کار می‌کنند؛ جزئیات در [راهنمای Custom Rules](https://developers.cloudflare.com/waf/custom-rules/) و نمای کلی WAF در [مستندات WAF](https://developers.cloudflare.com/waf/) آمده است.

نمونه منطق rule برای بررسی دستی:

```text
درخواست به /api/auth/login با بیش از حد مجاز تلاش در بازه کوتاه -> Managed Challenge
درخواست POST به /api/imports/* با Content-Length بزرگ‌تر از سقف -> Block
درخواست با host ناشناخته -> Block
```

## متغیرهای محیط production

فایل `.env.example` مرجع نام‌گذاری است. مقدار واقعی secret هرگز در Git یا فایل public قرار نگیرد.

```text
NODE_ENV=production
APP_ORIGIN=https://marginlift.ir
SESSION_SECRET=<حداقل ۳۲ کاراکتر تصادفی>
MARGINLIFT_DB_PATH=/app/data/db.json
MARGINLIFT_MAX_BODY_BYTES=2097152
TRUST_PROXY=true
PORT=<توسط میزبان>
```

`TRUST_PROXY=true` فقط وقتی استفاده شود که origin واقعاً پشت Cloudflare یا reverse proxy کنترل‌شده باشد. در غیر این صورت، rate limit باید بر اساس socket origin بماند.

## گزینه میزبان

Render، Railway، Fly.io یا VPS با Docker همگی برای این فاز قابل استفاده‌اند؛ معیار انتخاب، داشتن دیسک پایدار، backup قابل‌بازیابی، TLS در origin یا certificate مناسب، log قابل مشاهده و restart خودکار است. اگر میزبان دیسک پایدار ندهد، JSON DB انتخاب production مناسبی نیست.

## مسیر ارتقا

پس از نخستین پایلوت پولی موفق:

1. JSON DB به PostgreSQL منتقل شود.
2. CSVها در object storage رمزنگاری‌شده ذخیره و در DB فقط metadata نگه‌داری شود.
3. session و rate limit به storage مشترک منتقل شود.
4. نقش‌ها، audit trail، حذف داده و مانیتورینگ خطا اضافه شود.
