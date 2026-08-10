# سیاست پاک‌سازی داده Churn

## اصل

فایل raw تغییر نمی‌کند. هر نسخه clean شناسه، زمان، قواعد اجراشده و اختلاف ردیف با raw را ثبت می‌کند. مقدار ناموجود، تاریخ نامعتبر یا outlier بی‌صدا با صفر، میانگین یا median جایگزین نمی‌شود.

## ترتیب کار

1. ممیزی schema، PII، missingness، duplicate، range و پوشش زمانی.
2. اولویت‌بندی مسئله بر اساس اثر، شدت و هزینه اصلاح.
3. انتخاب روش اصلاح با مسئول داده مشتری.
4. ساخت نسخه clean و cleaning log.
5. اجرای دوباره ممیزی و تطبیق raw با clean.

## قواعد نسخه اول

| مسئله | رفتار پیش‌فرض |
| --- | --- |
| `customer_id` یا تاریخ خالی | قرنطینه؛ بدون imputation |
| تکرار دقیق رویداد | raw حفظ و در clean با کلید پایدار deduplicate شود |
| `order_id` تکراری | بررسی با منبع مالی؛ merge خودکار ممنوع |
| مبلغ منفی | قرنطینه و تطبیق با refund/ledger |
| gross margin خارج صفر تا یک | رد تصمیم مالی تا اصلاح |
| outlier مبلغ | flag و نگه‌داری؛ حذف فقط با تأیید دامنه |
| event type ناشناخته | mapping نسخه‌بندی‌شده یا دسته `other`؛ حذف نشود |
| churn label ارسالی | برای audit نگه‌داری، برای training استفاده نشود |

## Cleaning log

هر اجرا باید این موارد را ثبت کند:

```text
raw_artifact_id
clean_artifact_id
rule_version
rows_before
rows_after
rows_quarantined
duplicates_removed
range_violations
approved_by
created_at
```

Feature engineering فقط از نسخه clean تأییدشده استفاده می‌کند؛ گزارش Data Readiness همیشه به نسخه raw و clean هر دو اشاره می‌کند.
