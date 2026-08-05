# Experiment Brief: Live Holdout Pilot

## Overview

| مورد | مقدار |
| --- | --- |
| نام تست | MarginLift Incentive Policy Holdout |
| مالک مشتری | مدیر رشد یا CRM |
| مالک تحلیل | MarginLift |
| مدت پیشنهادی | ۴ تا ۶ هفته |
| نوع تست | Holdout / A/B policy test |
| تخصیص ترافیک | ۸۰٪ policy فعلی، ۲۰٪ policy پیشنهادی یا ۹۰٪/۱۰٪ برای شروع محافظه‌کارانه |

## Hypothesis

If we replace the current high-incentive policy with MarginLift's segment-level policy for eligible returning users,
then incentive cost per incremental order will decrease by at least ۱۰٪ while preserving at least ۹۵٪ reported revenue,
because many users receive incentives even when their baseline purchase probability is already high.

## Primary Metric

**Incentive cost per incremental order**

تعریف:

```text
incentive_cost / (variant_conversions - expected_conversions_from_control)
```

تصمیم پایلوت بر اساس همین metric گرفته می‌شود.

## Guardrail Metrics

| گاردریل | آستانه توقف یا هشدار |
| --- | --- |
| Revenue preserved | کمتر از ۹۵٪ policy فعلی نشود |
| Conversion rate | افت بیشتر از ۵٪ نسبی نیاز به pause دارد |
| Complaint / unsubscribe | افزایش معنادار نسبت به کمپین مشابه نداشته باشد |
| Sample ratio mismatch | اختلاف allocation بیشتر از ۲٪ بررسی شود |

## Secondary Metrics

- نرخ تبدیل هر سگمنت.
- GMV یا revenue هر کاربر.
- هزینه مشوق هر کاربر.
- سود افزایشی تخمینی.
- share کاربران بدون مشوق یا فقط پیام.

## Sample Size Planning

محاسبه با alpha=0.05 و power=0.8 برای تشخیص ۲۰٪ lift نسبی:

| نرخ تبدیل پایه | نرخ variant هدف | نمونه لازم در هر گروه | کل نمونه | با ۵٬۰۰۰ کاربر/روز |
| --- | --- | --- | --- | --- |
| ۵٪ | ۶٪ | ۸٬۱۵۵ | ۱۶٬۳۱۰ | حدود ۴ روز + buffer |
| ۸٪ | ۹٫۶٪ | ۴٬۹۱۸ | ۹٬۸۳۶ | حدود ۲ روز + buffer |
| ۱۰٪ | ۱۲٪ | ۳٬۸۳۹ | ۷٬۶۷۸ | حدود ۲ روز + buffer |

نکته: برای اثرهای کوچک‌تر از ۲۰٪، sample size به‌طور جدی بیشتر می‌شود. برای تصمیم‌های مالی مهم، حداقل یک چرخه کامل weekday/weekend باید دیده شود.

## Pre-Launch Checklist

- [ ] سگمنت‌های eligible نهایی شده‌اند.
- [ ] کاربران به‌صورت ثابت و بدون هم‌پوشانی assignment می‌شوند.
- [ ] کنترل‌گروه یا policy فعلی دست‌نخورده باقی می‌ماند.
- [ ] primary metric و guardrailها قبل از اجرا freeze شده‌اند.
- [ ] گزارش daily فقط برای سلامت اجرا دیده می‌شود، نه تصمیم زودهنگام.
- [ ] قانون توقف، مالک تصمیم و زمان readout مشخص شده است.

## Decision Rules

| نتیجه | تصمیم |
| --- | --- |
| هزینه مشوق حداقل ۱۰٪ کم شود و revenue preserved بالای ۹۵٪ بماند | تبدیل به قرارداد ماهانه |
| صرفه‌جویی مثبت باشد اما CI گسترده باشد | یک تست بزرگ‌تر اجرا شود |
| revenue یا conversion guardrail بشکند | policy فعلی حفظ شود و تحلیل سگمنت انجام شود |
| داده کیفیت کافی نداشته باشد | فقط diagnostic تاریخی تحویل شود، ادعای causal نشود |

