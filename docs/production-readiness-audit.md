# ممیزی آمادگی production در MarginLift

تاریخ بازبینی: ۱۴۰۵/۰۵/۱۸

## نتیجه اجرایی

MarginLift پس از Sprint 4 برای پایلوت پولی service-led روی یک VM و یک app instance آماده است. هنوز برای قرارداد enterprise یا scale افقی آماده نیست؛ محدودیت اصلی، state تجاری JSONB و نبود restore drill واقعی روی سرور است.

## وضعیت کنترل‌ها

| حوزه | وضعیت | شاهد |
| --- | --- | --- |
| دیتابیس | آماده پایلوت | PostgreSQL اجباری در production، migration یک‌باره JSON و health check |
| فایل خام | آماده پایلوت | AES-256-GCM، volume خصوصی، کلید خارج از دیتابیس و حذف نقش‌محور |
| دسترسی | آماده پایلوت | `viewer`، `analyst`، `admin` و `owner` با guard سمت سرور |
| audit | آماده پایلوت | زنجیره hash برای عملیات و زنجیره مستقل Decision Ledger |
| صف کار | آماده پایلوت | صف durable PostgreSQL، claim اتمیک، retry محدود و وضعیت قابل مشاهده |
| مشاهده‌پذیری | پایه آماده | request ID، structured log، metrics پردازش و health دیتابیس |
| backup | پیاده‌سازی‌شده، نیازمند drill | dump دیتابیس و archive artifact با retention چهارده‌روزه |
| شبکه | آماده با شرط | app و PostgreSQL داخلی؛ Cloudflare/Caddy ورودی عمومی |
| حقوقی | ناقص | DPA/NDA، سیاست retention و اطلاعات شخصیت حقوقی باید نهایی شوند |

## ریسک‌های باقی‌مانده

1. state تجاری یک سند JSONB است و writeها serialize می‌شوند؛ برای scale افقی باید جدول‌های tenant-aware ساخته شوند.
2. rate limit در حافظه process است؛ برای چند instance باید به Cloudflare یا store مشترک منتقل شود.
3. artifact key rotation خودکار نیست؛ فعلاً runbook دستی و `keyVersion` وجود دارد.
4. restore backup هنوز روی محیط جدا اجرا و زمان‌گیری نشده است.
5. حذف کامل workspace، export حقوقی داده و سیاست retention خودکار هنوز پیاده‌سازی نشده‌اند.
6. Cloudflare باید دسترسی مستقیم به origin را با firewall یا tunnel محدود کند.

## Gate فروش

- پایلوت اول: مجاز پس از deploy PostgreSQL، smoke test و backup اولیه.
- چند مشتری هم‌زمان: فقط پس از restore drill، alert بیرونی و rate limit مشترک.
- enterprise: فقط پس از schema tenant-aware، key rotation، DPA و ممیزی امنیتی مستقل.
