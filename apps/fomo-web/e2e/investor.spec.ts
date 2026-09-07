import { test, expect } from "@playwright/test";

/**
 * INFLUENCER-01 D-2·E — 인물 걸음과 인물 페이지.
 *
 * 픽스처는 2026-09-04 ARK 실측(4펀드 합산 90종목)에서 가져왔다. 포트폴리오는 API 로 오는
 * 재료라 프리뷰가 주입한다(새 라우트가 배포되기 전에도 화면을 고정할 수 있게).
 */
const PREVIEW = "/quiet-investor-preview";

test("[INFLUENCER-01 D-2] 2걸음이 그 사람의 최근 매매와 상위 보유를 보여준다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });

  // 다음 버튼이 무엇이 나오는지 말한다 — 이름 조사가 맞아야 한다(`캐시 우드는`).
  const next = page.locator('[data-testid="depth-next"]');
  await expect(next).toContainText("캐시 우드는 요즘 뭘 사나");
  await next.click();

  await expect(page.locator('[data-testid="depth-step-investor"]')).toHaveCount(1);
  // 공시일을 숨기지 않는다 — 13F 는 원래 늦게 나오는 물건이다(WO 하지 말 것).
  await expect(page.locator('[data-testid="depth-investor-asof"]')).toContainText("9월 4일 기준");

  const bought = page.locator('[data-testid="depth-investor-bought"]');
  await expect(bought).toContainText("TTM TECHNOLOGIES");
  await expect(bought).toContainText("새로 샀어요");
  // **매도도 보여준다** — 「팔았다」가 더 강할 때가 있다(§C-2).
  await expect(page.locator('[data-testid="depth-investor-sold"]')).toContainText("전부 팔았어요");
  await expect(page.locator('[data-testid="depth-investor-top"]')).toContainText("TSLA 7.1%");

  const body = await page.locator('[data-testid="depth-step-investor"]').innerText();
  // `따라 사세요` 류가 없다(WO 하지 말 것) · 인물 사진도 쓰지 않는다(§C-3).
  for (const banned of ["따라", "사세요", "추천", "매수하", "목표가"]) {
    expect(body, `금지 표현 "${banned}"`).not.toContain(banned);
  }
  await expect(page.locator('[data-testid="depth-step-investor"] img')).toHaveCount(0);
});

test("[INFLUENCER-01 E] 인물 페이지가 상세 안에서 열리고 전체 포트폴리오를 보여준다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="depth-next"]').click();
  await page.locator('[data-testid="depth-investor-portfolio-open"]').click();

  const overlay = page.locator('[data-testid="investor-portfolio"]');
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toContainText("90개");
  await expect(overlay).toContainText("$6.2B");
  // 비중 순 · 증감 열.
  const rows = page.locator('[data-testid="investor-portfolio-rows"] > div');
  expect(await rows.count()).toBeGreaterThan(2);
  await expect(rows.first()).toContainText("TSLA");
  await expect(rows.first()).toContainText("+0.3%p");
  // 비중 열의 소수 자리가 흔들리지 않는다(`4%` 와 `4.9%` 가 섞이면 열이 어긋난다).
  const weights = (await rows.allInnerTexts()).map((t) => t.match(/\d+\.\d%/)?.[0]);
  expect(weights.every(Boolean), `소수 한 자리가 아닌 비중: ${weights.join(", ")}`).toBe(true);

  /**
   * 하단 바가 이 화면 위로 뚫고 나오지 않는다 — FIX-03 PART C 에서 겪은 것과 같은 종류다
   * (다른 층의 버튼이 이 화면 것처럼 보이는 문제).
   */
  const hit = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 30);
    return Boolean(el?.closest('[data-testid="depth-bar"]'));
  });
  expect(hit, "하단 바가 인물 페이지 위에 있다").toBe(false);

  // 별도 탭이 아니다 — 닫으면 있던 걸음으로 돌아온다(WO 하지 말 것: 별도 탭 금지).
  expect(page.url()).toContain(PREVIEW);
  await page.locator('[data-testid="investor-portfolio-close"]').click();
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('[data-testid="depth-step-investor"]')).toHaveCount(1);
});

test("[INFLUENCER-01 E] 열 수 없는 종목 줄은 눌리지 않는다", async ({ page }) => {
  /**
   * 오늘 덱에 없는 티커는 가격·캔들·회사 정보가 없어 상세를 열 수 없다. 눌러도 아무 일
   * 없는 줄을 만들지 않는다 — 프리뷰는 `resolveStock` 을 주지 않으므로 전부 안 눌린다.
   */
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="depth-next"]').click();
  await page.locator('[data-testid="depth-investor-portfolio-open"]').click();
  await expect(page.locator('[data-testid="investor-portfolio-rows"] [data-tappable]')).toHaveCount(0);
});

test("콘솔 에러가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="depth-next"]').click();
  await page.locator('[data-testid="depth-investor-portfolio-open"]').click();
  await page.waitForTimeout(400);
  expect(errors.filter((e) => !/favicon|404/.test(e))).toEqual([]);
});
