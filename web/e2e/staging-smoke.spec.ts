import { stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const email = process.env.STAGING_QA_EMAIL;
const password = process.env.STAGING_QA_PASSWORD;

test.beforeEach(async ({ page }) => {
  test.skip(!email || !password, "STAGING_QA_EMAIL and STAGING_QA_PASSWORD are required");

  const browserErrors: string[] = [];
  const failedAssets: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedAssets.push(`${request.method()} ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && ["document", "script", "stylesheet", "font"].includes(response.request().resourceType())) {
      failedAssets.push(`${response.status()} ${response.url()}`);
    }
  });

  (page as typeof page & { __qaErrors?: string[]; __qaAssets?: string[] }).__qaErrors = browserErrors;
  (page as typeof page & { __qaErrors?: string[]; __qaAssets?: string[] }).__qaAssets = failedAssets;
});

test.afterEach(async ({ page }) => {
  const tracked = page as typeof page & { __qaErrors?: string[]; __qaAssets?: string[] };
  expect(tracked.__qaErrors, "browser console and page errors").toEqual([]);
  expect(tracked.__qaAssets, "failed document, script, stylesheet, and font requests").toEqual([]);
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("ایمیل کاری").fill(email!);
  await page.getByLabel("رمز عبور").fill(password!);
  await page.getByRole("button", { name: "ورود به مرکز تصمیم" }).click();
  await expect(page).toHaveURL(/\/app\/today/);
  await expect(page.getByRole("heading", { name: "یک تصمیم، با مرز ادعای روشن" })).toBeVisible();
}

test("staging release supports the complete guided decision journey", async ({ page }, testInfo) => {
  await login(page);

  await page.getByRole("button", { name: /اجرای دموی نمونه|اجرای سناریوی دیگر/ }).click();
  await expect(page.getByRole("heading", { name: "سه توقف، یک داستان قابل ارائه" })).toBeVisible();

  const personas = [
    ["مدیرعامل", "اثر مالی و تصمیم سرمایه‌گذاری", "executive"],
    ["بازاریابی", "تخصیص بودجه و فرضیه بازگشت مشتری", "cmo"],
    ["CRM", "صف اقدام و محدودیت تماس", "crm"],
    ["مالی", "سود، هزینه و قابلیت تطبیق", "finance"],
    ["داده", "کیفیت داده و زنجیره شواهد", "data"],
  ] as const;

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "باز کردن ناوبری" }).click();
  }
  for (const [label, heading, view] of personas) {
    await page.getByRole("button", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`view=${view}`));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "بستن ناوبری" }).last().click();
  }

  await page.goto("/app/decisions?view=crm");
  await expect(page.getByRole("heading", { name: "صف تصمیم قابل حسابرسی" })).toBeVisible();
  await page.getByRole("button", { name: /مشاهده رسید/ }).first().click();
  await expect(page.getByText("Decision Receipt", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "بستن", exact: true }).click();

  await page.goto("/app/evidence?view=data");
  await expect(page.getByRole("heading", { name: "اتاق شواهد تصمیم" })).toBeVisible();
  await expect(page.getByText("تا ادعای تأییدشده چه فاصله‌ای داریم؟", { exact: true })).toBeVisible();

  await page.goto("/app/pilot?view=cmo");
  await expect(page.getByRole("heading", { name: "کنترل اجرای پایلوت" })).toBeVisible();
  await expect(page.getByText("گیت‌های پایلوت", { exact: true })).toBeVisible();

  await page.goto("/app/report?view=executive");
  await expect(page.getByRole("heading", { name: "گزارش یک‌صفحه‌ای تصمیم" })).toBeVisible();
  await expect(page.getByText("داده نمونه · قابل ارائه به‌عنوان نتیجه مشتری نیست", { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("staging-report.png"), fullPage: true });

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);

  if (testInfo.project.name === "desktop") {
    const pdfPath = testInfo.outputPath("marginlift-board-readout.pdf");
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
    expect((await stat(pdfPath)).size).toBeGreaterThan(10_000);
  }
});
