import { test, expect } from "@playwright/test";

test.describe("관리자 로그인 플로우", () => {
  test("비밀번호 없이 접근 시 로그인 페이지 표시", async ({ page }) => {
    await page.goto("/admin");
    // 인증 없으면 /login으로 리다이렉트
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("h1")).toContainText("Paper trading access");
  });

  test("잘못된 비밀번호 입력 시 에러 메시지", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="password"]', "wrong-password");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/error=1/);
    await expect(page.locator(".error-text")).toBeVisible();
  });

  test("올바른 비밀번호로 로그인 → 대시보드 접근", async ({ page }) => {
    const password = process.env.DASHBOARD_PASSWORD || "change-me";
    await page.goto("/login");
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator(".admin-sidebar")).toBeVisible();
  });
});
