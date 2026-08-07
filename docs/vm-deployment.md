# استقرار MarginLift روی VM

این مسیر برای یک VM لینوکسی با Docker و یک instance اپ طراحی شده است.

## معماری

```text
Cloudflare (DNS / SSL / WAF)
        |
        v
VM: Caddy :80/:443
        |
        v
Docker app :3000 (فقط شبکه داخلی)
        |
        v
VM volume: /opt/marginlift/data/db.json
```

پورت ۳۰۰۰ نباید عمومی باشد؛ Compose فقط آن را داخل شبکه کانتینر expose می‌کند و Caddy ورودی عمومی را روی ۸۰ و ۴۴۳ می‌گیرد.

## پیش‌نیازهای VM

- سیستم‌عامل لینوکس به‌روز
- Docker Engine و Docker Compose plugin
- حداقل یک volume پایدار برای `/opt/marginlift/data`
- firewall با پورت‌های `22`، `80` و `443`؛ پورت `3000` بسته بماند
- دسترسی SSH با کلید، نه password عمومی

## نصب روی VM

```bash
sudo mkdir -p /opt/marginlift
sudo chown "$USER":"$USER" /opt/marginlift
cd /opt/marginlift
git clone https://github.com/mohammadbayati/Marginlift.git .
cp .env.example .env
```

اگر repository خصوصی است، به‌جای HTTPS از SSH deploy key استفاده کن:

```bash
git clone git@github.com:mohammadbayati/Marginlift.git .
```

بعد از clone باید در همین مسیر فایل‌های `package.json`، `Dockerfile` و `docker-compose.production.yml` دیده شوند. اگر نبودند، نسخه فعلی production هنوز به GitHub push نشده است.

در `.env` این مقادیر واقعی را تنظیم کن:

```text
NODE_ENV=production
APP_ORIGIN=https://marginlift.ir
SESSION_SECRET=<secret تصادفی حداقل ۳۲ کاراکتری>
MARGINLIFT_DB_PATH=/app/data/db.json
CADDY_EMAIL=<ایمیل دریافت هشدار certificate>
TRUST_PROXY=true
```

سپس:

```bash
chmod +x ops/vm/deploy.sh ops/vm/backup.sh
./ops/vm/deploy.sh
```

Caddy گواهی HTTPS origin را مدیریت می‌کند. بعد از بالا آمدن سرویس، در Cloudflare رکورد `A` برای `@` را به IP عمومی VM وصل و proxy را روشن کن؛ `www` را نیز به دامنه اصلی هدایت کن.

## backup روزانه

```bash
crontab -e
```

نمونه اجرای روزانه ساعت ۳ بامداد:

```cron
0 3 * * * /opt/marginlift/ops/vm/backup.sh >> /var/log/marginlift-backup.log 2>&1
```

Backup داخل همان volume فقط کمک اولیه است. حداقل یک نسخه رمزنگاری‌شده را خارج از VM نگه‌داری و restore آن را ماهانه تست کن.

## بررسی نهایی

```bash
docker compose -f docker-compose.production.yml ps
curl -I https://marginlift.ir/api/health
curl -I https://marginlift.ir/sales.html
```

سپس login، import داده مصنوعی و دانلود readout را از مرورگر تست کن. تا عبور این تست‌ها، داده واقعی مشتری وارد نشود.
