import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("ایمیل کاری").fill("growth@example.com");
  await page.getByLabel("رمز عبور").fill("demo1234");
  await page.getByRole("button", { name: "ورود به مرکز تصمیم" }).click();
  await expect(page).toHaveURL(/\/app\/today/);
  await expect(page.getByRole("heading", { name: "یک تصمیم، با مرز ادعای روشن" })).toBeVisible();
}

async function loadDemo(page: import("@playwright/test").Page) {
  await page.getByLabel("نوع کسب‌وکار نمونه").selectOption("generic_ecommerce");
  await page.getByRole("button", { name: /اجرای دموی نمونه|اجرای سناریوی دیگر/ }).click();
  await expect(page.getByText("برآورد تاریخی", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "سه توقف، یک داستان قابل ارائه" })).toBeVisible();
  await expect(page.getByRole("link", { name: /۱\. تصمیم‌ها/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /۲\. شواهد/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /۳\. گزارش مدیر/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "اجرای سناریوی دیگر" })).toBeEnabled();
}

test("public page and authenticated Today have no serious axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MarginLift" })).toBeVisible();
  const publicResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(publicResults.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);

  await login(page);
  await loadDemo(page);
  const appResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(appResults.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
});

test("decision, evidence and report use the same evidence state", async ({ page }) => {
  await login(page);
  await loadDemo(page);
  await expect(page.getByText("رابطه مشاهده‌شده است و اثر علّی را تأیید نمی‌کند.")).toBeVisible();

  await page.goto("/app/evidence");
  await expect(page.getByRole("heading", { name: "Evidence Room" })).toBeVisible();
  await expect(page.getByText("نتیجه Shadow", { exact: true })).toBeVisible();

  await page.goto("/app/report?view=finance");
  await expect(page.getByRole("heading", { name: "گزارش یک‌صفحه‌ای تصمیم" })).toBeVisible();
  await expect(page.getByText("مجاز نیست", { exact: true })).toBeVisible();
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "wide", width: 1920, height: 1080 },
]) {
  test(`visual QA Today at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    await loadDemo(page);
    const geometry = await page.evaluate(() => {
      const selectors = [".app-main", ".page-stack", ".demo-launcher", ".decision-brief", ".decision-copy", ".single-metric", ".demo-route", ".context-line"];
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        boxes: selectors.map((selector) => ({ selector, box: document.querySelector(selector)?.getBoundingClientRect().toJSON() })),
        sidebar: document.querySelector(".app-sidebar")?.getBoundingClientRect().toJSON(),
      };
    });

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    for (const item of geometry.boxes) {
      expect(item.box, `${item.selector} should be rendered`).toBeTruthy();
      expect(item.box?.left, `${item.selector} should stay inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(item.box?.right, `${item.selector} should stay inside the viewport`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    }
    if (viewport.width <= 960) {
      expect(geometry.sidebar?.left, "closed mobile navigation should be fully outside the viewport").toBeGreaterThanOrEqual(geometry.viewportWidth);
    }
    await page.screenshot({ path: `test-results/today-${viewport.name}.png`, fullPage: true });
  });
}
