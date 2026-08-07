# بازبینی راهبردی و فنی MarginLift ـ نسخه ۲

تاریخ بازبینی: ۱۴ مرداد ۱۴۰۵ / ۵ اوت ۲۰۲۶

## جمع‌بندی مدیریتی

MarginLift مسئله درستی را انتخاب کرده است، اما محصول فعلی هنوز «موتور تصمیم‌گیری افزایشی» نیست؛ یک MVP تحلیلی aggregate است که داستان محصول آینده را خوب نمایش می‌دهد. برای برنده‌شدن در مسابقه، این دمو قابل‌دفاع است. برای فروش سازمانی و جذب سرمایه، باید سه ادعا با داده واقعی اثبات شوند:

۱. تشخیص دهد کدام مشوق واقعاً رفتار مشتری را تغییر داده است.

۲. با محدودیت بودجه، حاشیه سود و ریسک، بهترین اقدام را برای هر سگمنت یا مشتری انتخاب کند.

۳. نتیجه را در یک آزمایش معتبر تکرار و به سود افزایشی قابل‌حسابرسی تبدیل کند.

تعریف پیشنهادی محصول:

> MarginLift سیستم‌عامل سودآوری مشوق‌هاست؛ برای هر مشتری تصمیم می‌گیرد «هیچ اقدامی، پیام، تخفیف یا مشوق قوی» کدام‌یک بیشترین سود افزایشی را می‌سازد و این تصمیم را با کنترل‌گروه اثبات می‌کند.

جایگاه فعلی محصول: **Demo-ready و Pilot-conversation-ready، اما هنوز Production-ready و Causal-claim-ready نیست.**

## مبنای بازبینی

### کتاب‌ها

| منبع | آموزه‌ای که وارد طرح شد | کاربرد مستقیم در MarginLift |
| --- | --- | --- |
| Data Science for Business Professionals | چرخه کامل مسئله، داده، آماده‌سازی، تولید، DevOps و BI | تبدیل CSV نمایشی به قرارداد داده، خط لوله و خروجی مدیریتی |
| Designing Machine Learning Systems with Python | سؤال درست، خطا، طراحی ویژگی، ارزیابی، انتخاب مدل و learning curve | شروع با baseline ساده و طراحی failure mode قبل از مدل پیچیده |
| Causal Inference in Python | potential outcome، randomization، DAG، CATE، meta-learner، switchback و noncompliance | جداسازی پیش‌بینی ریزش از اثر مداخله و ساخت سیاست شخصی‌سازی‌شده |
| Cause and Effect Business Analytics | uplift، true responders، test-and-learn و treatment optimization | تبدیل uplift به تصمیم چنددرمانی تحت محدودیت سود و بودجه |
| Fighting Churn with Data | تعریف ریزش، event-to-metric، cohort، calibration، drift، AUC/lift، backtest و CLV | ساخت لایه سنجش رفتار و پیش‌بینی ریسک به‌عنوان ورودی، نه تصمیم نهایی |
| Trustworthy Online Controlled Experiments | فایل ارائه‌شده فقط ۲ صفحه و ناقص است | اصول آزمایش با راهنمای مهارت آزمایش و منابع رسمی Microsoft ExP تکمیل شد |

نکته: کتاب ۲۰۱۶ درباره طراحی ML از نظر ابزار قدیمی است، اما اصول صورت‌بندی مسئله، failure planning، ویژگی و ارزیابی همچنان معتبرند. انتخاب فناوری در این سند با الگوهای ۲۰۲۵/۲۰۲۶ به‌روزرسانی شده است.

### مهارت‌های استفاده‌شده

- `find-skills`: انتخاب مجموعه مهارت‌ها از کاتالوگ نصب‌شده.
- `business-strategy`: جایگاه رقابتی، wedge و منطق خلق ارزش.
- `experiment-designer`: فرضیه، MDE، توان آزمون، stopping rule و guardrail.
- `ai-ml-data-science`: قرارداد داده، lineage، ارزیابی، model card و feedback loop.
- `backend-development`: معماری production، امنیت، تست و مشاهده‌پذیری.
- `ai-security`: ریسک poisoning، inversion و کنترل دسترسی در مرحله ML.
- `competitive-intel`: تمایز از BI، آژانس، CDP، ابزار CRM و راهکار in-house.
- `churn-prevention`: نگاشت دلیل/رفتار به مداخله و سنجش نتیجه، با این محدودیت که هسته MarginLift باید causal باشد.

## اصل اول محصول

هدف کسب‌وکار «افزایش conversion» یا «پیداکردن مشتری در معرض ریزش» نیست. هدف، بیشینه‌کردن سود افزایشی پس از هزینه مداخله است:

```text
best_action(x) = argmax_t [ E(Y(t) - Y(0) | X=x) * contribution_margin - treatment_cost(t) ]
```

با این محدودیت‌ها:

- درآمد، نرخ تبدیل و تجربه مشتری از guardrail عبور نکنند.
- عدم‌قطعیت از حد قابل‌قبول بیشتر نباشد.
- بودجه کل و ظرفیت کانال رعایت شود.
- تصمیم برای سگمنت‌های کم‌نمونه به fallback محافظه‌کارانه برگردد.
- هر تصمیم، نسخه مدل، نسخه داده و دلیل قابل‌حسابرسی داشته باشد.

نتیجه راهبردی: **churn score فقط یک feature است؛ uplift و policy value محصول واقعی‌اند.**

## ارزیابی وضعیت فعلی

| محور | امتیاز فعلی از ۱۰ | توضیح |
| --- | ---: | --- |
| وضوح مسئله اقتصادی | ۸٫۵ | درد هدررفت مشوق روشن و قابل‌فروش است |
| روایت و تجربه دمو | ۸ | فارسی، قابل‌ارائه و متصل به تصمیم مالی |
| آمادگی مکالمه پایلوت | ۷ | پیشنهاد، data request و experiment brief آماده‌اند |
| اعتبار محاسبات مالی | ۴ | baseline و تعریف margin باید اصلاح شوند |
| اعتبار causal | ۳ | aggregate comparison است، نه causal engine کامل |
| داده و MLOps | ۲ | قرارداد رویداد، lineage، registry و drift وجود ندارند |
| معماری production | ۳ | JSON DB و Node stdlib برای دمو مناسب، برای مشتری واقعی نامناسب است |
| امنیت سازمانی | ۳ | session پایه هست؛ RBAC، isolation، encryption و audit واقعی نیست |
| قابلیت دفاع برای سرمایه‌گذار | ۵٫۵ | با یک پایلوت پولی و live holdout می‌تواند به ۸ برسد |

## یافته‌های بحرانی

### P0 ـ قبل از هر ادعای پایلوت واقعی

#### ۱. baseline مالی فعلی «وضعیت مشاهده‌شده» نیست

موتور در هر سگمنت، `high_incentive` را policy جاری فرض و نتیجه آن را روی کل جمعیت سگمنت projection می‌کند. در داده نمونه:

- هزینه مشاهده‌شده همه بازوها: حدود ۲۵۰ میلیون تومان.
- هزینه policy جاریِ شبیه‌سازی‌شده: ۷۵۰ میلیون تومان.
- صرفه‌جویی نمایش‌داده‌شده: ۵۷۲٫۵ میلیون تومان.

این عدد، صرفه‌جویی نسبت به policy فرضی «مشوق قوی برای همه» است، نه نسبت به هزینه واقعی مشاهده‌شده. تا زمانی که baseline صریح نباشد، این خروجی می‌تواند برای مشتری یا داور گمراه‌کننده باشد.

اصلاح:

- ورودی `baseline_policy` و `observed_allocation` اضافه شود.
- سه عدد جدا نمایش داده شوند: observed، simulated baseline و recommended.
- هیچ savings بدون نام counterfactual نمایش داده نشود.

#### ۲. «حاشیه سود» در کد، حاشیه سود واقعی نیست

محاسبه فعلی `revenue - incentive_spend` است و بهای کالا، هزینه ارسال، cashback، سهم فروشنده و gross margin را لحاظ نمی‌کند. ستون `gross_margin` در سند پایلوت درخواست شده، اما parser و engine آن را مصرف نمی‌کنند.

اصلاح:

```text
incremental_contribution = incremental_revenue * gross_margin_rate
                         - incentive_cost
                         - channel_cost
                         - fulfillment_subsidy
```

واژه `marginLift` تا زمان این اصلاح باید به `netRevenueAfterIncentive` تغییر نام دهد.

#### ۳. کیفیت داده با معیار ناکافی، امتیاز ۱۰۰ می‌گیرد

وجود کنترل‌گروه و مقادیر عددی معتبر برای causal claim کافی نیست. موتور فعلی این موارد را بررسی نمی‌کند:

- واحد randomization و assignment پایدار.
- Sample Ratio Mismatch.
- هم‌پوشانی کاربران بین بازوها و contamination.
- زمان exposure و پنجره outcome.
- A/A test یا سلامت instrumentation.
- تفاوت پیش از آزمایش و covariate balance.
- novelty، seasonality و concurrent campaigns.
- coupon leakage و noncompliance.

امتیاز کیفیت باید به چهار زیرامتیاز تبدیل شود: schema، experiment design، instrumentation و statistical power.

#### ۴. قانون توصیه مشوق پولی بیش‌ازحد خوش‌بینانه است

در حال حاضر اگر `ciHigh > 0` و سود نقطه‌ای مثبت باشد، candidate پولی می‌تواند انتخاب شود؛ حتی وقتی بازه اطمینان صفر را قطع می‌کند. برای خرج واقعی باید از lower confidence bound سود یا سیاست risk-adjusted استفاده شود.

```text
risk_adjusted_value = expected_incremental_profit - lambda * uncertainty
```

پیش‌فرض پایلوت:

- تصمیم «اجرا» فقط با lower bound مثبت یا live holdout محدود.
- تصمیم «آزمایش بیشتر» برای CI نامطمئن.
- تصمیم «عدم اقدام» برای ارزش منفی یا داده ضعیف.

#### ۵. انتخاب policy روی همان داده‌ای ارزیابی می‌شود که policy را ساخته است

این کار selection bias و خوش‌بینی ایجاد می‌کند. policy باید با یکی از این روش‌ها سنجیده شود:

- holdout زمانی مستقل.
- cross-fitting برای uplift/CATE.
- off-policy evaluation با propensity معلوم.
- آزمایش آنلاین کنترل‌شده به‌عنوان معیار نهایی.

### P1 ـ قبل از اتصال اولین مشتری

- JSON DB باید به PostgreSQL با migration و tenant isolation منتقل شود.
- entityهای experiment، variant، assignment، exposure، outcome، cost، model و policy باید ایجاد شوند.
- رمز عبور باید با Argon2id یا سرویس auth مدیریت‌شده ذخیره شود؛ PBKDF2 فعلی برای دمو قابل‌قبول است، اما انتخاب نهایی نیست.
- roleهای `owner`، `analyst`، `operator`، `finance_viewer` و `auditor` لازم‌اند.
- audit log امنیتی باید از product analytics جدا شود.
- retention، حذف داده، hashing شناسه مشتری و secrets management لازم‌اند.
- تست golden برای محاسبات مالی، property test برای parser و integration test همه endpointها لازم‌اند.

### P2 ـ قبل از scale و fundraising جدی

- model registry، data lineage، model card و approval workflow.
- monitoring برای drift، calibration، policy value، latency و cost.
- shadow و canary برای نسخه‌های policy/model.
- connectors برای CRM/CDP، warehouse و کانال اجرا.
- مشاهده‌پذیری با trace، metric و structured log.
- SLA، backup/restore، incident response و status page.

## معماری محصول هدف

### ماژول‌های تجربه کاربر

۱. **Data Health**: اتصال منبع، قرارداد داده، freshness، missingness، overlap و readiness score.

۲. **Experiment Studio**: فرضیه، واحد randomization، variants، MDE، sample size، guardrail و stopping rule.

۳. **Incrementality Lab**: ATE، CATE، confidence interval، SRM، balance و segment heterogeneity.

۴. **Policy Builder**: انتخاب اقدام تحت budget، margin، frequency cap و ریسک.

۵. **Activation**: export audience یا ارسال decision از API به CRM/CDP.

۶. **Evidence Room**: نسخه داده/مدل، assumptions، override، approval و گزارش مدیریتی.

۷. **Model Health**: calibration، AUUC/Qini، policy value، drift، performance slice و rollback.

### معماری فنی پیشنهادی

در مرحله فعلی modular monolith بهتر از microservice است:

```text
Browser / Persian RTL App
        |
API + Auth + RBAC (TypeScript)
        |
PostgreSQL ---- Object Storage
        |
Job Queue / Scheduler
        |
Python Causal & ML Worker
        |
Model Registry + Metrics + Audit
```

انتخاب محافظه‌کارانه:

- Frontend: حفظ UI فعلی و مهاجرت تدریجی به component-based frontend در صورت رشد سطح تعامل.
- API: TypeScript با validation، versioning و OpenAPI.
- Data: PostgreSQL؛ object storage برای فایل خام و artifact.
- ML: Python، scikit-learn و gradient boosting به‌عنوان baseline؛ causal library فقط پس از data contract.
- Jobs: batch روزانه در پایلوت؛ real-time فقط اگر use case مشتری آن را توجیه کند.
- Deploy: staging/production جدا، CI، migration test، feature flag و rollback.

### مدل داده حداقلی

| entity | فیلدهای حیاتی |
| --- | --- |
| organization | tenant، plan، retention policy |
| data_source | type، schema_version، freshness_sla |
| customer | hashed_external_id، consent_scope |
| event | customer_id، event_type، occurred_at، value |
| experiment | hypothesis، unit، start/end، status |
| variant | treatment، cost، allocation |
| assignment | unit_id، variant_id، assigned_at، hash_version |
| exposure | assignment_id، channel، exposed_at |
| outcome | unit_id، metric، value، window |
| model_version | dataset_version، feature_version، artifact، metrics |
| policy_version | objective، constraints، model_version، status |
| decision | unit_id، action، expected_value، confidence، reason |
| override | decision_id، actor، reason، timestamp |

## نقشه علم داده و causal ML

### لایه ۰ ـ metric truth

- تعریف دقیق churn برای هر vertical: subscription، inactivity یا transactional lapse.
- outcome اصلی: contribution margin در پنجره ثابت.
- exposure، conversion و cost در یک grain مشخص.
- identity و timezone یکسان.
- metric dictionary نسخه‌بندی‌شده.

### لایه ۱ ـ baselineهای قابل‌فهم

- cohort analysis و RFM/behavioral metrics.
- logistic regression برای churn probability با calibration.
- gradient boosting به‌عنوان challenger.
- temporal backtest و performance slice.

خروجی این لایه فقط «ریسک» است و مجوز ارسال مشوق نیست.

### لایه ۲ ـ اثر متوسط مداخله

- A/B یا holdout برای ATE.
- CUPED یا covariate adjustment برای کاهش variance، پس از صحت randomization.
- SRM و balance check پیش از readout.
- confidence interval و practical significance در کنار p-value.

### لایه ۳ ـ اثر ناهمگن و uplift

- baseline: transformed outcome یا two-model ساده.
- سپس S/T/X-learner یا doubly robust learner با cross-fitting.
- ارزیابی با AUUC/Qini، calibration of CATE و policy value؛ نه accuracy معمولی.
- validation زمانی و segment-level stability.
- مدل باید persuadable، sure thing، lost cause و do-not-disturb را از هم جدا کند.

### لایه ۴ ـ بهینه‌سازی چنددرمانی

- گزینه‌ها: no action، push، SMS، small discount، cashback و strong incentive.
- objective: incremental contribution profit.
- constraints: budget، channel capacity، contact frequency، customer fairness و revenue floor.
- uncertainty-aware policy و fallback.
- approval انسانی برای policy جدید تا زمان رسیدن به شواهد کافی.

## استاندارد آزمایش MarginLift

هر آزمایش باید قبل از شروع این موارد را freeze کند:

- سؤال تصمیم و فرضیه If/Then/Because.
- واحد randomization و روش assignment پایدار.
- یک primary metric و guardrailهای محدود.
- baseline، MDE، alpha، power و sample size.
- minimum duration برای پوشش چرخه هفتگی.
- eligibility، exclusion و treatment cost.
- stopping rule، pause rule و rollback owner.
- plan تحلیل، segmentهای ازپیش‌ثبت‌شده و multiple-testing correction.

گیت‌های سلامت:

۱. instrumentation/A/A سالم.

۲. SRM و balance قابل‌قبول.

۳. عدم تداخل کمپین و leakage.

۴. نمونه و مدت از پیش تعیین‌شده کامل.

۵. primary metric، effect size و CI منتشرشده.

۶. guardrail بدون شکست.

۷. تصمیم ship / iterate / reject با owner.

## محصولی که باید فروخته شود

### نه این‌ها

- یک داشبورد گزارش‌گیری دیگر.
- یک churn predictor عمومی.
- «AI مارکتینگ» بدون روش اثبات.
- جایگزین CRM یا CDP.
- آژانس اجرای کمپین.

### پیشنهاد تجاری سه‌مرحله‌ای

#### مرحله ۱ ـ Incentive Waste Diagnostic

- ورودی: ۳ تا ۶ کمپین تاریخی aggregate یا ناشناس.
- خروجی: baseline audit، شکاف داده، تخمین هدررفت و طرح آزمایش.
- مدل درآمد: fee ثابت.
- ادعا: diagnostic؛ بدون کنترل معتبر ادعای causal قطعی نمی‌شود.

#### مرحله ۲ ـ Live Incrementality Pilot

- ورودی: assignment و exposure معتبر.
- خروجی: savings و incremental profit تاییدشده، policy readout و case study.
- مدل درآمد: fee ثابت + success fee روی ارزش تاییدشده.
- معیار تبدیل: اثر اقتصادی مثبت و guardrail سالم.

#### مرحله ۳ ـ Incentive Decisioning Subscription

- ورودی: جریان رویداد یا batch دوره‌ای.
- خروجی: policy نسخه‌بندی‌شده، decision export/API، monitoring و evidence room.
- مدل درآمد: اشتراک ماهانه بر اساس حجم eligible users/decisions، نه تعداد صندلی.

### ICP پیشنهادی

تمرکز اولیه روی کسب‌وکارهایی که:

- کمپین بازگشت و مشوق را حداقل ماهانه اجرا می‌کنند.
- حجم کافی برای holdout دارند.
- هزینه مشوق برای CFO یا مدیر رشد معنادار است.
- event و revenue را در سطح کاربر ناشناس نگه می‌دارند.
- می‌توانند policy کمپین را تغییر دهند.

خریدار اقتصادی: مدیر رشد یا CFO.

قهرمان داخلی: CRM/Lifecycle Lead یا Data/BI Lead.

کاربر روزانه: analyst و campaign operator.

## برنامه اجرایی ۱۲ هفته‌ای

فرض ظرفیت: یک توسعه‌دهنده senior full-stack، یک data/ML engineer و نیم‌وقت product/design. اجرای solo واقع‌بینانه‌تر ۱۸ تا ۲۴ هفته زمان می‌خواهد.

### هفته ۱ تا ۲ ـ Truth Layer و اصلاح P0

خروجی‌ها:

- metric dictionary و data contract v1.
- baseline صریح: observed / simulated / recommended.
- contribution margin واقعی و breakdown هزینه.
- سه وضعیت تصمیم: اجرا، آزمایش بیشتر، عدم اقدام.
- golden dataset با پاسخ محاسباتی مستقل.
- disclaimer و confidence language هماهنگ در UI، گزارش و deck.

معیار خروج:

- CFO بتواند هر عدد را از ورودی تا خروجی بازسازی کند.
- تست golden برای همه سناریوهای مالی پاس شود.
- هیچ savings بدون baseline نام‌گذاری‌شده نمایش داده نشود.

### هفته ۳ تا ۴ ـ Production Foundation

خروجی‌ها:

- PostgreSQL schema و migration.
- TypeScript API با validation و OpenAPI.
- tenant isolation، RBAC، audit log و data retention.
- object storage برای uploadها.
- CI برای unit، integration، migration و security scan.

معیار خروج:

- دو سازمان آزمایشی هیچ داده‌ای از یکدیگر نبینند.
- backup/restore آزمایش شود.
- critical path حداقل ۹۰٪ پوشش و همه endpointها integration test داشته باشند.

### هفته ۵ تا ۶ ـ Experiment OS

خروجی‌ها:

- ساخت experiment، variant و assignment plan.
- sample size calculator و pre-launch checklist داخل محصول.
- ingestion برای assignment، exposure و outcome.
- SRM، balance، power، guardrail و experiment health dashboard.
- report نسخه‌بندی‌شده و decision log.

معیار خروج:

- یک A/A synthetic خطای instrumentation را پیدا کند.
- یک آزمایش sample-size ناکافی اجازه claim قطعی نگیرد.
- readout با بازتولید کامل محاسبات ساخته شود.

### هفته ۷ تا ۸ ـ Churn/Behavior Baseline

خروجی‌ها:

- event-to-feature pipeline با point-in-time correctness.
- RFM، recency، frequency، trend و channel engagement.
- logistic regression calibrated و gradient-boosting challenger.
- temporal backtest، AUC/PR-AUC، lift، calibration و slice analysis.
- model card و dataset version.

معیار خروج:

- leakage test و train/serve parity پاس شود.
- مدل نسبت به baseline ساده بهبود پایدار داشته باشد.
- عملکرد segmentهای کم‌نمونه جدا گزارش شود.

### هفته ۹ تا ۱۰ ـ Uplift و Policy Optimizer v1

خروجی‌ها:

- CATE baseline و doubly robust challenger.
- AUUC/Qini، policy value، CATE calibration و temporal validation.
- optimizer برای no action / message / discount تحت budget و margin floor.
- reason code، uncertainty و approval/override.
- shadow mode روی داده پایلوت.

معیار خروج:

- policy روی holdout مستقل ارزیابی شود.
- lower-bound سود برای اقدام پولی منفی نباشد.
- هر decision به data/model/policy version متصل باشد.

### هفته ۱۱ تا ۱۲ ـ Pilot Launch و Hardening

خروجی‌ها:

- connector اول بر اساس مشتری واقعی؛ CSV/S3/warehouse، نه مجموعه‌ای از integrationهای نمایشی.
- production monitoring، alert، rollback و runbook.
- privacy notice، DPA outline، deletion workflow و incident plan.
- یک live holdout با مشتری design partner.
- case-study template با baseline، effect، CI، guardrail و ارزش مالی.

معیار خروج:

- یک پایلوت پولی یا LOI امضاشده.
- eventها و هزینه‌ها حداکثر در SLA توافق‌شده وارد شوند.
- آزمایش بدون شکست guardrail به readout برسد.
- نتیجه برای مدیر رشد و مالی قابل تایید باشد.

## مسیر GTM موازی

| بازه | اقدام | KPI |
| --- | --- | --- |
| هفته ۱ | انتخاب یک vertical و ۳۰ حساب هدف | ۳۰ حساب واجد شرایط |
| هفته ۲ تا ۴ | ۲۰ مصاحبه مسئله و ۱۰ audit offer | ۵ جلسه data-readiness |
| هفته ۳ تا ۶ | فروش diagnostic با fee ثابت | ۲ diagnostic پولی |
| هفته ۵ تا ۸ | تبدیل diagnostic به live holdout | ۱ پایلوت live |
| هفته ۹ تا ۱۲ | readout، case study و subscription offer | ۱ قرارداد یا LOI |

پیام اصلی فروش:

> «ما نرخ تبدیل را پیش‌بینی نمی‌کنیم؛ نشان می‌دهیم کدام بخش از سود واقعاً به‌خاطر مشوق ایجاد شده و کمپین بعدی با چه policy سود بیشتری می‌سازد.»

## North Star و KPIها

### North Star مشتری

```text
Verified Incremental Contribution Profit
```

### KPIهای محصول

- incentive cost per incremental conversion.
- incremental contribution profit و lower confidence bound.
- revenue/margin guardrail pass rate.
- share تصمیم‌های no-action یا low-cost که live holdout تایید کرده است.
- policy adoption rate و override rate.
- time from data-ready to decision-ready.
- درصد آزمایش‌های trusted در برابر invalid/inconclusive.
- data contract pass rate و freshness SLA.

### KPIهای کسب‌وکار MarginLift

- paid diagnostic conversion.
- diagnostic-to-live-pilot conversion.
- live-pilot-to-subscription conversion.
- verified value / annual contract value؛ هدف اولیه حداقل ۳ برابر.
- زمان رسیدن به اولین ارزش تاییدشده.
- gross retention مشتریان و تعداد policy cycle در ماه.

## ریسک‌ها و کنترل‌ها

| ریسک | اثر | کنترل |
| --- | --- | --- |
| نبود کنترل‌گروه | ادعای causal نامعتبر | برچسب observational و طراحی live holdout |
| نمونه کم | تصمیم ناپایدار | MDE/power gate و تجمیع دوره‌ای |
| کمپین‌های هم‌زمان | contamination | exclusion و exposure log |
| coupon leakage | اثر کمتر از assignment | compliance tracking و ITT/LATE analysis |
| gross margin ناقص | سود اشتباه | finance-owned metric contract |
| data leakage | مدل غیرواقعی | temporal split و point-in-time test |
| drift فصلی | افت policy value | calibration/drift monitoring و retraining trigger |
| داده شخصی | ریسک اعتماد و حقوقی | hashing، minimization، RBAC، retention و audit |
| ساخت بیش‌ازحد زودهنگام | کندی رسیدن به پایلوت | connector و feature فقط با design partner |

## چیزهایی که فعلاً نباید ساخته شوند

- chatbot یا تولید متن AI به‌عنوان feature اصلی.
- microservice و streaming پیچیده پیش از اثبات batch use case.
- feature store مستقل پیش از چند pipeline مشترک.
- ده‌ها connector قبل از اولین design partner.
- مدل deep learning قبل از baseline و uplift validation.
- dashboardهای بیشتر بدون تصمیم و owner.
- real-time decisioning وقتی اجرای کمپین روزانه/هفتگی است.

## تصمیم پیشنهادی

اولویت بعدی نباید lead form یا بازطراحی بصری جدید باشد. محصول به‌اندازه کافی برای گفت‌وگوی فروش زیباست. بالاترین بازده اکنون از این ترتیب می‌آید:

۱. اصلاح truth layer و اعداد مالی.

۲. ساخت experiment data model و health checks.

۳. بستن یک diagnostic پولی با داده واقعی.

۴. اجرای live holdout.

۵. ساخت uplift model فقط پس از دسترسی به row-level assignment/exposure/outcome.

این ترتیب هم شانس مسابقه را بالا می‌برد، هم ریسک فروش ادعای نادرست را کم می‌کند و هم برای سرمایه‌گذار یک مسیر روشن از demo به evidence می‌سازد.

## منابع رسمی به‌روزرسانی استاندارد

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework): چارچوب Govern، Map، Measure و Manage.
- [NIST Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence): پروفایل مکمل AI RMF؛ برای featureهای مولد آینده.
- [OWASP Top 10:2025](https://owasp.org/Top10/2025/): کنترل‌های امنیت برنامه و supply-chain.
- [OWASP Machine Learning Security Top Ten](https://owasp.org/www-project-machine-learning-security-top-10/): ریسک‌های poisoning، model abuse و زنجیره ML.
- [Microsoft Experimentation Platform](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/): تحلیل و آزمایش قابل‌اعتماد در مقیاس.
- [Microsoft SRM Taxonomy](https://www.microsoft.com/en-us/research/publication/diagnosing-sample-ratio-mismatch-in-online-controlled-experiments-a-taxonomy-and-rules-of-thumb-for-practitioners/): تشخیص و پیشگیری Sample Ratio Mismatch.
- [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993): مستندسازی intended use، محدودیت و عملکرد مدل.
- [Datasheets for Datasets](https://arxiv.org/abs/1803.09010): منشأ، ترکیب، محدودیت و نگهداری دیتاست.

