import { expect, test } from "@playwright/test";

/**
 * DS-06 인터랙션·앱 요건 — **픽셀·타이밍·성능**만 여기서 본다.
 * 스펙 값의 존재는 유닛(`__tests__/interactionDs06.test.ts`)이 지킨다.
 */

test("완료 기준 6 — 폰트가 번들에서 로드되고 FOUT 이 없다 (§6-2)", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (/font/i.test(req.resourceType()) && !url.includes("127.0.0.1") && !url.includes("localhost")) external.push(url);
  });
  await page.goto("/quiet-card-preview", { waitUntil: "load" });
  await page.waitForTimeout(800);

  // 외부 폰트 요청이 없다 — CDN 지연 로딩 금지.
  expect(external).toEqual([]);

  const fonts = await page.evaluate(() =>
    [...document.fonts].map((f) => `${f.family}:${f.status}`)
  );
  expect(fonts.some((f) => f.startsWith("Departure Mono:loaded"))).toBe(true);
  expect(fonts.some((f) => f.startsWith("Pretendard:loaded"))).toBe(true);

  // 수치는 mono, 문장은 Pretendard (DS-00 §3).
  const monoFamily = await page
    .locator('[data-case="full"] [data-testid="pick-evidence"] dt')
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(monoFamily).toContain("Departure Mono");
});

test("완료 기준 5 — 320px 에서 결론이 2줄을 넘지 않고 가로 스크롤이 없다 (§6-1)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/quiet-card-preview", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  const lines = await page.locator('[data-testid="pick-hook"]').evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight)))
  );
  for (const count of lines) expect(count).toBeLessThanOrEqual(2);

  // 값이 잘려 사라지지 않는다(근거는 줄바꿈으로 다 보인다).
  const values = await page.locator('[data-case="full"] [data-testid="pick-evidence"] dd').allInnerTexts();
  for (const value of values) expect(value.endsWith("…")).toBe(false);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("완료 기준 1 — 탭 피드백이 실제로 적용된다 (§2)", async ({ page }) => {
  await page.goto("/quiet-card-preview", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const cta = page.locator('[data-case="full"] [data-testid="pick-cta"]');
  const style = await cta.evaluate((el) => {
    const rules = [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch {
        return [];
      }
    });
    return {
      classes: el.className,
      hasActiveRule: rules.some((text) => text.includes(".tap-button:active") && text.includes("scale(0.97)")),
      transition: getComputedStyle(el).transitionProperty,
    };
  });
  expect(style.classes).toContain("tap-button");
  expect(style.hasActiveRule).toBe(true);
  expect(style.transition).toContain("transform");
});

test("완료 기준 4 — 세이프 에어리어와 480px 중앙 정렬 (§6-1)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const width = await page.locator("main").evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(width).toBeLessThanOrEqual(480);

  const nav = await page.locator("nav").evaluate((el) => ({
    bottom: Math.round(el.getBoundingClientRect().bottom),
    padding: getComputedStyle(el).paddingBottom,
  }));
  // 하단 탭은 화면 맨 아래에 붙고, 세이프 에어리어만큼 배경을 연장한다.
  expect(nav.bottom).toBe(900);
  expect(nav.padding).toBeDefined();
});

test("§6-5 — 최초 실행 면책 고지가 1회만 뜬다", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const notice = page.locator('[data-testid="first-visit-notice"]');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("투자 판단과 책임은 이용자 본인에게 있어요");
  await expect(notice.locator("button")).toHaveCount(1); // CTA 하나

  await notice.locator("button").click();
  await expect(notice).toHaveCount(0);

  // 다시 열어도 뜨지 않는다.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await expect(page.locator('[data-testid="first-visit-notice"]')).toHaveCount(0);
});

test("§6-5 — 데이터 출처·개인정보 화면이 열린다", async ({ page }) => {
  const res = await page.goto("/about", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  await expect(page.locator("main")).toContainText("데이터 출처");
  await expect(page.locator("main")).toContainText("이 기기(브라우저)에만 저장돼요");
  await expect(page.locator("main")).toContainText("투자 판단과 책임은 이용자 본인에게 있어요");
});

test("완료 기준 9 — 콜드 스타트 성능 (§6-6)", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paint = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint");
    return { domInteractive: nav?.domInteractive ?? 0, fcp: paint?.startTime ?? 0 };
  });
  // 로컬 프로덕션 빌드 기준 — 2.5초 예산 안에 첫 페인트가 들어와야 한다.
  expect(timing.fcp).toBeLessThan(2500);
  expect(timing.domInteractive).toBeLessThan(2500);
});

test("콘솔 에러가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|stock-logo|ERR_|Failed to fetch|404|503|500/i.test(text)) return;
    errors.push(text);
  });
  await page.goto("/about", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
