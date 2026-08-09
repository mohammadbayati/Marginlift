# Statistical Decision Engine

## هدف

این موتور بین «عدد مالی مشاهده‌شده» و «تصمیم بودجه‌ای قابل دفاع» فاصله می‌گذارد. سود مثبت به‌تنهایی مجوز گسترش نیست؛ سلامت آزمایش، عدم‌قطعیت، کف نمونه، guardrail و ROI باید هم‌زمان بررسی شوند.

## Analysis Plan

هم‌زمان با ثبت Experiment، نسخه `analysis-plan-v1` قفل می‌شود:

- واحد randomization: مشتری
- estimand: اثر `Intention-to-Treat` تخصیص به کل policy در برابر کنترل
- معیار اصلی: سود مشارکتی به‌ازای هر مشتری تخصیص‌یافته
- سطح معنی‌داری دوطرفه: `alpha = 0.05`
- توان هدف: `80%`
- کف نمونه: `50` مشتری در هر بازوی pooled policy و control
- کف ROI برای Scale: `1x`
- تحمل کاهش درآمد: حداکثر `5%`
- تحمل کاهش conversion: حداکثر `2` واحد درصد

Plan باید پیش از نخستین exposure قفل شده باشد. ثبت retrospective نتیجه را توصیفی نگه می‌دارد.
درخواست API یا CSV مشتری نمی‌تواند صرفاً با ادعای randomized این شرط را دور بزند؛ evidence باید از allocator سمت سرور آمده باشد.

## Estimation

برای هر مشتری assigned، سود مشارکتی به‌شکل زیر محاسبه می‌شود:

```text
outcome_revenue × gross_margin_rate − actual_incentive_cost − actual_channel_cost
```

اثر اصلی اختلاف میانگین treatment pooled و control است. تحلیل از Welch standard error، درجه آزادی Welch-Satterthwaite، فاصله اطمینان ۹۵ درصد و p-value دوطرفه استفاده می‌کند.

اگر درآمد ۹۰ روز پیش از آزمایش برای همه assignmentها موجود و دارای واریانس باشد، CUPED اعمال می‌شود. موتور مقدار theta و کاهش واریانس را ثبت می‌کند. CUPED معیار یا estimand را عوض نمی‌کند.

## Precision

- `MDE` از standard error مشاهده‌شده، alpha و توان هدف محاسبه می‌شود.
- توان مشاهده‌شده فقط یک diagnostic است و جایگزین برنامه‌ریزی نمونه پیش از اجرا نیست.
- outcome با واریانس صفر یا کمتر از دو مشاهده در هر بازو برای استنباط معتبر نیست.

## Guardrailها

- درآمد به‌ازای مشتری: non-inferiority با margin پنج درصد کاهش نسبت به کنترل
- نرخ تبدیل: non-inferiority با margin دو واحد درصد کاهش
- هزینه به‌ازای مشتری: فقط وقتی ارزیابی می‌شود که سقف آن پیش از اجرا ثبت شده باشد

وضعیت هر guardrail یکی از `pass`، `fail`، `inconclusive` یا `unavailable` است. مقدار unavailable هرگز به‌عنوان pass نمایش داده نمی‌شود.

## Decision Policy

### Scale

فقط وقتی همه شروط برقرار باشند:

- Outcome Integrity Gate عبور کرده باشد
- فاصله اطمینان معیار اصلی کاملاً بالاتر از صفر باشد
- حداقل ۵۰ مشتری در هر بازو وجود داشته باشد
- guardrailهای قابل آزمون همگی pass باشند
- ROI مشاهده‌شده حداقل `1x` باشد

### Stop

- یک guardrail به‌طور قطعی fail شود، یا
- کران بالای فاصله اطمینان معیار اصلی صفر یا منفی باشد

### Iterate

آزمایش سالم است، اما اثر یا guardrail نامطمئن است، حجم نمونه کافی نیست یا ROI به کف اقتصادی نرسیده است.

### Needs Review

Integrity Gate عبور نکرده یا عدم‌قطعیت قابل محاسبه نیست. در این وضعیت تصمیم بودجه‌ای مسدود است.

## محدودیت‌ها

- treatmentهای متعدد فعلاً به‌عنوان یک policy pooled تحلیل می‌شوند. تحلیل هر بازو به‌تنهایی به plan و توان جداگانه و کنترل multiple testing نیاز دارد.
- استنباط بر مبنای assignment است، نه فقط exposed یا converted؛ بنابراین ITT حفظ می‌شود.
- تأیید آماری به معنی تأیید مالی نیست. سطح `verified incremental` همچنان نیازمند تطبیق مالی مستقل است.
- مهاجرت به مدل‌های robust، bootstrap یا cluster-aware در صورت نقض فرض استقلال در Sprint بعدی انجام می‌شود.
