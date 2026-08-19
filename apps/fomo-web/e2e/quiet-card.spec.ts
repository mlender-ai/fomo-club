import { expect, test } from "@playwright/test";

/**
 * 메인 카드 렌더 스모크 — DS-01 완료 기준 중 **픽셀로만 확인되는 것**.
 *
 * 유닛 테스트는 계약을, 이 스펙은 화면을 지킨다. D5(카드 하단 96px 공백)가 6주를 버틴 이유가
 * 이것이다 — 조건부 렌더는 처음부터 맞았고, 높이를 차지한 것은 컨테이너였다. 재보면 드러난다.
 */

const PREVIEW = "/quiet-card-preview";
const BANNED = ["무효선", "내부자", "클러스터", "이 관점은 무효", "수급", "매집", "이례적", "자리", "관점"];

async function heightOf(page: import("@playwright/test").Page, id: string): Promise<number> {
  const box = await page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"]`).boundingBox();
  return box?.height ?? 0;
}

test("페이지가 렌더된다 — 빈 화면이 아니다", async ({ page }) => {
  const response = await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-testid="quiet-pick-card"]')).toHaveCount(4);
});

test("완료 기준 5 — 블록이 붙을수록 카드가 길어진다 (고정 높이 없음)", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const min = await heightOf(page, "min");
  const evidence = await heightOf(page, "evidence");
  const spark = await heightOf(page, "spark");
  const full = await heightOf(page, "full");

  expect(min).toBeGreaterThan(0);
  expect(evidence).toBeGreaterThan(min);
  expect(spark).toBeGreaterThan(evidence);
  expect(full).toBeGreaterThan(spark);
  // 최소 구성이 최대 구성과 같아지면 어딘가 고정 높이가 남아 있다는 뜻이다.
  expect(full - min).toBeGreaterThan(60);
});

test("완료 기준 1 — 결론이 화면에서 가장 큰 텍스트다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const scope = page.locator('[data-case="full"]');
  const hookSize = await scope.locator('[data-testid="pick-hook"]').evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).fontSize)
  );
  expect(hookSize).toBe(24);
  const sizes = await scope.locator('[data-testid="quiet-pick-card"] *').evaluateAll((els) =>
    els.filter((el) => (el.textContent ?? "").trim().length > 0).map((el) => Number.parseFloat(getComputedStyle(el).fontSize))
  );
  expect(Math.max(...sizes)).toBe(hookSize);
});

test("완료 기준 7 — 결론이 2줄을 넘지 않는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const hook = page.locator('[data-case="full"] [data-testid="pick-hook"]');
  const { height, lineHeight } = await hook.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(Math.round(height / lineHeight)).toBeLessThanOrEqual(2);
});

test("accent 는 결론 · 성적 · CTA 세 자리다 (기획자 모킹 기준)", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const ACCENT = "rgb(212, 255, 63)";
  const count = async (id: string) =>
    page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"] *`).evaluateAll(
      (els, accent) =>
        els.filter((el) => {
          const style = getComputedStyle(el);
          return style.color === accent || style.backgroundColor === accent || style.borderColor === accent;
        }).length,
      ACCENT
    );

  const record = page.locator('[data-case="full"] [data-testid="pick-our-record"]');
  await expect(record).toHaveCount(1);
  // 결론(1) + 성적 좌측 바·수익률(2) + CTA(1) = 4. 그 밖에는 없다.
  expect(await count("full")).toBe(4);

  // 성적이 없는 카드는 결론 + CTA 두 곳뿐 — 성적 accent 를 다른 데로 옮기지 않는다.
  expect(await count("spark")).toBe(2);
  await expect(page.locator('[data-case="spark"] [data-testid="pick-our-record"]')).toHaveCount(0);

  const hook = page.locator('[data-case="full"] [data-testid="pick-hook"]');
  expect(await hook.evaluate((el) => getComputedStyle(el).color)).toBe(ACCENT);
  const cta = page.locator('[data-case="full"] [data-testid="pick-cta"]');
  expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ACCENT);
  expect(await cta.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(26, 26, 0)"); // accent-ink
});

test("완료 기준 3·4 — 칩이 없고 CTA 가 하나다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-case="full"] [data-testid="quiet-pick-card"]');
  await expect(card.locator('[data-testid="pick-chips"]')).toHaveCount(0);
  await expect(card.locator('[data-testid="pick-evidence"]')).toHaveCount(1);
  await expect(card.locator("button")).toHaveCount(2); // 관심(★) + CTA
  await expect(card.locator('[data-testid="pick-cta"]')).toHaveCount(1);
  // CTA 는 48px pill 이다.
  const height = (await card.locator('[data-testid="pick-cta"]').boundingBox())?.height ?? 0;
  expect(Math.round(height)).toBe(48);
  // 근거는 박스 안 라벨-값이다(모킹).
  await expect(card.locator('[data-testid="pick-evidence"] dt')).not.toHaveCount(0);
});

test("등락에 색을 쓰지 않는다 — 하락은 회색이다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const color = await page
    .locator('[data-case="full"] [data-testid="pick-change"]')
    .evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(122, 122, 118)"); // down #7A7A76
});

test("터치 타겟 — 탭 가능한 요소는 44px 이상이다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const boxes = await page.locator('[data-case="full"] [data-testid="quiet-pick-card"] button').all();
  for (const button of boxes) {
    const box = await button.boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(44);
  }
});

test("완료 기준 6 — 텍스트 총량이 줄었다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const text = (await page.locator('[data-case="full"] [data-testid="quiet-pick-card"]').innerText()).replace(/\s+/g, "");
  /**
   * 2026-08-19 DS-01 이전 카드(같은 픽스처)는 공백 제외 약 300자였다 — 훅·서브라인·칩 3개·
   * 신호 과거 성적·스파크라인 캡션·실체 한 줄·되돌아보는 선·더보기. DS-01 은 40% 이상 감소를
   * 요구하므로 180자 미만이어야 한다.
   */
  expect(text.length).toBeLessThan(180);
});

test("같은 숫자가 카드 한 장에 3회 이상 나오지 않는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const text = await page.locator('[data-case="full"] [data-testid="quiet-pick-card"]').innerText();
  const counts = new Map<string, number>();
  /**
   * 소수·천단위를 **한 값으로** 센다. `\d+` 로 쪼개면 `-1.5%` 와 `+13.1%` 가 `1` 을 공유해
   * 같은 값이 반복된 것처럼 보인다 — 이 규칙이 막는 것은 같은 **값**의 반복이다.
   */
  for (const n of text.match(/\d+(?:[.,]\d+)*/g) ?? []) counts.set(n, (counts.get(n) ?? 0) + 1);
  for (const [number, count] of counts) {
    expect(count, `숫자 ${number} 가 ${count}회 반복`).toBeLessThan(3);
  }
});

test("금지어가 화면 텍스트에 없다", async ({ page }) => {
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
    if (/favicon|stock-logo|ERR_/i.test(text)) return;
    errors.push(text);
  });
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
