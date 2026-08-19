import { expect, test } from "@playwright/test";

/**
 * 덱 화면 렌더 스모크 — DS-02 완료 기준 중 **픽셀로만 확인되는 것**.
 *
 * 조각 프리뷰(`/quiet-deck-preview`)로 API 없이 상태를 세운다 — 로딩·스테일·12장 초과는
 * 실데이터로는 재현이 어렵다. 헤더·하단 탭은 `HomeView` 소유라 홈(`/`)에서 본다(픽 데이터가
 * 없어도 셸은 렌더되므로 CI 에서도 성립한다).
 */

const PREVIEW = "/quiet-deck-preview";
const ACCENT = "rgb(212, 255, 63)";

test("완료 기준 1 — 덱 타이틀에 accent 가 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const title = page.locator('[data-case="title"] h1');
  await expect(title).toHaveCount(1);
  const { size, color } = await title.evaluate((el) => ({
    size: getComputedStyle(el).fontSize,
    color: getComputedStyle(el).color,
  }));
  expect(size).toBe("20px");
  expect(color).toBe("rgb(255, 255, 255)");

  const accents = await page.locator("main *").evaluateAll(
    (els, accent) =>
      els.filter((el) => {
        const style = getComputedStyle(el);
        return style.color === accent || style.backgroundColor === accent;
      }).length,
    ACCENT
  );
  expect(accents).toBe(0);
});

test("완료 기준 2 — 점 인디케이터. 12장 초과면 mono 텍스트", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const dots = page.locator('[data-case="dots"] [data-testid="deck-progress"] span');
  await expect(dots).toHaveCount(9);

  const sizes = await dots.evaluateAll((els) =>
    els.map((el) => ({
      w: Math.round(el.getBoundingClientRect().width),
      bg: getComputedStyle(el).backgroundColor,
    }))
  );
  // 활성 6px 흰색 / 비활성 4px text-3
  expect(sizes[2]).toEqual({ w: 6, bg: "rgb(255, 255, 255)" });
  expect(sizes[0]).toEqual({ w: 4, bg: "rgb(90, 90, 87)" });

  const counter = page.locator('[data-case="counter"] [data-testid="deck-progress"]');
  await expect(counter).toHaveText("3 / 14");
  await expect(counter.locator("span")).toHaveCount(0);
});

test("완료 기준 3 — 지켜보는 중은 구분선 리스트다 (카드 아님)", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const shelf = page.locator('[data-case="watching"]');
  const rows = shelf.locator('[data-testid="watch-row"]');

  // 6건 중 5건만 보이고 나머지는 더 보기.
  await expect(rows).toHaveCount(5);
  await expect(shelf.locator('[data-testid="watch-more"]')).toHaveCount(1);
  // 로고 이미지 없음.
  await expect(shelf.locator("img")).toHaveCount(0);

  const geometry = await rows.evaluateAll((els) =>
    els.map((el) => ({
      h: Math.round(el.getBoundingClientRect().height),
      radius: getComputedStyle(el.parentElement as Element).borderRadius,
      border: getComputedStyle(el.parentElement as Element).borderBottomWidth,
    }))
  );
  for (const row of geometry) {
    expect(row.h).toBeGreaterThanOrEqual(64); // §6 최소 64px
    expect(row.radius).toBe("0px"); // 카드가 아니다
    /**
     * 헤어라인. **DPR 에 따라 브라우저가 0.5px 를 1px 로 보고한다**(DPR 1 데스크톱 크로뮴).
     * 지키려는 것은 "헤어라인이지 굵은 선이 아니다" 이므로 상한으로 본다 — 토큰값 자체는
     * 유닛(`ds-tokens-drift`)이 지킨다.
     */
    expect(Number.parseFloat(row.border)).toBeLessThanOrEqual(1);
    expect(Number.parseFloat(row.border)).toBeGreaterThan(0);
  }

  await shelf.locator('[data-testid="watch-more"]').click();
  await expect(rows).toHaveCount(6);
});

test("완료 기준 6 — 스켈레톤 로딩. 스피너가 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const skeleton = page.locator('[data-case="skeleton"] [data-testid="deck-skeleton"]');
  await expect(skeleton).toHaveCount(1);
  const blocks = skeleton.locator(".ds-skeleton");
  await expect(blocks).toHaveCount(3);

  const anim = await blocks.first().evaluate((el) => ({
    duration: getComputedStyle(el).animationDuration,
    bg: getComputedStyle(el).backgroundColor,
  }));
  expect(anim.duration).toBe("1.4s");
  expect(anim.bg).toBe("rgb(24, 24, 24)"); // surface-2
  // 카드 형태여야 한다 — surface-1 위에 블록이 얹힌다.
  expect(await skeleton.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(16, 16, 16)");
});

test("완료 기준 7 — 스테일 서빙 시 기준 시각이 보인다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-case="stale"] [data-testid="deck-stale"]')).toHaveText("3시간 전 기준");
  // 정상 서빙에는 붙지 않는다.
  await expect(page.locator('[data-case="title"] [data-testid="deck-stale"]')).toHaveCount(0);
});

test("완료 기준 4 — 하단 탭은 텍스트만, 각 1/3 폭 × 56px", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const tabs = page.locator('[data-testid="bottom-tab"]');
  await expect(tabs).toHaveCount(3);
  await expect(page.locator("nav svg")).toHaveCount(0); // 아이콘 없음

  const boxes = await tabs.evaluateAll((els) =>
    els.map((el) => ({ w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))
  );
  const widths = new Set(boxes.map((b) => b.w));
  expect(widths.size).toBe(1); // 3등분
  for (const box of boxes) expect(box.h).toBe(56);
});

test("① 헤더 — 56px 고정, 로고 mono 0.12em, 검색 44×44", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const header = page.locator('[data-testid="deck-header"]');
  await expect(header).toHaveCount(1);
  const logo = header.locator("span").first();
  const style = await logo.evaluate((el) => ({
    size: getComputedStyle(el).fontSize,
    spacing: getComputedStyle(el).letterSpacing,
  }));
  expect(style.size).toBe("16px");
  expect(Number.parseFloat(style.spacing)).toBeCloseTo(1.92, 1); // 0.12em × 16px

  const search = header.locator("button");
  const box = await search.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(44);
  expect(Math.round(box?.height ?? 0)).toBe(44);
  expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
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
