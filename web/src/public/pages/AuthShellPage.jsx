import { useState } from "react";
import { BrandLockup, PublicShell } from "../components/PublicShell";
import { EvidenceLadder } from "../components/ProductNarrative";

function PasswordField({ id, name, autoComplete, minLength }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="ml-password-field">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        required
      />
      <button type="button" onClick={() => setVisible((value) => !value)} aria-pressed={visible}>
        {visible ? "پنهان" : "نمایش"}
      </button>
    </div>
  );
}

export function AuthShellPage({ mode = "login", onSubmit }) {
  const isLogin = mode === "login";
  const [status, setStatus] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!onSubmit) {
      setStatus(isLogin
        ? "برای فعال‌سازی ورود، اطلاعات دسترسی پایلوت باید توسط مالک فضای کاری تأیید شود."
        : "ساخت فضای کاری پس از ارزیابی داده و تأیید دامنه پایلوت انجام می‌شود.");
      return;
    }

    setStatus("در حال بررسی…");
    try {
      await onSubmit(new FormData(event.currentTarget));
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "درخواست انجام نشد. دوباره تلاش کنید.");
    }
  }

  return (
    <PublicShell minimal>
      <main className="ml-auth-page" id="ml-main-content" tabIndex="-1">
        <header className="ml-auth-header">
          <BrandLockup />
          <a href="/security">امنیت و حریم داده</a>
        </header>
        <div className="ml-auth-layout">
          <section className="ml-auth-form-panel" aria-labelledby="ml-auth-title">
            <div className="ml-auth-tabs" role="tablist" aria-label="ورود یا ساخت فضای کاری">
              <a href="/login" role="tab" aria-selected={isLogin}>ورود</a>
              <a href="/signup" role="tab" aria-selected={!isLogin}>ساخت فضای کاری</a>
            </div>
            <p className="ml-eyebrow">{isLogin ? "ورود سازمانی" : "شروع ارزیابی"}</p>
            <h1 id="ml-auth-title">{isLogin ? "به فضای تصمیم خود وارد شوید." : "فضای کاری را با یک مسئله روشن شروع کنید."}</h1>
            <p className="ml-auth-intro">
              {isLogin
                ? "گزارش‌ها، صف اقدام و شواهد پایلوت در فضای اختصاصی کسب‌وکار شما قرار دارند."
                : "قبل از ساخت حساب عملیاتی، دامنه تصمیم، مالک داده و سطح شواهد موردنیاز را مشخص می‌کنیم."}
            </p>

            <form className="ml-auth-form" onSubmit={handleSubmit}>
              {!isLogin && (
                <>
                  <label htmlFor="organization">نام کسب‌وکار</label>
                  <input id="organization" name="organization" type="text" autoComplete="organization" required />
                  <label htmlFor="role">نقش شما</label>
                  <select id="role" name="role" required defaultValue="">
                    <option value="" disabled>انتخاب نقش</option>
                    <option value="growth">رشد یا CRM</option>
                    <option value="finance">مالی یا CFO</option>
                    <option value="data">داده یا BI</option>
                    <option value="product">محصول یا مدیریت</option>
                  </select>
                </>
              )}

              <label htmlFor={`${mode}-email`}>ایمیل کاری</label>
              <input
                id={`${mode}-email`}
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                required
              />
              <label htmlFor={`${mode}-password`}>رمز عبور</label>
              <PasswordField
                id={`${mode}-password`}
                name="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={isLogin ? 6 : 8}
              />
              <button className="ml-button ml-button-primary ml-auth-submit" type="submit">
                {isLogin ? "ورود به مرکز تصمیم" : "درخواست ساخت فضای کاری"}
              </button>
              <p className="ml-form-status" role="status">{status || (isLogin
                ? "حساب‌های پایلوت با دسترسی نقش‌محور فعال می‌شوند."
                : "برای شروع، کارت بانکی یا اتصال کامل به CRM لازم نیست.")}</p>
            </form>

            <p className="ml-auth-legal">
              با ادامه، <a href="/terms">شرایط استفاده</a> و <a href="/privacy">حریم خصوصی</a> را می‌پذیرید.
            </p>
          </section>

          <aside className="ml-auth-story" aria-label="مسیر تصمیم MarginLift">
            <div>
              <p className="ml-eyebrow">از داده تا تصمیم قابل‌دفاع</p>
              <h2>هر عدد مالی، سطح شواهد و محدودیت خودش را دارد.</h2>
              <p>تا پیش از holdout سالم، خروجی مالی برآورد است. نتیجه تأییدشده فقط پس از بسته‌شدن outcome و تطبیق مالی ثبت می‌شود.</p>
            </div>
            <EvidenceLadder compact />
            <a href="/pilot-data-request">مشاهده داده موردنیاز پایلوت</a>
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}

export function LoginPage(props) {
  return <AuthShellPage {...props} mode="login" />;
}

export function SignupPage(props) {
  return <AuthShellPage {...props} mode="signup" />;
}
