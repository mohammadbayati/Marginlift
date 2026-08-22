# دموی MVP MarginLift

دموی استاتیک مسابقه برای RFS #049؛ یک پلتفرم تصمیم‌گیری برای uplift، churn و بودجه مشوق.

برای نسخه محصولی، پروژه را با Node اجرا کنید:

```bash
npm start
```

بعد این آدرس را باز کنید:

```text
http://localhost:3000
```

صفحه فروش:

```text
http://localhost:3000/sales.html
```

صفحه پیشنهاد پایلوت:

```text
http://localhost:3000/pilot.html
```

صفحه deck سرمایه‌گذار/مسابقه:

```text
http://localhost:3000/deck.html
```

هاب ارسال و ارائه:

```text
http://localhost:3000/submission.html
```

این نسخه با داده مصنوعی و deterministic نشان می‌دهد چطور یک موتور تصمیم‌گیری مشوق می‌تواند با منطق uplift و گروه کنترل، هدررفت تخفیف را کاهش دهد.

## پلتفرم سازمانی و MLOps

لایه سازمانی (Shadow Mode، ارکستراسیون و Kill-Switch، بیلینگ، گارد PII، مانیتور drift) و کل چرخه MLOps (مدل uplift واقعی، registry نسخه‌بندی‌شده، حلقه بازآموزی با promote معنادار، و حلقه بازخورد داده واقعی) در این اسناد مستند شده‌اند:

- `docs/enterprise-platform-fa.md`: معماری Hybrid (Node + Python)، احراز هویت session/JWT، تمام APIهای سازمانی با نمونه، چرخه مدل/registry/بازآموزی، متغیرهای محیطی، عملیات و استقرار.
- `docs/pilot-holdout-runbook-fa.md`: راهنمای اجرای پایلوت با holdout تصادفی برای جمع‌آوری داده uplift بی‌سوگیری و تغذیه حلقه بازآموزی.

## این دمو چه چیزی را نشان می‌دهد

- نمای کلی کمپین تاریخی.
- ورود و ثبت‌نام واقعی با session سمت سرور.
- آپلود CSV کمپین و تحلیل سمت سرور.
- بخش محصول قابل‌فروش برای توضیح دقیق پیشنهاد B2B.
- مقایسه گروه کنترل با کاربران دریافت‌کننده مشوق.
- uplift در سطح سگمنت.
- بازه اطمینان، کیفیت داده و گاردریل تصمیم.
- تخمین هدررفت مشوق.
- برنامه اقدام پیشنهادی برای کمپین بعدی.
- خلاصه ROI برای مدیر رشد یا CRM.
- صفحه فروش، one-pager، اسکریپت دمو، pitch deck outline و برنامه GTM.
- بنچمارک رقبا از آژانس‌های Digital Marketing و AI Marketing و تبدیل ایده‌های قابل‌استفاده به بخش‌های audit، اتاق شواهد و proof stack.
- Pilot Kit شامل data request، experiment brief، proposal و صفحه قابل‌ارسال پایلوت.
- Investor Kit شامل source of truth، memo، talk track، Q&A و deck وب‌محور.
- Submission Kit شامل hub ارائه، چک‌لیست آمادگی، نقشه راه ۳۰روزه و متریک‌های PMF.
- Product hardening شامل event tracking محلی، export گزارش کمپین و پنل سلامت پایلوت.

## جهت طراحی

نسخه فعلی برای مخاطب فارسی‌زبان و ارائه مسابقه بازطراحی شده است:

- راست‌چین کامل با جداسازی کنترل‌شده واژه‌های انگلیسی مثل `MarginLift` و `uplift`.
- فونت اصلی `Vazirmatn` با fallback امن روی `IRANSansX` و فونت‌های سیستمی.
- اعداد فارسی با `fa-IR`.
- چیدمان داشبورد متراکم با sidebar، نوار workspace، کارت‌های KPI، پنل insight، جدول decisioning و بخش پایلوت.
- الهام بصری از داشبوردهای مدرن eCommerce و B2B analytics، بدون کپی مستقیم.

## داده

فایل `synthetic-campaign-data.csv` یک دیتاست aggregate و کوچک برای توضیح منطق دمو است. اگر کاربر کمپین جدید وارد نکند، backend همین فایل را تحلیل می‌کند و خروجی را به داشبورد می‌دهد.

منطق مرحله ۲ در این سند توضیح داده شده است:

```text
docs/analysis-engine.md
```

بنچمارک رقبا و ایده‌هایی که از آن وارد محصول شده‌اند:

```text
docs/competitive-benchmark-digital-marketing.md
```

## نکته مهم

همه اعداد فرضی و مصنوعی‌اند. هدف آن‌ها storytelling مسابقه و مکالمه با اولین مشتری‌هاست، نه ادعای نتیجه واقعی مشتری.

در توسعه محلی از JSON DB استفاده می‌شود؛ production روی PostgreSQL، backup، audit زنجیره‌ای و کنترل دسترسی نقش‌محور اجرا می‌شود.

## Hardening

- `docs/product-hardening-1.md`: event tracking محلی و خروجی گزارش.
- `docs/product-hardening-2.md`: فانل استفاده، فعالیت‌های اخیر و تست integration سرور.

## بازبینی راهبردی نسخه ۲

- `docs/product-reassessment-2026.md`: جمع‌بندی کتاب‌ها، ممیزی محصول و محاسبات، معماری هدف و برنامه اجرایی ۱۲ هفته‌ای.
- `docs/claim-ladder.md`: قرارداد سطح شواهد و زبان مجاز برای KPIها و تصمیم‌های مالی.
- `docs/experiment-registry.md`: قرارداد Experiment Registry، گیت سلامت outcome، نسخه‌بندی و رفتار داده‌های قدیمی.
- `docs/statistical-decision-engine.md`: قرارداد estimand، CI، MDE، CUPED، guardrail و قواعد Scale / Iterate / Stop.
- `docs/model-governance.md`: بک‌تست، calibration، Champion/Challenger، drift و Decision Ledger.

## تست

```bash
npm test
```

## Churn & Retention Decisioning

نسخه MVP نگهداشت اکنون configuration-driven است. موتور داده، baseline و سیاست شواهد میان مشتریان مشترک می‌ماند و تفاوت هر کسب‌وکار در `Customer Configuration` ذخیره می‌شود. دو نقطه شروع فعلی:

- `generic_ecommerce`: سفارش تکرارشونده فروشگاه اینترنتی
- `super_app_packages`: خرید مجدد خدمات و بسته در سوپراپ

رابط محصول از بخش «حفظ مشتری» امکان انتخاب پکیج، تنظیم آستانه‌های چرخه، ورود CSV و مشاهده وضعیت چرخه و صف اقدام را می‌دهد. APIهای عمومی این لایه:

- `GET /api/retention/configuration`
- `PATCH /api/retention/configuration`
- `GET /api/retention/workspace`
- `POST /api/retention/import`
- `GET /api/contact-policy/workspace`
- `GET /api/retention/audience.csv`

ریسک بالا به‌تنهایی مجوز مشوق نیست. تمام خروجی‌های این Workspace تا پیش از holdout با برچسب برآورد تاریخی نمایش داده می‌شوند.

خروجی عملیاتی CRM فقط زمانی ساخته می‌شود که فایل ورودی ستون‌های `consent_status`، `preferred_channel`، `do_not_contact`، `contact_count_30d` و `last_contact_at` را داشته باشد. نبود رضایت، opt-out، کانال نامعتبر یا رسیدن به سقف تماس، ردیف را در سمت سرور مسدود می‌کند. جزئیات قرارداد در `docs/contact-safety-contract-fa.md` است.

فاز بنیان سرویس Churn شامل تعریف بازار، قرارداد point-in-time و ممیز آمادگی داده است:

- `docs/churn-service-foundation.md`
- `docs/churn-data-contract.md`
- `docs/churn-mom-test-discovery.md`
- `docs/churn-validation-and-build-gates.md`
- `docs/churn-data-cleaning-policy.md`
- `docs/churn-gate-status.md`
- `docs/churn-discovery-scorecard.csv`
- `docs/churn-database-blueprint.md`
- `docs/churn-positioning-and-motion-guardrails.md`
- `docs/churn-commercial-case.sample.json`
- `synthetic-churn-events.csv`

بسته اختصاصی جلسه کشف Channel Retention با تیم آپ در مسیر زیر قرار دارد:

- `docs/ap-channel-retention-discovery/README-fa.md`
- `docs/ap-channel-retention-product-roadmap.md`

ممیزی یک فایل رویدادی:

```bash
npm run churn:audit -- synthetic-churn-events.csv
```

ساخت Value Case سه‌سناریویی با فرض‌های آشکار:

```bash
npm run churn:forecast -- docs/churn-commercial-case.sample.json
```

ممیزی اختصاصی خرید مجدد بسته اینترنت:

```bash
npm run retention:audit -- synthetic-package-transactions.csv \
  --interventions synthetic-package-interventions.csv
```

برای خروجی ماشین‌خوان، `--json` را به انتهای دستور اضافه کنید. فایل‌های مصنوعی فقط برای بررسی قرارداد هستند و proof بازار یا مدل محسوب نمی‌شوند.

ساخت dataset نقطه‌درزمان برای Survival، با cut-off صریح:

```bash
npm run retention:dataset -- synthetic-package-transactions.csv \
  --cutoff 2026-02-01T00:00:00Z \
  --output data/channel-retention-dataset.json
```

این خروجی شامل reconciliation، ردیف‌های حذف‌شده، episodeهای مشاهده‌شده یا censored و snapshotهای قابل امتیازدهی است. وجود dataset به معنی عبور Model Gate نیست.

ساخت Kaplan–Meier baseline:

```bash
npm run retention:baseline -- data/channel-retention-dataset.json \
  --min-group-size 2 \
  --output data/survival-baseline.json
```

عدد `2` فقط برای فایل مصنوعی کوچک است. مقدار پیش‌فرض محصول `30` episode در هر گروه است و پس از مشاهده داده واقعی با تحلیل توان و پایداری بازبینی می‌شود.

آماده‌سازی محیط مدل و آموزش candidate آفلاین:

```bash
python -m pip install -r requirements-ml.txt
npm run retention:model -- data/channel-retention-dataset.json \
  --output-dir data/models/channel-retention
```

اگر نمونه حداقل اولیه را نداشته باشد، worker فقط Model Card با وضعیت `insufficient_sample` می‌سازد و artifact مدل تولید نمی‌کند. عبور آفلاین فقط مجوز Shadow Mode است.

## حساب دمو برای ارزیابی مشتری

راهنمای قابل‌ارسال به ارزیاب در `docs/demo-user-guide-fa.txt` قرار دارد. حساب دمو باید با نقش `viewer` و تاریخ انقضای کوتاه ساخته شود تا داده‌ها فقط قابل مشاهده باشند:

```bash
npm run demo-user -- --organization="نام دقیق فضای کاری" --email=reviewer@example.com --name="مهمان دمو" --days=7
```

رمز تصادفی فقط در خروجی فرمان نمایش داده می‌شود و نباید داخل Git یا فایل راهنما ثبت شود.

## Sprint 4: زیرساخت production

نسخه production اکنون از PostgreSQL به‌عنوان منبع اصلی، ذخیره رمزنگاری‌شده CSV، نقش‌های `viewer` / `analyst` / `admin` / `owner`، audit زنجیره‌ای، صف durable و metrics عملیاتی استفاده می‌کند. JSON فقط fallback توسعه محلی است.

راهنمای مهاجرت و استقرار:

```text
docs/sprint4-production-platform.md
docs/vm-deployment.md
```

## انتشار روی marginlift.ir

معماری انتشار فعلی این است: Cloudflare برای DNS، SSL/TLS و WAF؛ Node.js/Docker روی یک origin با volume پایدار. جزئیات در این اسناد است:

- `docs/production-readiness-audit.md`
- `docs/deployment-architecture.md`
- `docs/production-launch-checklist.md`
- `docs/cloudflare-cutover-runbook.md`
- `docs/vm-deployment.md`

فایل `.env.example` متغیرهای محیط را نشان می‌دهد. در production حتماً `APP_ORIGIN`، `SESSION_SECRET`، `POSTGRES_PASSWORD` و `ARTIFACT_ENCRYPTION_KEY` را تنظیم کنید. برای backup کامل VM:

```bash
/opt/marginlift/ops/vm/backup.sh
```

این نسخه برای pilot service-led و یک instance طراحی شده است؛ قبل از scale افقی، سند JSONB تراکنشی باید به جدول‌های tenant-aware دامنه‌ای تفکیک شود.

## آمادگی دمو و پایلوت

- ثبت‌نام عمومی در production به‌صورت پیش‌فرض خاموش است؛ حساب‌ها با دعوت ساخته می‌شوند.
- Scorecard رسمی: `docs/demo-and-pilot-readiness-scorecard-fa.md`
- Runbook اجرایی پایلوت: `docs/service-led-pilot-runbook-fa.md`
- ساخت Workspace و مالک پایلوت:

```bash
npm run pilot-user -- --organization="نام مشتری" --email=owner@example.com --role=owner --days=30
```

- تست دامنه واقعی با حساب مشاهده‌گر، بدون ثبت رمز در Git:

```bash
MARGINLIFT_DEMO_EMAIL=reviewer@example.com \
MARGINLIFT_DEMO_PASSWORD='temporary-password' \
npm run production:smoke
```

- بکاپ روزانه با systemd زمان‌بندی می‌شود و آخرین نسخه با `ops/vm/verify-backup.sh` در یک دیتابیس موقت restore-test می‌شود.

## کنترل کیفیت رابط

برای اجرای ممیزی بازتولیدپذیر دسکتاپ، موبایل، کیبورد، درخت دسترس‌پذیری و داده‌های مرزی، ابتدا نسخه محلی را روی پورت `3004` اجرا کنید و سپس بزنید:

```bash
npm run ui:qa
```

خروجی ساختاریافته در `docs/ui-quality-audit-latest.json` ثبت می‌شود. پروتکل سه تست کاربری واقعی نیز در `docs/usability-test-protocol-fa.md` قرار دارد.

پس از ثبت سه جلسه واقعی در scorecard، گیت نهایی تجربه کاربر با این دستور سنجیده می‌شود:

```bash
npm run usability:evaluate
```

این ارزیاب تا زمان پوشش سه نقش هدف، یک جلسه واقعی Narrator/NVDA و صفرشدن Severity 1 و 2 وضعیت `pass` نمی‌دهد.

## فونت فارسی لایسنس‌دار

تایپوگرافی همه صفحات از `/fonts/marginlift-font.css` کنترل می‌شود. تا پیش از نصب فایل مجاز، Vazirmatn fallback رسمی است. روش نصب خصوصی IRANSansX بدون انتشار در GitHub در `docs/iransansx-installation-fa.md` آمده است.

وضعیت فعال فونت:

```text
GET /api/font-status
```

