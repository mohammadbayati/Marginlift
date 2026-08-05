# Product Hardening 1

این مرحله برای کم‌کردن فاصله دمو تا پایلوت واقعی انجام شد.

## اضافه‌شده‌ها

- endpoint رویدادها: `POST /api/events`
- ذخیره رویدادهای محصول در JSON DB محلی
- export گزارش کمپین: `GET /api/campaigns/current/report`
- دکمه «دریافت گزارش» در داشبورد
- طرح event taxonomy و activation

## چرا مهم است

برای فروش پایلوت، مشتری فقط نباید داشبورد را ببیند؛ باید بتواند خروجی را در جلسه داخلی استفاده کند. export markdown این کار را ساده می‌کند.

برای PMF هم باید بدانیم آیا کاربر به لحظه ارزش رسیده یا نه. eventهای پایه همین را اندازه می‌گیرند.

## محدودیت‌های فعلی

- ذخیره‌سازی هنوز JSON DB است.
- eventها داشبورد تحلیلی ندارند.
- export فعلا Markdown است، نه PDF.
- consent و privacy policy production هنوز آماده نیست.

## قدم بعدی پیشنهادی

- ساخت PDF export یا print-ready report.
- اضافه‌کردن activity log در داشبورد.
- انتقال data store به PostgreSQL/Supabase/Neon.
- اضافه‌کردن role-based access.

