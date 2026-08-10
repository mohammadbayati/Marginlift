const pptxgen = require('pptxgenjs');
const path = require('path');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'MarginLift';
pptx.company = 'MarginLift';
pptx.subject = 'پیشنهاد همکاری MarginLift و چارگون';
pptx.title = 'از داده سازمانی تا تصمیم قابل‌اندازه‌گیری';
pptx.lang = 'fa-IR';
pptx.theme = {
  headFontFace: 'Vazirmatn',
  bodyFontFace: 'Vazirmatn',
  lang: 'fa-IR',
};

const OUT = path.join(__dirname, 'MarginLift-x-Chargoon-Pitch-Deck-fa.pptx');
const LOGO = path.join(__dirname, 'assets', 'logo', 'Fa', 'logo-02.png');
const SCREEN = path.join(__dirname, '..', '..', 'qa-retention-analysis-desktop.png');

const C = {
  ink: '111A16',
  black: '080B09',
  white: 'FFFFFF',
  paper: 'F6F8F5',
  mist: 'EAF0EC',
  line: 'D9E1DC',
  muted: '627068',
  green: '046A38',
  mid: '43B02A',
  lime: 'C4D600',
  soft: 'EAF6EE',
  amber: 'B36B00',
  red: 'B3312C',
  blue: '246BCE',
};

const S = pptx.ShapeType;
const W = 13.333;
const H = 7.5;

function addBg(slide, color = C.paper) {
  slide.background = { color };
}

function tx(slide, text, x, y, w, h, opts = {}) {
  const o = {
    x, y, w, h,
    fontFace: opts.fontFace || 'Vazirmatn',
    fontSize: opts.fontSize || 18,
    color: opts.color || C.ink,
    bold: opts.bold || false,
    align: opts.align || 'right',
    valign: opts.valign || 'mid',
    margin: opts.margin === undefined ? 0 : opts.margin,
    breakLine: false,
    fit: 'shrink',
    rtlMode: opts.rtlMode === undefined ? true : opts.rtlMode,
    isTextBox: true,
    ...opts,
  };
  slide.addText(text, o);
}

function line(slide, x, y, w, color = C.line, width = 1) {
  slide.addShape(S.line, { x, y, w, h: 0, line: { color, width } });
}

function pill(slide, text, x, y, w, fill = C.soft, color = C.green) {
  slide.addShape(S.roundRect, { x, y, w, h: 0.36, rectRadius: 0.08, fill: { color: fill }, line: { color: fill } });
  tx(slide, text, x + 0.1, y, w - 0.2, 0.36, { fontSize: 10.5, color, bold: true, align: 'center' });
}

function header(slide, kicker, title, subtitle = '') {
  tx(slide, kicker, 7.0, 0.42, 5.55, 0.28, { fontSize: 10.5, color: C.green, bold: true });
  tx(slide, title, 1.0, 0.78, 11.55, 0.62, { fontSize: 29, bold: true });
  if (subtitle) tx(slide, subtitle, 1.0, 1.42, 11.55, 0.45, { fontSize: 13, color: C.muted });
  slide.addShape(S.rect, { x: 12.68, y: 0.38, w: 0.08, h: 1.05, fill: { color: C.lime }, line: { color: C.lime } });
}

function footer(slide, n) {
  line(slide, 0.75, 7.14, 11.85, C.line, 0.7);
  tx(slide, 'پیشنهاد همکاری اولیه | محرمانه و غیرالزام‌آور', 7.3, 7.18, 5.25, 0.18, { fontSize: 7.5, color: C.muted });
  tx(slide, String(n).padStart(2, '0'), 0.78, 7.18, 0.4, 0.18, { fontSize: 8, color: C.muted, align: 'left', rtlMode: false });
}

function iconCircle(slide, text, x, y, fill = C.soft, color = C.green) {
  slide.addShape(S.ellipse, { x, y, w: 0.46, h: 0.46, fill: { color: fill }, line: { color: fill } });
  tx(slide, text, x, y + 0.005, 0.46, 0.44, { fontSize: 12, color, bold: true, align: 'center' });
}

// 1 — Cover
{
  const s = pptx.addSlide();
  addBg(s, C.black);
  s.addImage({ path: LOGO, x: 11.75, y: 0.48, w: 0.86, h: 0.32, transparency: 0 });
  tx(s, 'چارگون', 10.40, 0.73, 2.18, 0.36, { fontSize: 17, color: C.white, bold: true });
  tx(s, 'MARGINLIFT', 0.72, 0.59, 2.2, 0.32, { fontSize: 14, color: C.white, bold: true, align: 'left', rtlMode: false });
  tx(s, 'پیشنهاد همکاری محصولی', 8.75, 1.55, 3.8, 0.35, { fontSize: 12, color: C.lime, bold: true });
  tx(s, 'از داده سازمانی\nتا تصمیم قابل‌اندازه‌گیری', 4.55, 1.95, 8.0, 1.72, { fontSize: 38, color: C.white, bold: true, breakLine: true, valign: 'top' });
  tx(s, 'لایه تصمیم علّی برای نگهداشت مشتری و تخصیص هوشمند مشوق؛ مکمل محصولات هوش مصنوعی، هوش تجاری و تعامل‌پذیری چارگون', 5.0, 3.86, 7.55, 0.88, { fontSize: 16.5, color: 'DDE5E0', breakLine: true, valign: 'top' });
  pill(s, 'سنجش نتیجه', 9.75, 5.12, 2.8, '163226', C.lime);
  pill(s, 'سیاست مشوق', 6.85, 5.12, 2.65, '163226', C.lime);
  pill(s, 'نگهداشت مشتری', 3.95, 5.12, 2.65, '163226', C.lime);
  tx(s, 'خطاب به جناب آقای شاهین طبری، بنیان‌گذار و رئیس هیئت‌مدیره چارگون', 5.2, 6.18, 7.35, 0.42, { fontSize: 12.5, color: C.white, bold: true });
  tx(s, 'مرداد ۱۴۰۵  |  marginlift.ir', 0.72, 6.22, 3.5, 0.35, { fontSize: 10, color: 'AEB9B2', align: 'left' });
  s.addShape(S.ellipse, { x: 0.72, y: 1.52, w: 2.72, h: 2.72, fill: { color: C.black, transparency: 100 }, line: { color: C.green, width: 2 } });
  s.addShape(S.ellipse, { x: 1.20, y: 2.00, w: 1.76, h: 1.76, fill: { color: C.green, transparency: 15 }, line: { color: C.green } });
  s.addShape(S.ellipse, { x: 1.72, y: 2.52, w: 0.72, h: 0.72, fill: { color: C.lime }, line: { color: C.lime } });
  line(s, 2.42, 2.88, 1.55, C.lime, 2);
}

// 2 — Strategic alignment
{
  const s = pptx.addSlide(); addBg(s); header(s, 'چرا این گفتگو منطقی است؟', 'چارگون زیرساخت این همکاری را از قبل ساخته است', 'MarginLift روی یک جهت‌گیری موجود سوار می‌شود، نه روی یک فرض تازه.');
  const items = [
    ['۰۱', 'آسا', 'هوش مصنوعی سازمانی با استقرار درون‌سازمانی و معماری ماژولار'],
    ['۰۲', 'BI', 'تبدیل داده‌های عملیاتی به بینش مدیریتی و تصمیم‌سازی'],
    ['۰۳', 'API', 'تعامل‌پذیری مستند برای اتصال سامانه‌ها و حذف جزیره‌های داده'],
    ['۰۴', 'اکوسیستم', 'چشم‌انداز همکاری با محصولات مکمل و ایجاد ارزش جدید برای مشتریان'],
  ];
  items.forEach((it, i) => {
    const x = 0.78 + i * 3.08;
    s.addShape(S.rect, { x, y: 2.15, w: 2.78, h: 2.55, fill: { color: i === 3 ? C.ink : C.white }, line: { color: i === 3 ? C.ink : C.line, width: 1 } });
    tx(s, it[0], x + 0.18, 2.34, 0.55, 0.35, { fontSize: 12, color: i === 3 ? C.lime : C.green, bold: true, align: 'left', rtlMode: false });
    tx(s, it[1], x + 0.22, 2.82, 2.34, 0.42, { fontSize: 21, color: i === 3 ? C.white : C.ink, bold: true });
    tx(s, it[2], x + 0.22, 3.42, 2.34, 0.88, { fontSize: 12.5, color: i === 3 ? 'DCE6E0' : C.muted, valign: 'top', breakLine: true });
  });
  s.addShape(S.rect, { x: 0.78, y: 5.10, w: 12.0, h: 1.12, fill: { color: C.soft }, line: { color: C.soft } });
  tx(s, 'فرصت مشترک', 10.75, 5.31, 1.65, 0.26, { fontSize: 10.5, color: C.green, bold: true });
  tx(s, 'افزودن یک موتور تخصصی برای تصمیم‌های نگهداشت و مشوق؛ با استقرار امن، اتصال API و سنجش نتیجه واقعی.', 1.13, 5.58, 11.27, 0.38, { fontSize: 17.2, bold: true });
  footer(s, 2);
}

// 3 — White space
{
  const s = pptx.addSlide(); addBg(s); header(s, 'فضای مکمل', 'بین «بینش» و «اقدام» یک تصمیم اقتصادی وجود دارد', 'هدف، توسعه قابلیت‌های چارگون است؛ نه تکرار BI یا جایگزینی سامانه‌های موجود.');
  const steps = [
    ['داده', 'چه اتفاقی افتاد؟'], ['بینش', 'چرا رخ داد؟'], ['پیش‌بینی', 'چه کسی در معرض ریسک است؟'], ['تصمیم', 'برای چه کسی، چه اقدامی؟'], ['اثبات', 'آیا اقدام واقعاً سود ساخت؟']
  ];
  steps.forEach((it, i) => {
    const x = 0.72 + i * 2.47;
    const active = i >= 3;
    s.addShape(S.roundRect, { x, y: 2.30, w: 2.10, h: 1.52, rectRadius: 0.06, fill: { color: active ? C.ink : C.white }, line: { color: active ? C.ink : C.line, width: 1.2 } });
    tx(s, String(i + 1).padStart(2, '0'), x + 0.17, 2.48, 0.42, 0.25, { fontSize: 10, color: active ? C.lime : C.green, bold: true, align: 'left', rtlMode: false });
    tx(s, it[0], x + 0.18, 2.82, 1.73, 0.34, { fontSize: 18, color: active ? C.white : C.ink, bold: true });
    tx(s, it[1], x + 0.18, 3.20, 1.73, 0.42, { fontSize: 10.7, color: active ? 'DCE6E0' : C.muted, valign: 'top' });
    if (i < steps.length - 1) {
      s.addShape(S.chevron, { x: x + 2.13, y: 2.82, w: 0.26, h: 0.46, fill: { color: active ? C.lime : C.line }, line: { color: active ? C.lime : C.line } });
    }
  });
  s.addShape(S.rect, { x: 0.72, y: 4.35, w: 5.90, h: 1.52, fill: { color: C.white }, line: { color: C.line } });
  tx(s, 'MarginLift چه نیست؟', 3.85, 4.58, 2.38, 0.32, { fontSize: 14, color: C.red, bold: true });
  tx(s, 'CRM نیست، ابزار ارسال کمپین نیست، داشبورد عمومی نیست و جایگزین آسا یا BI نمی‌شود.', 1.03, 4.98, 5.20, 0.56, { fontSize: 13, bold: true, valign: 'top' });
  s.addShape(S.rect, { x: 6.88, y: 4.35, w: 5.90, h: 1.52, fill: { color: C.soft }, line: { color: C.soft } });
  tx(s, 'MarginLift چه اضافه می‌کند؟', 9.55, 4.58, 2.83, 0.32, { fontSize: 14, color: C.green, bold: true });
  tx(s, 'سیاست اقدام مشتری‌محور، کنترل هزینه مشوق و حلقه اندازه‌گیری اثر افزایشی.', 7.20, 4.98, 5.18, 0.56, { fontSize: 13, bold: true, valign: 'top' });
  footer(s, 3);
}

// 4 — Core decision
{
  const s = pptx.addSlide(); addBg(s, C.ink);
  tx(s, 'اصل تصمیم', 10.5, 0.62, 2.0, 0.25, { fontSize: 11, color: C.lime, bold: true });
  tx(s, 'ریسک بالا، مجوز تخفیف نیست.', 4.25, 1.05, 8.25, 0.75, { fontSize: 34, color: C.white, bold: true });
  tx(s, 'مدل باید بین «احتمال ریزش» و «اثر واقعی اقدام» تفاوت بگذارد.', 5.65, 1.91, 6.85, 0.42, { fontSize: 15, color: 'D9E3DD' });
  const q = [
    ['بدون مشوق می‌ماند', 'هزینه نکنید؛ تجربه را حفظ کنید.', C.green],
    ['با اقدام درست برمی‌گردد', 'اقدام و مشوق را دقیق هدف‌گذاری کنید.', C.lime],
    ['حتی با مشوق برنمی‌گردد', 'هزینه را متوقف و علت را بررسی کنید.', C.amber],
    ['اقدام ممکن است نتیجه را بدتر کند', 'تماس یا مشوق را محدود کنید.', C.red],
  ];
  q.forEach((it, i) => {
    const x = i % 2 === 0 ? 0.90 : 6.88;
    const y = i < 2 ? 2.75 : 4.65;
    s.addShape(S.rect, { x, y, w: 5.55, h: 1.50, fill: { color: '17221C' }, line: { color: it[2], width: 1.5 } });
    s.addShape(S.ellipse, { x: x + 4.75, y: y + 0.33, w: 0.46, h: 0.46, fill: { color: it[2] }, line: { color: it[2] } });
    tx(s, it[0], x + 0.30, y + 0.24, 4.20, 0.38, { fontSize: 17, color: C.white, bold: true });
    tx(s, it[1], x + 0.30, y + 0.79, 4.70, 0.42, { fontSize: 12.2, color: 'C6D0CA' });
  });
  tx(s, 'نتیجه تجاری: پیام کمتر، هزینه کمتر، اثر قابل‌دفاع‌تر.', 0.90, 6.55, 11.60, 0.42, { fontSize: 17, color: C.lime, bold: true, align: 'center' });
}

// 5 — Product engine
{
  const s = pptx.addSlide(); addBg(s); header(s, 'موتور محصول', 'از داده خام تا تصمیمی که قابل ممیزی است', 'هر مرحله یک خروجی روشن و یک سطح شواهد مشخص دارد.');
  const blocks = [
    ['۱', 'ورودی امن', 'شناسه ناشناس، رویداد، تراکنش، هزینه، outcome'],
    ['۲', 'آمادگی داده', 'کنترل، کیفیت نمونه، پنجره نتیجه و حاشیه سود'],
    ['۳', 'ریسک و زمان', 'احتمال ریزش و زمان تقریبی خرید بعدی'],
    ['۴', 'اثر افزایشی', 'چه کسی فقط در صورت اقدام تغییر رفتار می‌دهد؟'],
    ['۵', 'سیاست اقدام', 'اقدام بعدی، سقف هزینه و موارد «عدم اقدام»'],
    ['۶', 'حلقه نتیجه', 'مقایسه پیش‌بینی با نتیجه واقعی و تصمیم توسعه یا توقف'],
  ];
  blocks.forEach((b, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.76 + col * 4.16;
    const y = 2.05 + row * 2.02;
    const dark = i === 4 || i === 5;
    s.addShape(S.rect, { x, y, w: 3.72, h: 1.57, fill: { color: dark ? C.ink : C.white }, line: { color: dark ? C.ink : C.line } });
    iconCircle(s, b[0], x + 2.98, y + 0.20, dark ? C.lime : C.soft, dark ? C.ink : C.green);
    tx(s, b[1], x + 0.22, y + 0.18, 2.52, 0.34, { fontSize: 16, color: dark ? C.white : C.ink, bold: true });
    tx(s, b[2], x + 0.22, y + 0.70, 3.23, 0.62, { fontSize: 11.6, color: dark ? 'D5DFD9' : C.muted, valign: 'top' });
  });
  s.addShape(S.rect, { x: 0.76, y: 6.16, w: 12.0, h: 0.55, fill: { color: C.soft }, line: { color: C.soft } });
  tx(s, 'سطح شواهد: برآورد تاریخی  ←  برآورد پایلوت  ←  اثر افزایشی تأییدشده', 1.0, 6.24, 11.53, 0.30, { fontSize: 13, color: C.green, bold: true, align: 'center' });
  footer(s, 5);
}

// 6 — Product proof
{
  const s = pptx.addSlide(); addBg(s); header(s, 'دموی قابل ارائه', 'محصول فقط مدل نیست؛ فضای تصمیم است', 'نسخه نمایشی، مسیر داده، ریسک، اقدام، گروه کنترل و گزارش مدیریتی را در یک جریان واحد نشان می‌دهد.');
  s.addShape(S.roundRect, { x: 0.74, y: 2.02, w: 8.28, h: 4.40, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.line, width: 1 } });
  s.addImage({ path: SCREEN, x: 0.93, y: 2.24, w: 7.90, h: 3.95 });
  const callouts = [
    ['برداشت اجرایی', 'ترجمه مدل به زبان مدیر'],
    ['صف اقدام', 'چه کسی، چرا، با چه محدودیتی'],
    ['اتاق شواهد', 'سطح شواهد و ریسک تصمیم'],
  ];
  callouts.forEach((c, i) => {
    const y = 2.08 + i * 1.35;
    s.addShape(S.rect, { x: 9.34, y, w: 3.42, h: 1.02, fill: { color: i === 1 ? C.ink : C.white }, line: { color: i === 1 ? C.ink : C.line } });
    tx(s, c[0], 9.55, y + 0.15, 2.98, 0.28, { fontSize: 14, color: i === 1 ? C.white : C.ink, bold: true });
    tx(s, c[1], 9.55, y + 0.51, 2.98, 0.28, { fontSize: 10.8, color: i === 1 ? 'D7E0DB' : C.muted });
  });
  s.addShape(S.rect, { x: 9.34, y: 6.13, w: 3.42, h: 0.38, fill: { color: C.soft }, line: { color: C.soft } });
  tx(s, 'دمو: marginlift.ir', 9.55, 6.17, 2.98, 0.22, { fontSize: 10.5, color: C.green, bold: true, align: 'center' });
  footer(s, 6);
}

// 7 — Value for Chargoon
{
  const s = pptx.addSlide(); addBg(s); header(s, 'ارزش برای چارگون', 'یک قابلیت تخصصی؛ چهار اهرم رشد', 'هم‌افزایی باید هم محصولی باشد، هم تجاری و هم قابل اثبات.');
  const items = [
    ['تمایز محصولی', 'گسترش روایت «داده به تصمیم» از مشاهده و پیش‌بینی به اقدام و اثبات نتیجه.'],
    ['درآمد مکمل', 'امکان بسته مشترک، عرضه در بازارگاه یا مدل co-sell پس از پایلوت موفق.'],
    ['شاهد مشتری', 'تبدیل یک پروژه تحلیلی به مطالعه موردی با شاخص مالی و تصمیم توسعه یا توقف.'],
    ['عمق اکوسیستم', 'افزودن یک سرویس تخصصی به Open API و آسا، بدون ساخت کامل آن از صفر.'],
  ];
  items.forEach((it, i) => {
    const x = i % 2 === 0 ? 0.80 : 6.85;
    const y = i < 2 ? 2.05 : 4.30;
    s.addShape(S.rect, { x, y, w: 5.67, h: 1.78, fill: { color: i === 0 ? C.ink : C.white }, line: { color: i === 0 ? C.ink : C.line } });
    tx(s, String(i + 1).padStart(2, '0'), x + 0.22, y + 0.23, 0.45, 0.26, { fontSize: 10.5, color: i === 0 ? C.lime : C.green, bold: true, align: 'left', rtlMode: false });
    tx(s, it[0], x + 0.77, y + 0.20, 4.56, 0.38, { fontSize: 18, color: i === 0 ? C.white : C.ink, bold: true });
    tx(s, it[1], x + 0.30, y + 0.82, 5.03, 0.66, { fontSize: 12.2, color: i === 0 ? 'DCE5E0' : C.muted, valign: 'top' });
  });
  footer(s, 7);
}

// 8 — Use cases
{
  const s = pptx.addSlide(); addBg(s); header(s, 'بهترین نقطه شروع', 'مشتریانی با خرید تکرارشونده و هزینه بالای نگهداشت', 'نام صنایع از سبد عمومی مشتریان چارگون استخراج شده؛ انتخاب پایلوت به دسترسی داده و مالک کسب‌وکار وابسته است.');
  const rows = [
    ['خرده‌فروشی و زنجیره‌ای', 'کاهش تخفیف همگانی، افزایش خرید مجدد، کنترل حاشیه سود'],
    ['بانک، پرداخت و فین‌تک', 'بازگشت به تراکنش، فعال‌سازی خدمت و اولویت‌بندی تماس'],
    ['بیمه', 'تمدید، فروش مکمل و پیشگیری از ریزش بیمه‌گذار'],
    ['خدمات اشتراکی و وفاداری', 'بهینه‌سازی پیشنهاد، کانال و زمان اقدام'],
  ];
  rows.forEach((r, i) => {
    const y = 2.00 + i * 1.02;
    s.addShape(S.rect, { x: 0.82, y, w: 11.96, h: 0.82, fill: { color: i % 2 ? C.white : C.soft }, line: { color: i % 2 ? C.line : C.soft } });
    tx(s, r[0], 9.25, y + 0.14, 3.13, 0.30, { fontSize: 15, bold: true });
    tx(s, r[1], 1.13, y + 0.14, 7.76, 0.42, { fontSize: 12.5, color: C.muted });
  });
  s.addShape(S.rect, { x: 0.82, y: 6.18, w: 11.96, h: 0.58, fill: { color: C.ink }, line: { color: C.ink } });
  tx(s, 'معیار انتخاب پایلوت: چرخه خرید قابل‌اندازه‌گیری + هزینه اقدام مشخص + امکان ساخت control/holdout', 1.15, 6.26, 11.28, 0.30, { fontSize: 13.2, color: C.white, bold: true, align: 'center' });
  footer(s, 8);
}

// 9 — Pilot
{
  const s = pptx.addSlide(); addBg(s); header(s, 'پایلوت مشترک', 'اول یک تصمیم را اثبات کنیم؛ بعد آن را محصول کنیم', 'مدت اجرا به چرخه خرید مشتری وابسته است؛ مسیر پیشنهادی بین ۶ تا ۱۰ هفته.');
  const phases = [
    ['فاز ۰', 'آمادگی و قرارداد داده', '۱ تا ۲ هفته', 'Data readiness، baseline، معیار موفقیت و تعریف outcome'],
    ['فاز ۱', 'تحلیل و طراحی policy', '۱ تا ۲ هفته', 'ریسک، زمان خرید، گروه هدف، هزینه مجاز و طراحی holdout'],
    ['فاز ۲', 'اجرای کنترل‌شده', '۲ تا ۶ هفته', 'کمپین کوچک، ثبت exposure و outcome، پایش guardrail'],
    ['فاز ۳', 'گزارش و تصمیم', '۳ روز', 'اثر افزایشی، بازده، علت اختلاف و تصمیم توسعه / بازبینی / توقف'],
  ];
  phases.forEach((p, i) => {
    const x = 0.77 + i * 3.06;
    s.addShape(S.rect, { x, y: 2.08, w: 2.77, h: 3.32, fill: { color: i === 3 ? C.ink : C.white }, line: { color: i === 3 ? C.ink : C.line } });
    pill(s, p[0], x + 1.60, 2.32, 0.85, i === 3 ? '163226' : C.soft, i === 3 ? C.lime : C.green);
    tx(s, p[1], x + 0.25, 2.94, 2.27, 0.70, { fontSize: 17, color: i === 3 ? C.white : C.ink, bold: true, valign: 'top' });
    tx(s, p[2], x + 0.25, 3.73, 2.27, 0.29, { fontSize: 11, color: i === 3 ? C.lime : C.green, bold: true });
    tx(s, p[3], x + 0.25, 4.22, 2.27, 0.78, { fontSize: 11.2, color: i === 3 ? 'D9E2DD' : C.muted, valign: 'top' });
  });
  s.addShape(S.rect, { x: 0.77, y: 5.78, w: 12.0, h: 0.75, fill: { color: 'FFF5E7' }, line: { color: 'F2D5AD' } });
  tx(s, 'قانون اعتماد', 11.05, 5.94, 1.35, 0.26, { fontSize: 10.5, color: C.amber, bold: true });
  tx(s, 'بدون گروه کنترل سالم، هیچ ادعای علّی یا صرفه‌جویی تأییدشده ارائه نمی‌شود.', 1.15, 5.92, 9.55, 0.30, { fontSize: 13, color: C.ink, bold: true });
  footer(s, 9);
}

// 10 — Architecture
{
  const s = pptx.addSlide(); addBg(s); header(s, 'معماری اعتماد', 'داده داخل سازمان می‌ماند؛ تصمیم قابل ممیزی بیرون می‌آید', 'این معماری با منطق On-Premise، Docker و کنترل دسترسی چارگون هم‌راستا طراحی می‌شود.');
  const cols = [
    ['سامانه‌های مشتری', 'تراکنش، رفتار، CRM یا وفاداری'],
    ['لایه اتصال', 'API مستند یا Batch رمزگذاری‌شده'],
    ['موتور مارجین‌لیفت', 'تحلیل، سیاست اقدام، گروه کنترل و نتیجه'],
    ['دیدگاه / آسا / BI', 'نمایش، گردش کار، گزارش و تصمیم مدیر'],
  ];
  cols.forEach((c, i) => {
    const x = 0.68 + i * 3.12;
    const dark = i === 2;
    s.addShape(S.roundRect, { x, y: 2.18, w: 2.66, h: 1.78, rectRadius: 0.08, fill: { color: dark ? C.ink : C.white }, line: { color: dark ? C.ink : C.line, width: 1.2 } });
    tx(s, c[0], x + 0.22, 2.48, 2.22, 0.40, { fontSize: 16, color: dark ? C.white : C.ink, bold: true, align: 'center' });
    tx(s, c[1], x + 0.22, 3.08, 2.22, 0.52, { fontSize: 11.2, color: dark ? 'D9E2DD' : C.muted, align: 'center', valign: 'top' });
    if (i < 3) s.addShape(S.chevron, { x: x + 2.72, y: 2.82, w: 0.28, h: 0.50, fill: { color: C.lime }, line: { color: C.lime } });
  });
  const trust = [
    ['PII حداقلی', 'شناسه Hash شده؛ بدون نیاز به نام و شماره تماس'],
    ['تفکیک شواهد', 'Historical، Pilot و Verified به‌صورت روشن'],
    ['کنترل دسترسی', 'نقش‌ها، ثبت ممیزی و نگهداری نسخه سیاست'],
    ['تصمیم محافظه‌کار', 'عدم اقدام پیش‌فرض در نبود شواهد کافی'],
  ];
  trust.forEach((t, i) => {
    const x = 0.83 + i * 3.00;
    s.addShape(S.rect, { x, y: 4.68, w: 2.70, h: 1.13, fill: { color: C.soft }, line: { color: C.soft } });
    tx(s, t[0], x + 0.18, 4.84, 2.33, 0.28, { fontSize: 13.2, color: C.green, bold: true, align: 'center' });
    tx(s, t[1], x + 0.18, 5.20, 2.33, 0.40, { fontSize: 10.2, color: C.muted, align: 'center', valign: 'top' });
  });
  footer(s, 10);
}

// 11 — Partnership models
{
  const s = pptx.addSlide(); addBg(s); header(s, 'مدل همکاری', 'سه مسیر؛ یک نقطه شروع کم‌ریسک', 'پیشنهاد ما این است که مدل نهایی همکاری را پس از مشاهده نتیجه پایلوت انتخاب کنیم.');
  const cards = [
    ['A', 'پایلوت هم‌برند', 'MarginLift اجرا می‌کند؛ چارگون sponsor محصول و دسترسی به مشتری مناسب را فراهم می‌کند.', 'پیشنهاد شروع'],
    ['B', 'عرضه مشترک / بازارگاه', 'پس از اثبات، بسته تجاری مشترک با سهم درآمد و مسئولیت‌های روشن عرضه می‌شود.', 'پس از اثبات'],
    ['C', 'ماژول اختصاصی', 'در صورت کشش بازار، تجربه کاربری و استقرار با برند و اکوسیستم چارگون یکپارچه می‌شود.', 'مرحله مقیاس'],
  ];
  cards.forEach((c, i) => {
    const x = 0.78 + i * 4.12;
    const best = i === 0;
    s.addShape(S.rect, { x, y: 2.05, w: 3.70, h: 3.62, fill: { color: best ? C.ink : C.white }, line: { color: best ? C.ink : C.line } });
    tx(s, c[0], x + 0.24, 2.28, 0.45, 0.30, { fontSize: 12, color: best ? C.lime : C.green, bold: true, align: 'left', rtlMode: false });
    tx(s, c[1], x + 0.28, 2.82, 3.12, 0.55, { fontSize: 20, color: best ? C.white : C.ink, bold: true });
    tx(s, c[2], x + 0.28, 3.67, 3.12, 1.20, { fontSize: 12.3, color: best ? 'D9E2DD' : C.muted, valign: 'top' });
    pill(s, c[3], x + 1.78, 5.07, 1.62, best ? '163226' : C.soft, best ? C.lime : C.green);
  });
  s.addShape(S.rect, { x: 0.78, y: 6.05, w: 12.0, h: 0.55, fill: { color: C.soft }, line: { color: C.soft } });
  tx(s, 'چارچوب تجاری: ارزیابی داده + پایلوت ثابت + سهم درآمد فقط از نتیجه تأییدشده', 1.05, 6.14, 11.45, 0.28, { fontSize: 12.6, color: C.green, bold: true, align: 'center' });
  footer(s, 11);
}

// 12 — Ask
{
  const s = pptx.addSlide(); addBg(s, C.black);
  tx(s, 'پیشنهاد تصمیم', 10.40, 0.62, 2.10, 0.28, { fontSize: 11, color: C.lime, bold: true });
  tx(s, 'یک جلسه ۶۰ دقیقه‌ای برای تعیین\n«اولین تصمیم قابل اثبات»', 4.15, 1.07, 8.35, 1.28, { fontSize: 33, color: C.white, bold: true, valign: 'top' });
  const asks = [
    ['۱', 'هم‌راستاسازی محصول', 'حضور نمایندگان محصول، آسا، هوش تجاری، تعامل‌پذیری و امنیت'],
    ['۲', 'انتخاب پایلوت', 'یک مشتری با خرید تکرارشونده و مالک شاخص روشن'],
    ['۳', 'قرارداد داده', 'توافق روی حداقل ستون‌ها، تعریف نتیجه و محدودیت‌های امنیتی'],
    ['۴', 'معیار موفقیت', 'تعریف آستانه توسعه، بازبینی یا توقف قبل از اجرا'],
  ];
  asks.forEach((a, i) => {
    const y = 2.78 + i * 0.82;
    iconCircle(s, a[0], 11.88, y, '163226', C.lime);
    tx(s, a[1], 8.45, y - 0.02, 3.08, 0.30, { fontSize: 15, color: C.white, bold: true });
    tx(s, a[2], 1.25, y - 0.02, 6.82, 0.36, { fontSize: 12, color: 'C6D0CA' });
  });
  line(s, 0.80, 6.30, 11.70, '2A3930', 1);
  tx(s, 'اول یک تصمیم را اثبات کنیم؛ بعد آن را محصول کنیم.', 2.25, 6.52, 10.25, 0.42, { fontSize: 19, color: C.lime, bold: true });
  tx(s, 'marginlift.ir', 0.80, 6.54, 1.25, 0.30, { fontSize: 10.5, color: C.white, align: 'left', rtlMode: false });
}

// 13 — Sources
{
  const s = pptx.addSlide(); addBg(s); header(s, 'پیوست دقت', 'منابع عمومی و حدود ادعا', 'هیچ عدد مالی، دقت مدل یا نتیجه مشتری در این پیشنهاد ادعا نشده است.');
  const sources = [
    ['سایت رسمی چارگون', 'محصولات دیدگاه، آسا، BI، دیدگاه ۳۶۰، API، امنیت و مشتریان', 'https://chargoon.com/'],
    ['راهنمای برند چارگون', 'فلسفه ساده‌سازی پیچیدگی‌ها، رنگ‌ها و قواعد هم‌نشینی برند', 'https://chargoon.com/logo/'],
    ['گفت‌وگوی مدیران چارگون با دیجیاتو', 'H2H، AI محلی، تجربه کاربری و چشم‌انداز بازارگاه', 'https://digiato.com/iran-technology-news/chargoon-interview-rebranding'],
    ['نسخه نمایشی مارجین‌لیفت', 'قابلیت‌های فعلی محصول و دموی قابل ارائه', 'https://marginlift.ir/'],
  ];
  sources.forEach((r, i) => {
    const y = 2.02 + i * 0.98;
    tx(s, r[0], 9.10, y, 3.25, 0.28, { fontSize: 13.2, bold: true });
    tx(s, r[1], 4.35, y, 4.45, 0.40, { fontSize: 10.8, color: C.muted });
    tx(s, r[2], 0.90, y, 3.10, 0.40, { fontSize: 8.6, color: C.green, align: 'left', rtlMode: false, hyperlink: { url: r[2] } });
    line(s, 0.90, y + 0.65, 11.45, C.line, 0.6);
  });
  s.addShape(S.rect, { x: 0.90, y: 6.14, w: 11.45, h: 0.55, fill: { color: 'FFF5E7' }, line: { color: 'F2D5AD' } });
  tx(s, 'این سند پیشنهاد اولیه و غیرالزام‌آور است؛ دامنه، قیمت، مسئولیت‌ها و الزامات حقوقی پس از Discovery مشترک نهایی می‌شوند.', 1.18, 6.22, 10.90, 0.30, { fontSize: 11.5, color: C.ink, bold: true, align: 'center' });
  footer(s, 13);
}

pptx.writeFile({ fileName: OUT });
