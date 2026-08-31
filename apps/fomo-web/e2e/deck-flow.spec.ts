import { expect, test, type Page } from "@playwright/test";

/**
 * **덱을 실제로 넘겨본다** — DS-07 §4, 2026-08-31 지시 4·5·6.
 *
 * 순환·닫으면 다음 장·정체 해제는 지금까지 **소스 검사로만** 확인하고 있었다. 그런데
 * DS-07 §6 이 스스로 못 박은 규칙이 "프리뷰에서 실제로 재고 판정한다. 소스만 보고
 * 통과시키지 않는다" 다. 여기서 손가락을 실제로 움직여 확인한다.
 *
 * 덱은 자기 데이터를 직접 받아오므로 응답을 가로채 **3장짜리 덱**을 세운다. 3장이면
 * 한 바퀴가 짧아 순환을 눈으로 셀 수 있다.
 */

/**
 * 세 장을 **구분 가능하게** 만든다. 처음엔 셋을 똑같이 두고 훅 문장으로 갈랐는데, 훅은
 * 서버 문장이 아니라 카드형이 신호에서 만들어내는 값이라 세 장이 같은 문장을 냈다 —
 * 넘어갔는지 안 넘어갔는지 구분이 안 됐다. 픽스처가 직접 정하는 값(`identity`)으로 가른다.
 */
function pick(canonical: string, name: string, days: number, identity: string) {
  return {
    subject: {
      canonical,
      displayName: name,
      ticker: canonical,
      symbol: canonical,
      market: "KOSPI",
      country: "KR",
      identity,
    },
    price: { current: 3035, currentText: "3,035", changePct: -1.5, sparkline: [] },
    signal: {
      kind: "institution_streak",
      code: "institution_streak",
      actors: "기관",
      scale: "74주",
      days,
      priceAtSignal: 3080,
      startedAt: "2026-08-01",
      strength: 300,
    },
    anomalies: [],
    support: [],
    qualifiedAt: "2026-08-31",
  };
}

const DECK = {
  picks: [
    pick("AAA", "가나다전자", 25, "방산"),
    pick("BBB", "라마바화학", 12, "화학"),
    pick("CCC", "사아자정밀", 40, "정밀기기"),
  ],
  flowCards: [],
  macroCards: [],
  watching: [],
  asOf: "2026-08-31T00:10:00.000Z",
  source: "e2e-fixture",
};

/** 면책 고지를 미리 동의 처리한다 — 이 테스트가 보려는 것은 고지가 아니다. */
async function openDeck(page: Page) {
  await page.route("**/api/fomo/quiet-picks*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DECK) })
  );
  await page.route("**/api/fomo/card-slots*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ slots: [] }) })
  );
  await page.addInitScript(() => {
    window.localStorage.setItem("fomo_notice_ack_v1", "2026-08-31T00:00:00.000Z");
    window.localStorage.removeItem("fomo_card_revealed");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="quiet-pick-card"]')).toHaveCount(1);
}

/** 현재 카드가 누구인지 — 가려진 동안 보이는 것은 국가·업종 한 줄이다. */
const who = (page: Page) => page.locator('[data-testid="pick-identity"]').innerText();

/** 실제 포인터로 스와이프한다. `setPointerCapture` 를 쓰므로 합성 이벤트로는 안 된다. */
async function swipe(page: Page, dir: "next" | "prev") {
  const stage = (await page.locator('[data-testid="quiet-pick-card"]').boundingBox())!;
  const y = stage.y + 60;
  const from = dir === "next" ? stage.x + stage.width - 20 : stage.x + 20;
  const to = dir === "next" ? stage.x + 20 : stage.x + stage.width - 20;
  await page.mouse.move(from, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from + ((to - from) * i) / 6, y);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test("[지시 4] 마지막 장에서 넘기면 첫 장으로 돌아온다", async ({ page }) => {
  await openDeck(page);
  const first = await who(page);

  const seen = [first];
  for (let i = 0; i < 2; i++) {
    await swipe(page, "next");
    seen.push(await who(page));
  }
  // 세 장이 서로 다르다 — 덱이 실제로 넘어갔다는 뜻이다.
  expect(new Set(seen).size).toBe(3);

  // 마지막 장에서 한 번 더 → 첫 장.
  await swipe(page, "next");
  expect(await who(page)).toBe(first);

  // 첫 장에서 뒤로 → 마지막 장. 반대 방향으로도 끝이 없다.
  await swipe(page, "prev");
  expect(await who(page)).toBe(seen[2]);
});

test("[지시 5·6] 상세를 닫으면 다음 장이 나오고, 본 카드는 종목명이 보인다", async ({ page }) => {
  await openDeck(page);
  const first = await who(page);

  // 열기 전에는 가려져 있다 — 종목명 대신 국가·업종 한 줄.
  await expect(page.locator('[data-testid="quiet-pick-card"]')).toHaveAttribute("data-revealed", "false");
  await expect(page.locator('[data-testid="pick-name"]')).toHaveCount(0);

  await page.locator('[data-testid="pick-cta"]').click();
  await expect(page.locator('[data-testid="depth-bar"]')).toHaveCount(1);

  // 닫으면 **방금 본 카드가 아니라 다음 카드**가 나온다.
  await page.locator('[aria-label="뒤로"]').click();
  await expect(page.locator('[data-testid="depth-bar"]')).toHaveCount(0);
  // 넘김은 이탈 애니메이션이 끝난 뒤에 일어난다 — 카드가 바뀌기를 기다린다.
  await expect.poll(() => who(page)).not.toBe(first);

  // 한 바퀴 돌아 그 카드로 되돌아오면 이제 종목명이 보인다.
  await swipe(page, "next");
  await swipe(page, "next");
  expect(await who(page)).toBe(first);
  await expect(page.locator('[data-testid="quiet-pick-card"]')).toHaveAttribute("data-revealed", "true");
  await expect(page.locator('[data-testid="pick-name"]')).toContainText("가나다전자");
});
