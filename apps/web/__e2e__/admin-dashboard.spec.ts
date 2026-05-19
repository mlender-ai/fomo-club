import { test, expect } from "@playwright/test";

test.describe("어드민 대시보드 네비게이션", () => {
  test.beforeEach(async ({ page }) => {
    // 로그인 세션 설정
    const password = process.env.DASHBOARD_PASSWORD || "change-me";
    await page.goto("/login");
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin/);
  });

  test("대시보드 메인 페이지 로드", async ({ page }) => {
    await expect(page.locator(".admin-logo-text")).toContainText("Taro Admin");
    await expect(page.locator(".admin-sidebar")).toBeVisible();
    await expect(page.locator(".admin-content")).toBeVisible();
  });

  test("사이드바 네비게이션 — 카드 관리", async ({ page }) => {
    await page.click('a[href="/admin/cards"]');
    await expect(page).toHaveURL(/\/admin\/cards/);
  });

  test("사이드바 네비게이션 — 모니터링", async ({ page }) => {
    await page.click('a[href="/admin/monitoring"]');
    await expect(page).toHaveURL(/\/admin\/monitoring/);
  });

  test("사이드바 네비게이션 — 분석", async ({ page }) => {
    await page.click('a[href="/admin/analytics"]');
    await expect(page).toHaveURL(/\/admin\/analytics/);
  });
});
