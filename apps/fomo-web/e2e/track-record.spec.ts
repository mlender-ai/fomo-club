import { expect, test } from "@playwright/test";

/**
 * 성적표 · 내 기록 렌더 스모크 — DS-04 완료 기준 중 **픽셀로만 확인되는 것**.
 *
 * 두 화면 모두 API 에 의존한다. 데이터가 없는 환경(CI)에서는 **빈 상태**가 나오는데, 그것도
 * DS-04 의 설계 대상이다(§1-5·§2-3) — 그래서 "데이터가 있으면 이것, 없으면 저것" 을 함께 본다.
 */

const ACCENT = "rgb(212, 255, 63)";

async function accentCount(page: import("@playwright/test").Page, scope: string): Promise<number> {
  return page.locator(`${scope} *`).evaluateAll(
    (els, accent) =>
      els.filter((el) => {
        const style = getComputedStyle(el);
        return style.color === accent || style.backgroundColor === accent;
      }).length,
    ACCENT
  );
}

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

test("성적표 — 제목·부제가 뜨고 데스크톱에서 퍼지지 않는다", async ({ page }) => {
  const response = await page.goto("/track-record", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("성적표");
  await expect(page.locator("main")).toContainText("우리가 짚은 뒤 얼마나 움직였나");

  const width = await page.locator("main").evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(width).toBeLessThanOrEqual(576);
});

test("완료 기준 7·8 — accent 는 최대 한 지표, 일러스트·아이콘 없음", async ({ page }) => {
  await page.goto("/track-record", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // 대표 지표 하나. 데이터가 없으면 0 이다(색을 다른 데로 옮기지 않는다).
  expect(await accentCount(page, "main")).toBeLessThanOrEqual(1);
  // SVG 는 뒤로 화살표 하나뿐 — 일러스트가 없다.
  expect(await page.locator("main svg").count()).toBeLessThanOrEqual(1);
});

test("완료 기준 2·3·5 — 채점 결과가 있으면 표본·판정 불가·구분 문구가 함께 나온다", async ({ page }) => {
  await page.goto("/track-record", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const text = await page.locator("main").innerText();

  if (text.includes("채점 결과")) {
    expect(text).toMatch(/판단 [\d,]+건/); // 표본 병기
  }
  if (text.includes("무효 조건")) {
    expect(text).toContain("판정 불가");
    expect(text).toContain("분모에서 빼지 않아요");
  }
  if (text.includes("그동안 이건 볼 수 있어요")) {
    expect(text).toContain("채점 결과가 아니라 현재 시점 변동이에요");
  }
  // 어느 경우든 화면이 비어 있지 않다.
  expect(text.replace(/\s/g, "").length).toBeGreaterThan(20);
});

/**
 * WO-RESET-01 A-3 — 「내 기록」을 하단 탭에서 뺐다. 화면 코드는 남아 있지만(되살릴 수 있게)
 * 앱에서 도달할 길이 없다. 여기서 고정하는 것은 **도달 불가**다.
 */
test("내 기록으로 가는 길이 화면에 없다", async ({ page }) => {
  await skipFirstVisitNotice(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-testid="bottom-tab"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="my-record-empty"]')).toHaveCount(0);
  await expect(page.locator('a[href="/track-record"]')).toHaveCount(0);
});

test("콘솔 에러가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|stock-logo|ERR_|Failed to fetch|404|503|500/i.test(text)) return; // API 없는 환경 허용
    errors.push(text);
  });
  await page.goto("/track-record", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});
