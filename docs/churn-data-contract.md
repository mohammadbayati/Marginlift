# قرارداد داده Churn نسخه ۱

## دامنه

این قرارداد برای کسب‌وکار B2C تراکنشی است. واحد تحلیل یک `customer_id` ناشناس و پایدار است.

تعریف پیش‌فرض:

- تاریخ امتیازدهی: `index_date`
- پنجره مشاهده: ۹۰ روز قبل از `index_date`
- پنجره پیش‌بینی: ۳۰ روز بعد از `index_date`
- مشتری واجد شرایط: حداقل دو خرید موفق تاریخی و حداقل یک خرید در ۶۰ روز پیش از تاریخ امتیازدهی
- ریزش: نداشتن خرید موفق در ۳۰ روز بعد از تاریخ امتیازدهی

این تعریف برای هر مشتری باید با چرخه خرید همان vertical بازبینی و نسخه‌بندی شود.

## فایل رویدادها

grain هر ردیف یک رویداد مشتری است.

| ستون | الزام | تعریف |
| --- | --- | --- |
| `customer_id` | اجباری | شناسه hash‌شده و پایدار؛ بدون شماره موبایل یا ایمیل |
| `event_type` | اجباری | مانند `purchase_completed`، `app_open` یا `push_open` |
| `occurred_at` | اجباری | زمان ISO-8601 با timezone |
| `event_value_toman` | برای ارزش مشتری | مبلغ تراکنش یا صفر برای رویداد غیرمالی |
| `order_id` | برای خرید | شناسه سفارش غیرشخصی برای deduplication |
| `order_status` | برای خرید | فقط سفارش `completed` outcome خرید محسوب می‌شود |
| `discount_amount_toman` | برای تصمیم سودمحور | هزینه تخفیف همان تراکنش |
| `gross_margin_rate` | برای تصمیم سودمحور | نرخ حاشیه سود بین صفر و یک |
| `channel` | پیشنهادی | app، web، push، sms یا call |

واژگان خرید موفق در نسخه اول:

- `purchase_completed`
- `order_completed`
- `transaction_completed`

## قواعد point-in-time

- feature فقط از رویدادهای قبل از `index_date` ساخته می‌شود.
- outcome و برچسب churn وارد feature نمی‌شوند.
- split آموزش و آزمون زمانی است، نه تصادفی ساده.
- یک سفارش لغوشده یا برگشتی خرید موفق محسوب نمی‌شود.
- timezone همه منابع قبل از aggregation یکسان می‌شود.
- snapshotهای آموزش باید `feature_version` و `label_version` داشته باشند.

## Featureهای پایه

- recency، frequency و monetary value.
- فاصله متوسط و انحراف فاصله بین خریدها.
- تغییر روند تعداد سفارش و مبلغ.
- تعداد session، app open و تعامل کانال.
- استفاده تاریخی از تخفیف و نسبت خرید تخفیفی.
- نرخ لغو یا مرجوعی.
- tenure و cohort عضویت.

هیچ feature بعد از تاریخ امتیازدهی مجاز نیست.

## قرارداد مداخله

Churn Prediction برای پیشنهاد تخفیف کافی نیست. برای Uplift فایل دوم باید این موارد را داشته باشد:

```text
customer_id,experiment_id,assigned_group,assigned_at,exposed_at,
action,incentive_cost_toman,channel_cost_toman,outcome_at,
outcome_revenue_toman,gross_margin_rate
```

وجود گروه کنترل، assignment پایدار، exposure و outcome برای ادعای اثر افزایشی اجباری است.

## حریم خصوصی

فایل نباید شامل نام، ایمیل، تلفن، آدرس، کد ملی، شماره کارت یا device ID خام باشد. `customer_id` باید پیش از ارسال با salt متعلق به مشتری hash شود.

## وضعیت‌های ممیزی

| وضعیت | معنا |
| --- | --- |
| `needs_data_fix` | schema، تاریخ یا حریم خصوصی مشکل مسدودکننده دارد |
| `diagnostic_only` | داده خواندنی است اما تاریخچه یا نمونه برای مدل کافی نیست |
| `ready` | داده برای ساخت Churn baseline آماده است |

وضعیت `ready` برای Churn به معنی آمادگی Uplift یا مجوز تخفیف نیست.

## اجرای ممیزی

```bash
npm run churn:audit -- synthetic-churn-events.csv
```

برای خروجی ماشین‌خوان:

```bash
npm run churn:audit -- synthetic-churn-events.csv --json
```
