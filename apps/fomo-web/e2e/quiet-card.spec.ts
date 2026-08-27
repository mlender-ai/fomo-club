import { expect, test } from "@playwright/test";

/**
 * 메인 카드 렌더 스모크 — WO-HOOK-01 완료 기준(§10) 중 **픽셀로만 확인되는 것**.
 *
 * 유닛 테스트는 계약을, 이 스펙은 화면을 지킨다. D5(카드 하단 96px 공백)가 6주를 버틴 이유가
 * 이것이다 — 조건부 렌더는 처음부터 맞았고, 높이를 차지한 것은 컨테이너였다. 재보면 드러난다.
 */

const PREVIEW = "/quiet-card-preview";
const BANNED = ["무효선", "내부자", "클러스터", "이 관점은 무효", "수급", "매집", "이례적", "관점"];
const ACCENT = "rgb(212, 255, 63)";
// WO-RESET-03 — d(시장역행) · e(거래량각성) 추가. 프리뷰 페이지의 CASES 와 같아야 한다.
const CASES = ["a", "b", "c", "d", "e", "min", "revealed", "returning"] as const;

async function heightOf(page: import("@playwright/test").Page, id: string): Promise<number> {
  const box = await page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"]`).boundingBox();
  return box?.height ?? 0;
}

/**
 * accent 를 쓰는 요소 중 **그림 블록 밖**에 있는 것의 수.
 *
 * §7 "형별로 한 곳" 은 DOM 노드 하나가 아니라 **자리 하나**를 뜻한다 — C형 연속 구간은 막대
 * 여러 개이고(§6-2), A형은 누적선과 끝점 원 둘 다 라임이다(§4-2). 노드 수를 세면 스펙이
 * 요구하는 그림 자체를 위반으로 잡는다. 그래서 세는 것은 **자리를 벗어난 accent** 다.
 */
async function accentOutsideFigure(page: import("@playwright/test").Page, id: string): Promise<string[]> {
  return page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"] *`).evaluateAll(
    (els, accent) =>
      els
        .filter((el) => {
          const style = getComputedStyle(el);
          const isAccent =
            style.color === accent || style.backgroundColor === accent || style.borderColor === accent;
          if (!isAccent) return false;
          // 그림 블록(A 차트 · B 비중 막대 · C 연속 막대) 안이면 규칙에 맞는 자리다.
          return !el.closest(
            '[data-testid="divergence-chart"], [data-testid="ratio-bar"], [data-testid="streak-bars"]'
          );
        })
        .map((el) => (el as HTMLElement).dataset.testid || el.tagName.toLowerCase()),
    ACCENT
  );
}

test("페이지가 렌더된다 — 빈 화면이 아니다", async ({ page }) => {
  const response = await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-testid="quiet-pick-card"]')).toHaveCount(CASES.length);
});

test("완료 기준 1 — 세 형이 각자의 그림을 그린다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-case="a"] [data-testid="divergence-chart"]')).toHaveCount(1);
  await expect(page.locator('[data-case="b"] [data-testid="ratio-bar"]')).toHaveCount(1);
  await expect(page.locator('[data-case="c"] [data-testid="streak-bars"]')).toHaveCount(1);
  // 형이 섞이지 않는다 — A 카드에 비중 막대가, B 카드에 연속 막대가 있으면 안 된다.
  await expect(page.locator('[data-case="a"] [data-testid="ratio-bar"]')).toHaveCount(0);
  await expect(page.locator('[data-case="b"] [data-testid="streak-bars"]')).toHaveCount(0);
});

test("완료 기준 2·4 — 앞면에 종목명·티커가 없고 CTA 가 그 사실을 말한다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  for (const id of ["a", "b", "c", "min"]) {
    const card = page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"]`);
    await expect(card.locator('[data-testid="pick-name"]')).toHaveCount(0);
    const text = await card.innerText();
    expect(text, `${id}: 종목명이 노출됐다`).not.toContain("빅텍");
    expect(text, `${id}: 종목코드가 노출됐다`).not.toContain("065450");
    expect(await card.locator('[data-testid="pick-cta"]').innerText()).toBe("어떤 회사인지 보기");
  }
});

test("완료 기준 3 — 해제된 카드는 종목명·티커를 보여주고 CTA 문구가 바뀐다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-case="revealed"] [data-testid="quiet-pick-card"]');
  await expect(card.locator('[data-testid="pick-name"]')).toHaveCount(1);
  const text = await card.innerText();
  expect(text).toContain("빅텍");
  expect(text).toContain("065450");
  expect(await card.locator('[data-testid="pick-cta"]').innerText()).toBe("자세히 보기");
});

test("가려도 국가·섹터·가격은 남는다 — 다 가리면 낚시가 된다 (§2-2)", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-case="a"] [data-testid="quiet-pick-card"]');
  const identity = await card.locator('[data-testid="pick-identity"]').innerText();
  expect(identity).toContain("한국");
  expect(identity).toContain("방산");
  expect(await card.innerText()).toContain("3,035원");
});

test("완료 기준 5 — accent 가 형별 1곳(그림)에만 있다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });

  // 그림 블록 밖에는 accent 가 단 하나도 없다.
  for (const id of ["a", "b", "c"]) {
    expect(await accentOutsideFigure(page, id), `${id}형: 그림 밖 accent`).toEqual([]);
  }

  // 그 자리가 어디인지도 고정한다 — 개수만 맞고 자리가 틀리면 규칙이 지켜진 게 아니다.
  // B형 accent 는 **막대의 채운 구간**이다(2026-08-24). 종전에는 52px 숫자의 글자색이었는데,
  // 카드 상단 `+5.7%` 옆에서 수익률로 읽혀 막대로 바꿨다. 캡션은 accent 가 아니다.
  const filled = page.locator('[data-case="b"] [data-testid="ratio-bar"] > div > span');
  expect(await filled.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ACCENT);
  const caption = page.locator('[data-case="b"] [data-testid="pick-ratio"]');
  expect(await caption.evaluate((el) => getComputedStyle(el).color)).not.toBe(ACCENT);

  // CTA·후킹·가격에는 없다.
  for (const id of ["a", "b", "c"]) {
    const cta = page.locator(`[data-case="${id}"] [data-testid="pick-cta"]`);
    expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor), `${id} CTA 배경`).not.toBe(ACCENT);
    expect(await cta.evaluate((el) => getComputedStyle(el).color), `${id} CTA 글씨`).not.toBe(ACCENT);
    const hook = page.locator(`[data-case="${id}"] [data-testid="pick-hook"]`);
    expect(await hook.evaluate((el) => getComputedStyle(el).color), `${id} 후킹`).not.toBe(ACCENT);
  }
});

test("완료 기준 6 — 칩도 근거 박스도 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-case="a"] [data-testid="quiet-pick-card"]');
  await expect(card.locator('[data-testid="pick-chips"]')).toHaveCount(0);
  await expect(card.locator('[data-testid="pick-evidence"]')).toHaveCount(0);
  // 보조는 2줄을 넘지 않는다.
  const lines = await card.locator('[data-testid="pick-support"] p').count();
  expect(lines).toBeLessThanOrEqual(2);
});

test("완료 기준 7 — A형 두 선이 실제로 벌어져 있다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const paths = page.locator('[data-case="a"] [data-testid="divergence-chart"] svg path');
  await expect(paths).toHaveCount(2);
  const [priceStroke, buyStroke] = await paths.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).stroke)
  );
  expect(priceStroke).toBe("rgb(74, 74, 72)"); // #4A4A48 주가
  expect(buyStroke).toBe(ACCENT); // 누적선만 accent

  /**
   * 갭 — 두 선의 **끝점 y** 가 충분히 떨어져 있어야 "역행"이 그림으로 읽힌다.
   * 픽스처는 주가 제자리 + 누적 우상향이므로 누적선 끝이 주가선 끝보다 확실히 위에 있어야 한다.
   */
  const ends = await paths.evaluateAll((els) =>
    els.map((el) => {
      const d = el.getAttribute("d") ?? "";
      const last = d.trim().split(/[ML]/).filter(Boolean).at(-1) ?? "";
      return Number.parseFloat(last.trim().split(/\s+/)[1] ?? "0");
    })
  );
  const [priceEndY, buyEndY] = ends;
  expect(buyEndY!, "누적선 끝점이 주가선보다 위에 있어야 한다").toBeLessThan(priceEndY! - 10);
});

/**
 * 완료 기준 8 개정 (2026-08-24) — B형은 52px 맨몸 숫자에서 **비중 막대**로 바뀌었다.
 *
 * 종전 단정은 "숫자가 화면에서 가장 크다" 였다. 그 크기가 문제였다: 카드 상단
 * `82,200원 +5.7%` 바로 아래 라임색 `14%` 가 오면 둘 다 퍼센트라 눈이 같은 종류로 묶어
 * **수익률로 읽힌다**(실측 화면 지적). 이제 후킹 문장이 크기를 말하고 막대가 몫을 보여준다.
 */
test("완료 기준 8 — B형은 비중 막대다: 채운 폭이 비율과 맞고 캡션이 무엇의 몫인지 말한다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const scope = page.locator('[data-case="b"]');

  // 채운 폭 / 전체 폭 ≈ 비율. 프리뷰 픽스처는 51% 다.
  const track = scope.locator('[data-testid="ratio-bar"] > div');
  const ratio = await track.evaluate((el) => {
    const fill = el.querySelector("span") as HTMLElement;
    return (fill.getBoundingClientRect().width / el.getBoundingClientRect().width) * 100;
  });
  expect(ratio).toBeGreaterThan(48);
  expect(ratio).toBeLessThan(54);

  // 캡션이 무엇의 몫인지 말한다 — 맨몸 숫자를 두지 않는다.
  const caption = await scope.locator('[data-testid="pick-ratio"]').innerText();
  expect(caption).toContain("하루 거래량");
  expect(caption).toContain("51%");

  // 화면에서 가장 큰 글자는 이제 후킹 문장이다.
  const hookSize = await scope
    .locator('[data-testid="pick-hook"]')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const sizes = await scope.locator('[data-testid="quiet-pick-card"] *').evaluateAll((els) =>
    els
      .filter((el) => (el.textContent ?? "").trim().length > 0)
      .map((el) => Number.parseFloat(getComputedStyle(el).fontSize))
  );
  expect(Math.max(...sizes)).toBe(hookSize);
});

test("완료 기준 9 — C형은 현재 연속 구간만 accent 다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const bars = page.locator('[data-case="c"] [data-testid="streak-bars"] > div > span');
  const total = await bars.count();
  expect(total).toBe(40);
  const colors = await bars.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  const accentIdx = colors.flatMap((c, i) => (c === ACCENT ? [i] : []));
  // 픽스처의 현재 연속 구간은 뒤쪽 6일이다 — 연속이고, 마지막 막대를 포함한다.
  expect(accentIdx).toEqual([34, 35, 36, 37, 38, 39]);
});

test("완료 기준 11 — 카드 높이가 내용에 따라 변한다 (고정 높이 없음)", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const min = await heightOf(page, "min");
  const c = await heightOf(page, "c");
  expect(min).toBeGreaterThan(0);
  // 같은 C형인데 보조 줄이 하나 붙으면 그만큼 길어진다 — 최소 높이가 남아 있으면 같아진다.
  expect(c).toBeGreaterThan(min);
});

test("완료 기준 12 — 세 형 모두 320px 에서 후킹이 3줄이 되지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  for (const id of CASES) {
    const hook = page.locator(`[data-case="${id}"] [data-testid="pick-hook"]`);
    const { height, lineHeight } = await hook.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(Math.round(height / lineHeight), `${id}형 후킹 줄수`).toBeLessThanOrEqual(2);
  }
});

test("CTA 는 하나이고 48px pill 이다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-case="a"] [data-testid="quiet-pick-card"]');
  // 앞면 ★ 가 상세로 갔으므로 버튼은 CTA 하나뿐이다(§8).
  await expect(card.locator("button")).toHaveCount(1);
  await expect(card.locator('[data-testid="pick-cta"]')).toHaveCount(1);
  const height = (await card.locator('[data-testid="pick-cta"]').boundingBox())?.height ?? 0;
  expect(Math.round(height)).toBe(48);
});

test("등락에 색을 쓰지 않는다 — 하락은 회색이다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const color = await page
    .locator('[data-case="a"] [data-testid="pick-change"]')
    .evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(122, 122, 118)"); // down #7A7A76
});

test("터치 타겟 — 탭 가능한 요소는 44px 이상이다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const buttons = await page.locator('[data-case="a"] [data-testid="quiet-pick-card"] button').all();
  for (const button of buttons) {
    const box = await button.boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(44);
  }
});

test("텍스트 총량이 줄었다 — 카드는 데이터 표가 아니다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const text = (await page.locator('[data-case="a"] [data-testid="quiet-pick-card"]').innerText()).replace(/\s+/g, "");
  /**
   * DS-01 카드(같은 픽스처)는 공백 제외 약 180자였다 — 종목명·티커·근거 3행·성적 블록.
   * WO-HOOK-01 은 정체를 가리고 근거 박스를 2줄로 줄였으므로 더 짧아야 한다.
   */
  expect(text.length).toBeLessThan(150);
});

test("같은 숫자가 카드 한 장에 3회 이상 나오지 않는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  for (const id of ["a", "b", "c"]) {
    const text = await page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"]`).innerText();
    const counts = new Map<string, number>();
    /**
     * 소수·천단위를 **한 값으로** 센다. `\d+` 로 쪼개면 `-1.5%` 와 `+13.1%` 가 `1` 을 공유해
     * 같은 값이 반복된 것처럼 보인다 — 이 규칙이 막는 것은 같은 **값**의 반복이다.
     */
    for (const n of text.match(/\d+(?:[.,]\d+)*/g) ?? []) counts.set(n, (counts.get(n) ?? 0) + 1);
    for (const [number, count] of counts) {
      expect(count, `${id}형: 숫자 ${number} 가 ${count}회 반복`).toBeLessThan(3);
    }
  }
});

test("완료 기준 10 — 고유어 수 표현이 화면에 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const text = await page.locator("main").innerText();
  for (const native of ["이틀", "사흘", "나흘", "닷새", "엿새", "이레", "여드레", "아흐레", "열흘"]) {
    expect(text, `고유어 "${native}" 가 화면에 노출됐다`).not.toContain(native);
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

/**
 * WO-RESET-03 — 카드 종류가 늘어도 규칙은 하나다.
 * D-1: 카드에 종류 라벨을 붙이지 않는다. D-4: 모든 종류에 그림이 있다.
 */
test("[완료 4·5] 새 형도 그림이 있고 카드에 종류 라벨이 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });

  for (const [id, figure] of [["d", "divergence-chart"], ["e", "volume-bars"]] as const) {
    const card = page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"]`);
    await expect(card.locator(`[data-testid="${figure}"]`)).toHaveCount(1);
    // 그림 아래 캡션/범례가 accent 의 뜻을 말한다.
    await expect(card.locator(`[data-testid="${figure}"] .font-mono`).first()).not.toBeEmpty();
  }

  // D형 회색선 범례는 **지수 이름**이다 — `주가` 로 남으면 두 선이 다 주가로 읽힌다.
  await expect(page.locator('[data-case="d"] [data-testid="divergence-chart"]')).toContainText("코스피");

  // 카드 본문에 종류 이름이 없다(D-1).
  for (const id of ["a", "b", "c", "d", "e"]) {
    const text = await page.locator(`[data-case="${id}"] [data-testid="quiet-pick-card"]`).innerText();
    for (const label of ["시장역행", "거래량각성", "자사주 매입", "공매도 축소", "실적 갭", "희소성", "비율"]) {
      expect(text, `${id}형 카드에 라벨 "${label}"`).not.toContain(label);
    }
  }
});

/**
 * WO-RESET-06 §B — 다시 나온 카드는 **처음 보는 카드와 똑같이 생기면 안 된다.**
 * 완료 확인 4·5·6·7.
 */
test("[완료 4·5·6·7] 다시 나온 카드는 라벨·새 훅·이름 공개·처음 가격을 갖는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-case="returning"]');

  // [완료 4] 상단 라벨 — 작게, 회색.
  const label = card.locator('[data-testid="pick-returning"]');
  await expect(label).toHaveText("다시 나왔어요");
  const color = await label.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(90, 90, 87)"); // text-3

  // [완료 5] 훅이 **무엇이 새로운가**를 말한다. 이어짐(N일째)을 말하지 않는다.
  const hook = await card.locator('[data-testid="pick-hook"]').innerText();
  expect(hook).toContain("외국인도 사기 시작했어요");
  expect(hook).not.toMatch(/일째/);

  // [완료 6] 종목명을 가리지 않는다 — 이미 본 종목이다.
  await expect(card.locator('[data-testid="pick-name"]')).toHaveCount(1);
  await expect(card).toHaveAttribute("data-case", "returning");

  // [완료 7] 처음 가격 → 지금 가격. 음수여도 그대로 나온다.
  const since = card.locator('[data-testid="pick-since-first"]');
  await expect(since).toContainText("8월 24일 처음 나왔을 때");
  await expect(since).toContainText("2,890원");
  await expect(since).toContainText("지금");
});

test("처음 나온 카드에는 그 어느 것도 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const first = page.locator('[data-case="a"]');
  await expect(first.locator('[data-testid="pick-returning"]')).toHaveCount(0);
  await expect(first.locator('[data-testid="pick-since-first"]')).toHaveCount(0);
  // 처음 보는 종목은 이름을 가린다 — 그 규칙은 그대로다.
  await expect(first.locator('[data-testid="pick-name"]')).toHaveCount(0);
});
