# ممیزی آمادگی production در MarginLift

تاریخ ممیزی: ۱۴۰۵/۰۵/۱۷

## نتیجه اجرایی

MarginLift برای یک pilot سرویس‌محور با یک instance آماده است؛ برای SaaS چندمشتری با ترافیک بالا هنوز آماده نیست. تصمیم درست برای دامنه `marginlift.ir` این است که Cloudflare در لایه ورودی قرار بگیرد و Node.js روی origin دارای دیسک پایدار اجرا شود.

## یافته‌های اصلی

| حوزه | وضعیت فعلی | تصمیم انتشار |
| --- | --- | --- |
| runtime | Node.js بدون dependency خارجی | مناسب برای یک origin ساده |
| داده | JSON DB با تراکنش فایل و rename اتمیک | فقط یک instance و pilot؛ backup اجباری |
| احراز هویت | session در DB، cookie HttpOnly/SameSite، HMAC در نسخه فعلی | مناسب pilot؛ rotate secret و محدودیت دسترسی لازم است |
| seed دمو | فقط در محیط غیرproduction اجرا می‌شود | از ورود داده نمونه به محیط مشتری جلوگیری می‌کند |
| ورودی | JSON body محدود به ۲ مگابایت و rate limit ورود/ثبت‌نام | برای CSV بزرگ‌تر باید object storage یا import آفلاین اضافه شود |
| static files | allowlist مسیرها | کاهش ریسک افشای فایل داخلی |
| image build | `.dockerignore` از انتقال DB و secret جلوگیری می‌کند | قبل از push، image contents بررسی شود |
| خطا | جزئیات خطا در production به کاربر برگردانده نمی‌شود | لاگ سرور باید جداگانه جمع‌آوری شود |
| امنیت لبه | در کد انجام نمی‌شود | مسئولیت Cloudflare DNS، SSL/TLS و WAF است |
| صفحات اعتماد | حریم خصوصی، شرایط، امنیت و درخواست داده پایلوت اضافه شد | قبل از انتشار عمومی اطلاعات حقوقی تکمیل شود |

## ریسک‌های باقی‌مانده

1. JSON DB برای چند process یا چند instance مناسب نیست؛ اگر اولین مشتری پولی به پایلوت موفق تبدیل شد، مهاجرت به PostgreSQL اولویت فنی شماره یک است.
2. rate limit فعلی در حافظه همان process است؛ برای چند instance باید به edge rate limiting یا storage مشترک منتقل شود.
3. صفحات حقوقی هنوز placeholder دارند و باید با نام حقوقی، نشانی، کانال تماس، مدت نگهداری و فرایند حذف تکمیل شوند.
4. قبل از ارسال فایل واقعی، قرارداد داده یا NDA/DPA سبک لازم است.
5. Cloudflare از origin محافظت می‌کند، اما origin باید با firewall یا قابلیت private origin از دسترسی مستقیم محافظت شود.

## معیار عبور از pilot به SaaS

مهاجرت به PostgreSQL، object storage برای فایل‌ها، نقش‌های کاربری، audit trail، حذف workspace، مانیتورینگ خطا و تست بازیابی backup باید قبل از فروش چندمشتری یا قرارداد enterprise انجام شود.
