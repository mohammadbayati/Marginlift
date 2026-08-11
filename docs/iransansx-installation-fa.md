# نصب امن IRANSansX در MarginLift

## اصل مهم

نصب فونت در سیستم‌عامل VM برای مرورگر مشتری کافی نیست. فایل WOFF2 باید از دامنه سرو شود، اما چون IRANSansX می‌تواند دارایی تجاری باشد، نباید بدون اجازه توزیع داخل GitHub عمومی قرار گیرد.

MarginLift فونت، متن مجوز و مدرک هش‌شده را در `private/fonts` نگه می‌دارد. این مسیر در Git و image داکر نادیده گرفته می‌شود و فقط به‌صورت read-only داخل container mount می‌شود.

## فایل‌های لازم

1. فایل واقعی `IRANSansX-Variable.woff2`.
2. متن یا رسید مجوز در یک فایل متنی.
3. نام دارنده مجوز.
4. شماره سفارش، فاکتور یا مرجع مجوز.
5. اطمینان صریح از اینکه مجوز، Web Embedding روی `marginlift.ir` را اجازه می‌دهد.

## نصب مستقیم روی محصول

در PowerShell و پوشه پروژه اجرا شود:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\deploy-font.ps1 `
  -FontPath "C:\مسیر\IRANSansX-Variable.woff2" `
  -LicensePath "C:\مسیر\license.txt" `
  -LicenseHolder "نام دارنده مجوز" `
  -LicenseReference "شماره سفارش یا فاکتور" `
  -ConfirmWebEmbedding
```

این فرایند:

- امضای WOFF2 و ساختار پایه فایل را بررسی می‌کند.
- هش فونت و متن مجوز را ثبت می‌کند.
- فایل‌ها را وارد Git نمی‌کند.
- دارایی را به مسیر خصوصی VM می‌فرستد.
- app را با mount فقط‌خواندنی فعال می‌کند.
- endpoint و دانلود واقعی فونت را روی دامنه بررسی می‌کند.

## کنترل نهایی

```powershell
$env:MARGINLIFT_BASE_URL='https://marginlift.ir'
$env:MARGINLIFT_DEMO_EMAIL='demo@marginlift.ir'
$env:MARGINLIFT_DEMO_PASSWORD='<رمز حساب دمو>'
$env:MARGINLIFT_REQUIRE_IRANSANSX='true'
npm run production:smoke
```

در `https://marginlift.ir/api/font-status` باید این مقادیر دیده شوند:

```json
{
  "activeFamily": "IRANSansX",
  "ready": true,
  "licensed": true,
  "webEmbeddingConfirmed": true
}
```

سپس `npm run ui:qa` باید `browserFaceLoaded: true` و `activeFamily: IRANSansX` ثبت کند. این دو مدرک نشان می‌دهند فایل فقط روی سرور وجود ندارد و مرورگر هم واقعاً آن را مصرف کرده است.

## بازگشت اضطراری

با حذف سه فایل IRANSansX از `/opt/marginlift/private/fonts`، runtime خودکار به Vazirmatn برمی‌گردد. حذف فقط زمانی انجام شود که نسخه پشتیبان مجوز و فونت در محل امن دیگری نگه‌داری شده باشد.
