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

/**
 * 최초 실행 면책 고지(DS-06 §6-5)를 미리 통과시킨다 — 이 스펙이 보려는 것은 그 뒤 화면이다.
 * 고지 자체는 `e2e/interaction.spec.ts` 가 따로 본다.
 */
async function skipFirstVisitNotice(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("fomo_notice_ack_v1", new Date().toISOString());
    } catch {
      /* 저장소가 막힌 환경이면 고지가 떠도 이 스펙은 탭만 본다 */
    }
  });
}

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

/**
 * **개수를 말하지 않는다** (2026-08-31 지시).
 *
 * 개수를 말하면 그 수가 곧 기대치가 되고 9곳인 날은 적어 보인다. 이 앱이 파는 것은
 * 개수가 아니라 한 장이다. 「적어요」 안내도 같은 이유로 뺐다.
 */
test("덱 타이틀이 개수를 말하지 않는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const title = page.locator('[data-case="title"]');
  await expect(title).toContainText("오늘의 조용한 돈");
  // 부제(`돈이 먼저 들어간 곳`)에는 「곳」이 있다 — 막을 것은 **숫자 + 곳**이다.
  expect(await title.locator("h1").innerText()).toBe("오늘의 조용한 돈");
  expect(await title.innerText()).not.toMatch(/\d+\s*곳/);
  await expect(page.locator('[data-testid="deck-thin"]')).toHaveCount(0);
});

test("완료 기준 6 — 스켈레톤 로딩. 스피너가 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const skeleton = page.locator('[data-case="skeleton"] [data-testid="deck-skeleton"]');
  await expect(skeleton).toHaveCount(1);
  const blocks = skeleton.locator(".ds-skeleton");
  await expect(blocks).toHaveCount(3);

  // 블록 높이 20 / 60 / 40 (DS-05 §5).
  const heights = await blocks.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  expect(heights).toEqual([20, 60, 40]);

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

/** WO-RESET-01 A-4 — 하단 탭 바 자체를 없앴다. 성적표·내 기록으로 가는 길이 화면에 없다. */
test("완료 기준 4 — 하단 탭이 없다", async ({ page }) => {
  await skipFirstVisitNotice(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="bottom-tab"]')).toHaveCount(0);
  await expect(page.locator("nav")).toHaveCount(0);
  await expect(page.getByText("성적표", { exact: true })).toHaveCount(0);
  await expect(page.getByText("내 기록", { exact: true })).toHaveCount(0);
});

test("① 헤더 — 56px 고정, 로고 mono 0.12em, 검색 버튼 없음", async ({ page }) => {
  await skipFirstVisitNotice(page);
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

  // 검색을 없앴다(WO-RESET-01 A-4) — 검색해서 무엇을 하는지 정의가 없었다. 로고만 남는다.
  await expect(header.locator("button")).toHaveCount(0);
  await expect(header.locator("svg")).toHaveCount(0);
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
