# استقرار MarginLift روی VM

## معماری

```text
Cloudflare -> Caddy -> Node.js -> PostgreSQL
                         |
                         +-> volume فایل‌های رمزنگاری‌شده
                         +-> worker صف کار
```

فقط پورت‌های `22`، `80` و `443` عمومی هستند. PostgreSQL و پورت `3000` فقط در شبکه داخلی Docker قرار دارند.

## تنظیم secretها

در `/opt/marginlift/.env` این متغیرها باید وجود داشته باشند:

```text
NODE_ENV=production
APP_ORIGIN=https://marginlift.ir
SESSION_SECRET=<حداقل ۳۲ کاراکتر تصادفی>
POSTGRES_PASSWORD=<رمز قوی و تصادفی دیتابیس>
ARTIFACT_ENCRYPTION_KEY=<دقیقاً ۶۴ کاراکتر hex>
ARTIFACT_KEY_VERSION=v1
TRUST_PROXY=true
MARGINLIFT_LOG_LEVEL=info
CADDY_EMAIL=<ایمیل عملیات>
```

تولید secret روی VM:

```bash
openssl rand -hex 32
```

برای `SESSION_SECRET`، `POSTGRES_PASSWORD` و `ARTIFACT_ENCRYPTION_KEY` سه خروجی جدا تولید کنید. مقدار encryption key را بدون فاصله و دقیقاً ۶۴ کاراکتر قرار دهید.

## اولین deploy اسپرینت ۴

```bash
cd /opt/marginlift
cp .env /root/marginlift.env.backup
cp data/db.json /root/marginlift-before-postgres.json
nano .env
chmod +x ops/vm/deploy.sh ops/vm/backup.sh
./ops/vm/deploy.sh
```

اسکریپت ابتدا PostgreSQL را بالا می‌آورد، schema را می‌سازد، JSON موجود را در دیتابیس خالی مهاجرت می‌کند و سپس app و Caddy را اجرا می‌کند.

## بررسی نتیجه

```bash
docker compose -f docker-compose.production.yml ps
curl -s https://marginlift.ir/api/health
docker compose -f docker-compose.production.yml logs --tail=100 app
```

در health باید `status: ok` و `driver: postgres` دیده شود. سپس با حساب مالک وارد بخش «اعتماد و دسترسی» شوید و PostgreSQL، زنجیره سالم audit و صف پردازش را ببینید.

## backup روزانه

```bash
crontab -e
```

```cron
0 3 * * * /opt/marginlift/ops/vm/backup.sh >> /var/log/marginlift-backup.log 2>&1
```

backup شامل dump دیتابیس و archive فایل‌های رمزنگاری‌شده است و نسخه‌های بیش از ۱۴ روز حذف می‌شوند. حداقل یک کپی رمزنگاری‌شده را خارج از VM نگه دارید و restore را ماهانه آزمایش کنید.

## Rollback

در صورت شکست migration، containerهای جدید را متوقف کنید؛ JSON قبلی را از `/root/marginlift-before-postgres.json` نگه دارید و قبل از هر تلاش بعدی علت شکست را از log app و postgres استخراج کنید. volume PostgreSQL را بدون backup حذف نکنید.
