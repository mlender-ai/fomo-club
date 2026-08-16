import { expect, test } from "@playwright/test";

/**
 * 픽 카드 렌더 스모크 (WO-SUB-HOOK 완료 조건 2·3·4·5·10).
 *
 * 유닛 테스트는 **계약**을 지키고, 이 스펙은 **화면에 실제로 그렇게 나오는지**를 지킨다.
 * D5(카드 하단 공백)가 6주를 버틴 이유가 이것이다 — 조건부 렌더는 처음부터 맞았고,
 * 고정 높이 무대는 소스만 봐서는 결함으로 보이지 않았다. 재보면 바로 드러난다.
 */

const PREVIEW = "/quiet-card-preview";
const BANNED = ["무효선", "내부자", "클러스터", "이 관점은 무효", "수급", "매집", "이례적", "말라 있던 자리", "돈이 들어오기 시작한 자리"];

async function heightOf(page: import("@playwright/test").Page, id: string): Promise<number> {
  const box = await page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"]`).boundingBox();
  return box?.height ?? 0;
}

test("페이지가 렌더된다 — 빈 화면이 아니다", async ({ page }) => {
  const response = await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-testid="quiet-pick-card"]')).toHaveCount(4);
});

test("완료 조건 5 — 슬롯 조합마다 카드 높이가 실제로 다르다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const only1 = await heightOf(page, "slot1");
  const with2 = await heightOf(page, "slot12");
  const with3 = await heightOf(page, "slot13");
  const all = await heightOf(page, "slot123");

  expect(only1).toBeGreaterThan(0);
  // 슬롯이 붙을수록 카드가 커진다 — 빈 슬롯이 자리를 지키지 않는다.
  expect(with2).toBeGreaterThan(only1);
  /**
   * ③ 값의 위치(매출 막대)는 **앞면에서 빠졌다**(WO-RENDER-01 E-1) — 디테일로 옮겼다.
   * 그래서 ③ 유무는 앞면 높이를 바꾸지 않는다. 앞면에 없는 블록이 높이를 차지하면
   * 그만큼 빈 공간이 남기 때문에, 같아야 하는 것이 맞다(CTX-05 §2-3).
   */
  expect(with3).toBe(only1);
  expect(all).toBe(with2);
});

test("완료 조건 4 — 되돌아보는 선은 박스가 아니라 한 줄이다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const line = page.locator('[data-case="slot1"] [data-testid="recheck-line"]');
  await expect(line).toHaveCount(1);
  const box = await line.boundingBox();
  // 한 줄(≈20px) — 박스로 감싸면 padding 때문에 두 배 이상이 된다.
  expect(box?.height ?? 0).toBeLessThan(48);
  // 훅이 되돌아보는 선보다 시각적으로 무겁다(글자 크기).
  const hookSize = await page.locator('[data-case="slot1"] [data-testid="pick-hook"]').evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).fontSize)
  );
  const lineSize = await line.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(hookSize).toBeGreaterThan(lineSize);
});

test("훅은 한 문장이고 칩이 근거를 받는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const hook = await page.locator('[data-case="slot1"] [data-testid="pick-hook"]').innerText();
  // 옛 payload 가 와도 화면은 한 문장이다(배치 시차 복구).
  expect(hook).not.toContain("—");
  expect(hook).toBe("기관이 25일째 조용히 사고 있어요");
  const chips = await page.locator('[data-case="slot1"] [data-testid="pick-chips"] span').allInnerTexts();
  expect(chips.length).toBeGreaterThan(0);
  expect(chips.length).toBeLessThanOrEqual(3);
});

test("완료 조건 3 — 같은 숫자가 카드 한 장에 3회 이상 나오지 않는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const text = await page.locator('[data-case="slot1"] [data-testid="quiet-pick-card"]').innerText();
  const counts = new Map<string, number>();
  for (const n of text.match(/\d+/g) ?? []) counts.set(n, (counts.get(n) ?? 0) + 1);
  for (const [number, count] of counts) {
    expect(count, `숫자 ${number} 가 ${count}회 반복`).toBeLessThan(3);
  }
});

test("완료 조건 10 — 금지어가 화면 텍스트에 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const text = await page.locator("main").innerText();
  for (const banned of BANNED) {
    expect(text, `금지어 "${banned}" 가 화면에 노출됐다`).not.toContain(banned);
  }
});

test("콘솔 에러가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|stock-logo|ERR_/i.test(text)) return; // 로고 프록시는 프리뷰의 관심사가 아니다
    errors.push(text);
  });
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
