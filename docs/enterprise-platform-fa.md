# پلتفرم سازمانی MarginLift — مستند معماری و عملیات

این سند تمام قابلیت‌های سازمانی ساخته‌شده روی MarginLift را پوشش می‌دهد: از Shadow Mode و UI مدیریتی تا موتور ارکستراسیون، بیلینگ، و کل چرخهٔ MLOps (مدل واقعی، registry، بازآموزی، و حلقهٔ بازخورد دادهٔ واقعی). سایت زنده: `https://marginlift.ir`.

> **وضعیت:** همهٔ موارد این سند روی پروداکشن مستقر و تأیید شده‌اند.

---

## ۱. معماری کلی (Hybrid)

```
Cloudflare → Caddy (443) → Node.js app (:3000) → PostgreSQL
                                   │
                                   └── (HTTP داخلی) → Python/FastAPI scorer (:8100)
                                                         └── مدل uplift + registry (volume)
```

- **Node.js** (`src/`): احراز هویت (session + JWT)، مسیریابی، rate-limit، لاگ‌گیری/audit، و تمام state ماندگار (PostgreSQL). یک monolith با `http.createServer` خام (بدون Express).
- **Python/FastAPI** (`api/`): فقط اسکورینگ ML و بازآموزی مدل. **stateless**؛ هیچ پورت عمومی ندارد (فقط شبکهٔ داخلی Docker).
- **تصمیم معماری:** endpointهای عمومیِ سازمانی در Node هستند و scorer پایتون را صدا می‌زنند. این «Hybrid» عمداً انتخاب شد تا JWT/TLS/audit یک‌جا در Node بمانند.

فقط پورت‌های `22`، `80`، `443` عمومی‌اند. PostgreSQL، scorer و پورت `3000` فقط داخلی‌اند.

---

## ۲. احراز هویت (دو مسیره)

| نوع | مصرف | پیاده‌سازی |
|---|---|---|
| **Session (کوکی)** | داشبورد داخلی | نشست‌های موجود |
| **JWT Bearer** | یکپارچه‌سازی CRM سازمانی | HMAC-SHA256، `signJwt`/`verifyJwt` در `src/auth.js` |

**نکتهٔ حیاتی:** یک gate سراسری (`requireSession`) قبل از اکثر مسیرهای `/api` اجرا می‌شود. مسیرهای مبتنی بر JWT باید در allowlistِ `jwtAuthenticatedApiPaths` (در `handleApi`) باشند تا این gate آن‌ها را برای فراخوان بدون کوکی مسدود نکند. (این باگ در طول کار پیدا و رفع شد — قبلاً کل مسیر CRM با JWT کار نمی‌کرد.)

توکن JWT باید claim به‌نام `org` (شناسهٔ سازمان) داشته باشد.

---

## ۳. API سازمانی (عمومی، در Node)

### فاز ۱ — Shadow Mode

**`POST /api/v1/evaluate/shadow`** (JWT) — ارزیابی خاموش کمپین بدون اجرای واقعی.
```json
// درخواست
{ "campaign_id": "c1", "audience": [ { "customer_id_hash": "...", "recency_days": 5, "frequency": 8, "monetary_value": 3000000, "incentive_cost": 40000, "channel_cost": 2000 } ] }
// پاسخ: scored_count, waste_count, waste_budget, decisions[] (segment, action, uplift, is_waste)
```
تصمیم‌ها در `shadowLogs` ذخیره می‌شوند. گارد PII روی `customer_id_hash` اعمال می‌شود.

**`GET /api/v1/shadow/waste-report`** (JWT یا session) — تجمیع «هدررفت بودجه» روی Sure Things و Sleeping Dogs.

### فاز ۳ — ارکستراسیون و Kill-Switch

**`POST /api/v1/orchestrate/trigger`** (JWT) — تبدیل اسکور به فرمان صریح **SEND / DROP** برای هر مشتری:
- Persuadable → `SEND` + سطح مشوق (`strong_incentive` / `small_discount` / `low_cost_message` بر اساس شدت uplift)
- Sure Thing / Sleeping Dog / Lost Cause → `DROP`

**Circuit Breaker (قفل‌شونده):** اگر `causal_drift` بالای آستانه (`ORCHESTRATION_DRIFT_THRESHOLD`، پیش‌فرض ۰.۲) باشد، **همه** به `DROP` تبدیل و یک قفل per-org فعال می‌شود که تا reset باز می‌ماند. drift اگر در بدنه نباشد، از دادهٔ Outcome خودِ سازمان محاسبه می‌شود (خودمختار). خروجی شامل `saved_budget` و `net_incremental_profit` است. تأخیر < ۵۰ms.

**`POST /api/v1/orchestrate/reset`** (owner session) — باز کردن قفل circuit breaker.

### فاز ۴ — بیلینگ

**`GET /api/v1/billing/monthly-report`** (owner session) — بیانیهٔ مالی ماهانه:
- بودجهٔ ذخیره‌شدهٔ محقق‌شده (از DROPهای ارکستراسیون)، درآمد افزایشی خالص (از SENDها)
- **سهم درآمد MarginLift = ۲۰٪** بودجهٔ ذخیره‌شده (`REVENUE_SHARE_RATE`)
- هدررفت بالقوهٔ shadow (فقط اطلاعاتی، بیلینگ نمی‌شود)

گزارش ماهانه توسط `scripts/generate-monthly-report.js` + تایمر (اول هر ماه) در `db.monthlyReports` ذخیره می‌شود.

### فاز ۵ — گارد PII

میان‌افزار `src/pii-guard.js`: اگر `customer_id_hash` شبیه ایمیل یا شمارهٔ خام باشد، درخواست با `400 PII_DETECTED` رد می‌شود (به‌جای هش‌کردن خاموش که کلیدهای join کلاینت را خراب می‌کند). روی shadow، orchestrate و outcome-report اعمال می‌شود.

### فاز ۶ — مانیتور Causal Drift

`src/drift-monitor.js`: drift را از تحلیل Outcome موجود (پیش‌بینی‌شده در برابر مشاهده‌شدهٔ سود افزایشی) به‌صورت انحراف نسبی محاسبه می‌کند و به circuit breaker فاز ۳ تغذیه می‌دهد — halt خودکار هنگام افت مدل.

### حلقهٔ بازخورد دادهٔ واقعی

**`POST /api/v1/outcomes/report`** (JWT) — کلاینت نتایج برچسب‌خورده را گزارش می‌دهد:
```json
{ "campaign_id": "c1", "results": [ { "customer_id_hash": "...", "treated": true, "converted": false, "features": { "recency_days": 10, "frequency": 3, "monetary_value": 800000 } } ] }
```
در `db.trainingExamples` ذخیره می‌شود (گارد PII، سقف ۲۰۰k). فقط `{features, w, y}` به trainer صادر می‌شود — **شناسهٔ مشتری هیچ‌وقت خارج نمی‌شود**.

### مشاهده‌پذیری MLOps

**`GET /api/v1/mlops/model-registry`** (owner session) — نسخه‌های مدل و اشاره‌گر production (پروکسی به scorer).

---

## ۴. چرخهٔ ML (قدم صفر تا حلقهٔ کامل)

### مدل واقعی (جایگزین هش)
- `api/models/uplift_model.py`: **S-Learner** (یک `HistGradientBoostingClassifier` با indicator درمان به‌عنوان فیچر) که هر دو احتمال arm را می‌دهد. (S-Learner نه T-Learner: هم قوی‌تر برای uplift کوچک، هم هر دو احتمال را می‌دهد که `classify_segment` لازم دارد.)
- ۸ فیچر: recency_days, frequency, monetary_value, avg_order_gap_days, discount_usage_rate, channel_engagement_score, tenure_days, gross_margin_rate.
- `api/train_uplift.py`: آموزش + **اعتبارسنجی** روی DGP سنتتیک مستند؛ اگر مدل واقعاً uplift را رتبه‌بندی نکند (corr>۰.۴، Qini>۰، دهک بالا>پایین)، **build شکست می‌خورد**. آخرین build: corr=۰.۹۲، دهک بالا +۲۰.۵٪ در برابر پایین −۲.۹٪.
- در `uplift_evaluator.py`: بارگذاری مدل production از registry → seed → هیوریستیک (fallback سه‌مرحله‌ای). `/health` مبدأ فعال را گزارش می‌دهد.

### Registry نسخه‌بندی‌شده
`api/mlops/registry.py` روی volume دائمی `model_registry:/models`: هر نسخه = `model.joblib` + `metrics.json`؛ ایندکس با اشاره‌گر `production`. نسخه‌های قدیمی **archive** می‌شوند، حذف نمی‌شوند.

### حلقهٔ بازآموزی (champion/challenger)
`api/mlops/retrain.py`: challenger آموزش می‌دهد، روی holdout مشترک با champion مقایسه می‌کند، و **فقط اگر** کف بازهٔ بوت‌استرپِ `(Qini_challenger − Qini_champion)` مثبت باشد promote می‌کند؛ وگرنه champion نگه‌داشته می‌شود. selftest در build تضمین می‌کند مدل هیچ‌وقت روی خودش promote نمی‌شود.

### ترجیح دادهٔ واقعی
`retrain.py` اگر ≥ `MARGINLIFT_MIN_REAL_ROWS` (۲۰۰۰) ردیف واقعیِ قابل‌استفاده (هر دو arm + هر دو کلاس) موجود باشد، روی دادهٔ واقعی آموزش می‌بیند؛ وگرنه DGP سنتتیک. `data_source` در metrics ثبت می‌شود. `ops/vm/retrain.sh` اول export (کانتینر app) بعد retrain (scorer) را اجرا می‌کند و فقط در صورت تغییر production، scorer را restart می‌کند.

**وضعیت صادقانه:** هنوز دادهٔ واقعی مشتری وجود ندارد، پس حلقه روی synthetic می‌چرخد تا وقتی CRMها outcome گزارش دهند. قدم بعدی یک تصمیم محصولی است (اجرای پایلوت با holdout تصادفی)، نه کار مهندسی.

---

## ۵. متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `JWT_SECRET` | — (الزامی در prod) | امضای JWT سازمانی؛ حداقل ۳۲ کاراکتر |
| `SHADOW_SCORER_URL` | `http://shadow-scorer:8100` | آدرس scorer داخلی |
| `ORCHESTRATION_DRIFT_THRESHOLD` | `0.2` | آستانهٔ trip شدن circuit breaker |
| `REVENUE_SHARE_RATE` | `0.2` | سهم درآمد از بودجهٔ ذخیره‌شده |
| `MARGINLIFT_MODEL_REGISTRY` | `/models` | مسیر registry (scorer) |
| `MARGINLIFT_TRAINING_DATA` | `/training/examples.jsonl` | دادهٔ آموزش واقعی (scorer) |
| `MARGINLIFT_MIN_REAL_ROWS` | `2000` | حداقل ردیف برای سوییچ به دادهٔ واقعی |
| `MARGINLIFT_RETRAIN_N` | `60000` | اندازهٔ نمونهٔ synthetic |
| `MARGINLIFT_PROMOTION_MARGIN` | `0.0` | حاشیهٔ لازم برای promote |
| `TRAINING_DATA_DIR` | `/training` | مسیر export (app) |

Volumeها: `postgres_data`, `artifact_data`, `caddy_data`, `caddy_config`, `model_registry`, `training_data`.

> **GOTCHA مالکیت volume:** کانتینر app به‌عنوان کاربر `node` اجرا می‌شود؛ volumeی `/training` باید node-owned باشد. Dockerfile اکنون `/training` را chown می‌کند، ولی یک volume از قبل‌ساخته‌شدهٔ root-owned باید یک‌بار روی هاست اصلاح شود:
> ```bash
> docker run --rm -v marginlift_training_data:/t alpine chown -R 1000:1000 /t
> ```

---

## ۶. استقرار و عملیات

**GitHub Actions در سطح اکانت `mohammadbayati` غیرفعال است** (خطای «Actions has been disabled for this user» — روی همهٔ repoها؛ مشکل بیلینگ نیست، نیازمند پشتیبانی GitHub). پس دیپلوی خودکار کار نمی‌کند.

**دیپلوی دستی** با `ops/push-to-production.sh` (تست → tar → scp → `ops/vm/deploy.sh` → verify). از PowerShell با تابع `deploy-marginlift` (در `$PROFILE`).

سرور: Hetzner، `root@91.107.190.221`، کلید `~/.ssh/marginlift_deploy`، اپ در `/opt/marginlift`.

**تایمرهای systemd:**
| تایمر | زمان‌بندی | کار |
|---|---|---|
| `marginlift-backup` | روزانه ۰۲:۲۰ UTC | بکاپ Postgres + artifacts |
| `marginlift-report` | اول هر ماه ۰۳:۱۰ UTC | گزارش ماهانه |
| `marginlift-retrain` | دوشنبه‌ها ۰۴:۳۰ UTC | export + بازآموزی |

---

## ۷. نقشهٔ فایل‌ها

**Python (`api/`)**: `main.py`، `train_uplift.py`، `models/{uplift_model,uplift_evaluator}.py`، `mlops/{registry,training,retrain,selftest}.py`، `routes/{shadow_mode,orchestration}.py`.

**Node (`src/`)**: `auth.js`، `config.js`، `shadow-evaluator.js`، `orchestrator.js`، `drift-monitor.js`، `pii-guard.js`، `billing-report.js`، `training-store.js`، `model-registry.js`، `server.js`.

**اسکریپت‌ها**: `scripts/{generate-monthly-report,export-training-data}.js`.

**عملیات**: `ops/push-to-production.sh`، `ops/vm/{deploy,retrain,generate-report,install-*-timer}.sh`، `ops/systemd/*`.

**تست‌ها** (`node tests/*.test.js`، بدون فریم‌ورک): جدید در این نشست — `auth-jwt`, `shadow-evaluator`, `orchestrator`, `drift-monitor`, `pii-guard`, `billing-report`, `training-store`؛ + بررسی‌های زمان‌build پایتون (`train_uplift`, `mlops.selftest`).

---

## ۸. کامیت‌های این نشست

`80995ee` Shadow Mode + Command Center · `9264b52` رفع import پایتون · `fbf1353` اسکریپت دیپلوی دستی · `2ce5fb1` ارکستراسیون (فاز ۳) · `9aacba7` رفع gate نشست/JWT · `7c0dbfa` فازهای ۴-۶ · `ec46bab` مدل uplift واقعی · `e1952a1` registry + بازآموزی · `6cf72a7` حلقهٔ بازخورد دادهٔ واقعی · `899b673` رفع مالکیت volume.
