import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

// simulo auto-qa 패턴 차용 — 각 라우트에 대해:
// 1. HTTP 200 응답
// 2. JS 콘솔 에러 0
// 3. body 영역이 실제 렌더링됨 (overflow 없음, height > 0)
// 4. Next.js dev overlay 없음 (production build 가정)

interface ConsoleCollector {
  errors: string[];
  warnings: string[];
}

function collectConsole(page: Page): ConsoleCollector {
  const collector: ConsoleCollector = { errors: [], warnings: [] };
  page.on("console", (msg: ConsoleMessage) => {
    const type = msg.type();
    const text = msg.text();
    if (type === "error") collector.errors.push(text);
    if (type === "warning") collector.warnings.push(text);
  });
  page.on("pageerror", (err: Error) => {
    collector.errors.push(`pageerror: ${err.message}`);
  });
  return collector;
}

// 외부 콘솔 노이즈 화이트리스트 — 우리 코드 변경과 무관한 패턴.
const IGNORED_ERROR_PATTERNS = [
  /Failed to load resource.*favicon/i,
  /404.*favicon/i,
  // Yahoo Finance 외부 fetch 실패는 다른 회귀 — smoke에서는 무시
  /yahoo|query[12]\.finance/i,
];

function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !IGNORED_ERROR_PATTERNS.some((p) => p.test(e)));
}

test.describe("smoke — 공개 라우트 시각/인터랙션 회귀 검증", () => {
  test("/ 홈 페이지", async ({ page }) => {
    const cons = collectConsole(page);
    const res = await page.goto("/");
    expect(res?.status(), "HTTP 200 응답").toBe(200);

    // body 실제 렌더링
    const bodyBox = await page.locator("body").boundingBox();
    expect(bodyBox, "body 박스 존재").not.toBeNull();
    expect(bodyBox!.height, "body 높이 > 0").toBeGreaterThan(0);

    // Next.js dev overlay 없음 (production)
    const overlay = page.locator("nextjs-portal");
    await expect(overlay, "Next.js dev overlay 없음").toHaveCount(0);

    // 콘솔 에러 0 (화이트리스트 제외)
    expect(realErrors(cons.errors), `예상 외 콘솔 에러: ${cons.errors.join("\n")}`).toEqual([]);
  });

  test("/login 사용자 로그인 페이지", async ({ page }) => {
    const cons = collectConsole(page);
    const res = await page.goto("/login");
    expect(res?.status()).toBe(200);

    const bodyBox = await page.locator("body").boundingBox();
    expect(bodyBox!.height).toBeGreaterThan(0);

    // 로그인 페이지의 핵심 입력 필드 또는 인풋 형태 존재
    const inputCount = await page.locator("input").count();
    expect(inputCount, "input 요소 1개 이상").toBeGreaterThanOrEqual(1);

    expect(realErrors(cons.errors)).toEqual([]);
  });

  test("/admin/login 어드민 로그인 페이지", async ({ page }) => {
    const cons = collectConsole(page);
    const res = await page.goto("/admin/login");
    expect(res?.status()).toBe(200);

    const bodyBox = await page.locator("body").boundingBox();
    expect(bodyBox!.height).toBeGreaterThan(0);

    // 어드민 로그인은 기본 비밀번호 인풋 + 제출 버튼 또는 폼 요소가 있어야 함
    const formExists = (await page.locator("form, input").count()) > 0;
    expect(formExists, "어드민 로그인 폼/인풋 존재").toBe(true);

    expect(realErrors(cons.errors)).toEqual([]);
  });

  test("/admin 비로그인 접근 → 로그인 페이지로 리다이렉트 또는 401/403", async ({ page }) => {
    // middleware 가 인증 안 된 요청을 적절히 처리하는지 회귀
    const res = await page.goto("/admin");
    const status = res?.status() ?? 0;
    const url = page.url();

    // 허용 시나리오:
    // - 200 + /admin/login 로 리다이렉트
    // - 401/403/404
    const acceptable =
      (status === 200 && url.includes("/admin/login")) ||
      status === 401 ||
      status === 403 ||
      status === 404;

    expect(acceptable, `예상 외 응답: status=${status}, url=${url}`).toBe(true);
  });
});
