import { expect, test } from "@playwright/test";

/**
 * 값의 상태 차트 렌더 스모크 (WO-SUB-04 완료 조건 2·3·4).
 *
 * 유닛 테스트는 **데이터 계약**을 지키고, 이 스펙은 **화면에 실제로 그렇게 나오는지**를 지킨다.
 * 둘은 다른 것이다 — 빌더가 `renderable: false` 를 정확히 돌려줘도 감싸는 쪽이 박스를 그대로
 * 두면 화면에는 빈 상자가 남는다. 그 결함이 실제로 나왔고 유닛 테스트로는 안 잡혔다.
 */

const PREVIEW = "/valuation-chart-preview";

test("페이지가 렌더된다 — 빈 화면이 아니다", async ({ page }) => {
  const response = await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const height = await page.evaluate(() => document.body.scrollHeight);
  expect(height).toBeGreaterThan(0);
});

test("완료 조건 2 — 미분류 칸에 빈 상자가 남지 않는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const unclassified = page.locator('[data-testid="chart-case"][data-archetype="UNCLASSIFIED"]');
  await expect(unclassified).toHaveCount(1);
  // 차트 영역이 **DOM 에 없어야** 한다. 숨김(display:none)이 아니라 부재다 —
  // 감싸는 박스만 남아도 사용자에게는 정보 없는 빈 상자로 보인다.
  await expect(unclassified.locator('[data-testid="chart-box"]')).toHaveCount(0);
});

test("렌더 가능한 케이스는 SVG 가 실제로 그려진다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const boxes = page.locator('[data-testid="chart-box"]');
  const count = await boxes.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const svg = boxes.nth(index).locator("svg");
    await expect(svg).toHaveCount(1);
    // 크기가 0 이면 그려진 것이 아니다.
    const box = await svg.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }
});

test("금지어가 화면 텍스트에 없다 — 캡션·경고문 전부 포함", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const text = (await page.locator("main").innerText()).replace(/\s+/g, "");
  // WO-SUB-04 §4 규칙 1. 유닛 테스트는 템플릿을 검사하지만 화면에는 다른 경로로도 글자가 들어온다.
  for (const banned of ["싸다", "비싸다", "저평가", "고평가", "매력적", "유망", "기회입니다"]) {
    expect(text, `금지어 "${banned}" 가 화면에 노출됐다`).not.toContain(banned);
  }
});

test("콘솔 에러가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // favicon 404 는 프리뷰 라우트의 관심사가 아니다.
    if (/favicon/i.test(text)) return;
    errors.push(text);
  });
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
