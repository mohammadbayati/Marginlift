# Runbook پایلوت با Holdout تصادفی

این راهنما نشان می‌دهد چگونه یک پایلوت با گروه کنترلِ تصادفی اجرا کنید تا **دادهٔ uplift بی‌سوگیری** جمع شود و به حلقهٔ بازآموزی MarginLift تغذیه شود. مکملِ [enterprise-platform-fa.md](enterprise-platform-fa.md) و متد service-led موجود ([service-led-pilot-runbook-fa.md](service-led-pilot-runbook-fa.md)) است.

---

## ۱. چرا holdout تصادفی؟

مدل uplift پاسخ به این سؤال را تخمین می‌زند: «اگر به این مشتری پیام بدهیم، چقدر احتمال خریدش **بیشتر** می‌شود؟» برای پاسخ بی‌سوگیری، باید تخصیص درمان **تصادفی و مستقل از هر پیش‌بینی** باشد. اگر فقط به کسانی پیام بدهیم که مدل توصیه می‌کند، دادهٔ جمع‌شده با خودِ مدل هم‌بسته (confounded) می‌شود و مدل بعدی روی سوگیری خودش آموزش می‌بیند.

> **قانون طلایی:** برای **جمع‌آوری دادهٔ آموزش**، تخصیص treatment/control تصادفی است — نه بر اساس خروجی مدل. (ارکستراسیونِ مدل‌محور مرحلهٔ **بعد** از اعتماد به مدل است.)

---

## ۲. طراحی آزمایش

| پارامتر | پیش‌فرض پیشنهادی | یادداشت |
|---|---|---|
| نرخ کنترل (holdout) | **۱۰–۵۰٪** تصادفی | ۵۰/۵۰ سریع‌ترین سیگنال؛ ۱۰٪ کم‌هزینه‌تر ولی کندتر |
| پنجرهٔ outcome | **۳۰ روز** بعد از exposure | ثابت و از پیش تعیین‌شده |
| حداقل نمونه | **≥ ۲۰۰۰ ردیف قابل‌استفاده** کل | آستانهٔ سوییچ به دادهٔ واقعی (`MARGINLIFT_MIN_REAL_ROWS`) |
| توزیع کلاس‌ها | هر دو arm + هر دو نتیجه (خرید/عدم‌خرید) | وگرنه retrain fallback به synthetic می‌کند |
| گاردریل‌ها | درآمد کل، نرخ تبدیل، هزینهٔ مشوق، نسبت نمونهٔ کنترل، نرخ لغو/نارضایتی | هر انحراف جدی = توقف |

**نکتهٔ اندازهٔ نمونه:** برای اثر قابل‌تشخیص (مثلاً baseline ۵٪ و MDE ۱.۵–۲ واحد درصد)، معمولاً ~۲۰۰۰–۴۰۰۰ نفر در هر گروه لازم است. پلتفرم این عدد را در «آماده‌سازی» خودش محاسبه می‌کند (`buildExperimentPlan`).

---

## ۳. گردش‌کار گام‌به‌گام

### گام ۰ — ساخت توکن JWT سازمانی (۳۰ روزه)
روی سرور، در کانتینر app:
```bash
docker compose -f docker-compose.production.yml exec -T app \
  node -e "console.log(require('/app/src/auth').signJwt({org:'<ORG_ID>'}, 2592000))"
```
`<ORG_ID>` را از حساب مالک بگیرید. توکن را در CRM به‌صورت `Authorization: Bearer <token>` استفاده کنید.

### گام ۱ — تخصیص تصادفی (سمت CRM/کلاینت)
مخاطبان واجد شرایط را **به‌صورت تصادفی** به دو گروه تقسیم کنید:
```js
const control = [], treatment = [];
for (const customer of audience) {
  (Math.random() < HOLDOUT_RATE ? control : treatment).push(customer);
}
```
- **treatment**: کمپین/پیشنهاد را دریافت می‌کنند.
- **control**: **هیچ پیامی دریافت نمی‌کنند** (holdout).

> برای هر مشتری، همان بردار ۸ فیچرِ زمان تصمیم را نگه دارید (recency_days, frequency, monetary_value, avg_order_gap_days, discount_usage_rate, channel_engagement_score, tenure_days, gross_margin_rate). این بردار بعداً با نتیجه گزارش می‌شود.

### گام ۲ — (اختیاری) اجرای Shadow برای مقایسه
می‌توانید موازی، `POST /api/v1/evaluate/shadow` را روی کل مخاطبان بزنید تا **پیش‌بینی مدل** را ثبت کنید — بدون اثر روی کمپین. این‌طور بعداً می‌سنجید مدل چقدر خوب uplift واقعی را پیش‌بینی کرده بود.

### گام ۳ — اجرای کمپین
پیام‌ها را فقط به گروه **treatment** بفرستید. گروه control دست‌نخورده می‌ماند.

### گام ۴ — انتظار پنجرهٔ outcome
۳۰ روز (یا پنجرهٔ از پیش تعیین‌شده). گاردریل‌ها را حین اجرا پایش کنید.

### گام ۵ — گزارش نتایج (هر دو arm)
پس از پنجره، برای **هر دو گروه** نتیجه را گزارش دهید:
```js
await fetch("https://marginlift.ir/api/v1/outcomes/report", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
  body: JSON.stringify({
    campaign_id: "pilot-2026-q3",
    results: [
      // مشتری درمان‌شده که خرید نکرد:
      { customer_id_hash: "9f86...", treated: true,  converted: false, features: { recency_days: 10, frequency: 3, monetary_value: 800000, /* ...بقیه... */ } },
      // مشتری کنترل که خرید کرد:
      { customer_id_hash: "a1b2...", treated: false, converted: true,  features: { recency_days: 40, frequency: 1, monetary_value: 500000 } },
      // ...
    ]
  })
});
```
- `treated`: آیا در گروه treatment بود (پیام گرفت)؟
- `converted`: آیا در پنجرهٔ outcome خرید کرد؟
- `customer_id_hash`: **باید هش‌شده باشد** (گارد PII ایمیل/موبایل خام را با `400 PII_DETECTED` رد می‌کند).
- می‌توانید در چند فراخوان دسته‌ای (batch) گزارش دهید؛ سقف بدنه ۲MB است.

### گام ۶ — تأیید سوییچ به دادهٔ واقعی
وقتی مجموع نمونه‌ها به ۲۰۰۰ رسید، بازآموزیِ هفتگی (یا اجرای دستی) خودکار روی دادهٔ واقعی آموزش می‌بیند:
```bash
# اجرای دستی حلقه (export + retrain):
./ops/vm/retrain.sh
# در خروجی باید ببینید:  challenger metrics (real): {...}
```
و در registry نسخهٔ جدید با `data_source: real` ثبت می‌شود:
```bash
curl -s https://marginlift.ir/api/v1/mlops/model-registry \
  -H "Cookie: <owner session>"   # یا از داشبورد مالک
```

---

## ۴. اعتبارسنجی و عیب‌یابی

| نشانه | علت محتمل | راه‌حل |
|---|---|---|
| `data_source` هنوز `synthetic` | < ۲۰۰۰ ردیف، یا یکی از armها/کلاس‌ها خالی | نمونهٔ بیشتر؛ مطمئن شوید هم control و هم treatment و هم خرید/عدم‌خرید وجود دارد |
| `400 PII_DETECTED` | `customer_id_hash` خام (ایمیل/موبایل) | سمت CRM هش کنید (مثلاً SHA-256) |
| challenger promote نشد | بهتر از champion فعلی نبود (بازهٔ اطمینان مثبت نشد) | طبیعی و امن؛ داده/سیگنال بیشتر لازم است |
| export با EACCES | مالکیت root روی volume `/training` | `docker run --rm -v marginlift_training_data:/t alpine chown -R 1000:1000 /t` |

---

## ۵. هشدارهای صادقانه

- **تصادفی‌بودن واقعی الزامی است.** اگر control را «مشتریان کم‌ارزش» انتخاب کنید (نه تصادفی)، داده سوگیری‌دار و مدل بی‌اعتبار می‌شود.
- **holdout هزینه دارد:** به بخشی از مشتریانی که شاید پاسخ می‌دادند پیام نمی‌دهید — این هزینهٔ سنجش uplift بی‌سوگیری است و یک تصمیم تجاری آگاهانه.
- **سطح شواهد را بالا نبرید:** تا قبل از بستن پنجرهٔ outcome و عبور از گاردریل‌ها، اعداد «مشاهده‌ای» هستند نه اثر علّیِ تأییدشده.
- **promote تدریجی:** حلقه فقط وقتی مدلِ دادهٔ واقعی را production می‌کند که به‌طور معنادار از مدل فعلی بهتر باشد؛ در غیر این‌صورت champion حفظ می‌شود. این یعنی گذار امن از synthetic به واقعی.
