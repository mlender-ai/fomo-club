import { expect, test } from "@playwright/test";

/**
 * 상세 렌더 스모크 — **WO-HOOK-02** 완료 기준 중 픽셀로만 확인되는 것(DS-03 을 대체).
 *
 * 픽스처(`/quiet-depth-preview`)는 API 를 태우지 않는다. 그래서 ③ 회사 · ④ 값 · ⑥ 우리 기록이
 * **없는 것이 정상**이고, 이 스펙은 그 "없음"이 빈 헤더 없이 깔끔히 사라지는지도 함께 본다.
 */

const PREVIEW = "/quiet-depth-preview";
const ACCENT = "rgb(212, 255, 63)";

test("완료 기준 9·10 — 섹션은 7개 이하, 확보 안 된 섹션은 통째로 사라진다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="depth-hook"]')).toHaveCount(1);

  const titles = await page.locator("h2").allInnerTexts();
  expect(titles.length).toBeLessThanOrEqual(6); // 결론은 제목이 없다 → 총 7섹션 이하
  expect(titles).toContain("왜 지금 사는가");
  expect(titles).toContain("근거");
  expect(titles).toContain("틀리는 경우");

  // 데이터가 없는 섹션은 헤더도 남기지 않는다.
  for (const id of ["depth-company", "depth-value", "depth-our-record"]) {
    await expect(page.locator(`[data-testid="${id}"]`)).toHaveCount(0);
  }
  expect(titles).not.toContain("무슨 회사");
  expect(titles).not.toContain("값");
  expect(titles).not.toContain("우리 기록");
});

test("완료 기준 2 — 결론 문장이 화면에서 1회만 나온다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const hook = await page.locator('[data-testid="depth-hook"]').innerText();
  const body = await page.locator("body").innerText();
  const occurrences = body.split(hook).length - 1;
  expect(occurrences).toBe(1);
  expect(await page.locator('[data-testid="depth-hook"]').evaluate((el) => getComputedStyle(el).fontSize)).toBe("22px");
});

test("완료 기준 3·4 — 박스도 accent도 ⑥ 뿐이다 (여기선 둘 다 0)", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const counts = await page.locator("body *").evaluateAll(
    (els, accent) => ({
      accents: els.filter((el) => {
        const s = getComputedStyle(el);
        return s.color === accent || s.backgroundColor === accent;
      }).length,
      boxes: els.filter((el) => getComputedStyle(el).backgroundColor === "rgb(24, 24, 24)").length,
    }),
    ACCENT
  );
  // 우리 기록이 없는 화면에는 accent 도 박스도 없다 — 색을 다른 데로 옮기지 않는다.
  expect(counts.accents).toBe(0);
  expect(counts.boxes).toBe(0);
});

test("완료 기준 3 — 근거는 2줄 이하로 압축된다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const evidence = page.locator('[data-testid="depth-evidence"]');
  await expect(evidence).toHaveCount(1);
  /**
   * 종전 5줄(`누가/언제/얼마나 드문가/거래량/비중`)은 앞면 훅을 쪼개 다시 쓴 것이었다.
   * 이제 `매수` 한 줄에 주체·규모·연속일수를 합치고, `비교` 는 훅이 말하지 않았을 때만 붙는다.
   */
  const rows = await evidence.locator("> div").count();
  expect(rows).toBeLessThanOrEqual(2);
  const text = await evidence.innerText();
  expect(text).toContain("매수");
  expect(text).toContain("임원 3명 $2.8M");
  expect(text).toContain("5일 연속");
  expect(text).not.toContain("3명 · 3명");
  // 라벨 고정폭 88px.
  const labelWidth = await evidence.locator("span").first().evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(labelWidth).toBe(88);
});

/**
 * WO-HOOK-02 §2 — 상세가 답해야 하는 질문은 **왜 조용히 사고 있는가** 하나다.
 * 픽스처는 `가격`·`이력` 두 축을 갖도록 만들어져 있다(2축 최소 조건).
 */
test("완료 기준 1·2 — 왜 지금 사는가가 첫 섹션이고 꼬리표가 붙는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const why = page.locator('[data-testid="depth-why-now"]');
  await expect(why).toHaveCount(1);

  // 결론 다음, 근거보다 위.
  const y = async (sel: string) => (await page.locator(sel).first().boundingBox())?.y ?? 0;
  expect(await y('[data-testid="depth-why-now"]')).toBeGreaterThan(await y('[data-testid="depth-hook"]'));
  expect(await y('[data-testid="depth-why-now"]')).toBeLessThan(await y('[data-testid="depth-evidence"]'));

  // 2축 이상.
  expect(await why.locator("> div").count()).toBeGreaterThanOrEqual(2);

  // 꼬리표 — 인과가 아니라 동시 관측임을 화면이 말한다.
  const note = page.locator('[data-testid="depth-why-now-note"]');
  await expect(note).toContainText("함께 관측된");
  await expect(note).toContainText("확인할 수 없어요");

  // 인과 단정·평가·예측 표현이 없다.
  const text = await why.innerText();
  for (const banned of ["때문에", "로 인해", "호재", "악재", "저평가", "기회", "곧 오를"]) {
    expect(text, `금지 표현 "${banned}"`).not.toContain(banned);
  }

  // 박스도 accent 도 없다(§2-4 · 완료 기준 8).
  const styles = await why.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color };
  });
  expect(styles.bg).not.toBe("rgb(24, 24, 24)");
  expect(styles.color).not.toBe(ACCENT);
});

test("③ 헤더 — 56px, 뒤로 화살표 44×44, ★ 도 하단 CTA 도 없음", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  // 가격은 카드와 같은 포맷터를 쓴다 — 미국 종목이 `4.945` 로 나오면 무슨 통화인지 알 수 없다.
  await expect(page.locator('[data-testid="depth-header"]')).toContainText("$4.945");
  const header = page.locator('[data-testid="depth-header"]');
  // 헤더 행은 56px, 그 아래 0.5px 헤어라인이 더해진다(측정값 56.5 → 57 로 반올림).
  const inner = header.locator("> div");
  expect(Math.round((await inner.boundingBox())?.height ?? 0)).toBe(56);
  // 데스크톱에서 퍼지지 않는다 — 본문과 같은 폭으로 중앙 정렬.
  const innerWidth = Math.round((await inner.boundingBox())?.width ?? 0);
  expect(innerWidth).toBeLessThanOrEqual(576);

  const back = page.getByLabel("뒤로");
  const box = await back.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(44);
  expect(Math.round(box?.height ?? 0)).toBe(44);

  // 관심(★)을 없앴다(WO-RESET-01 A-3) — 「내 기록」이 사라져 등록해도 볼 곳이 없다.
  await expect(page.getByLabel("관심")).toHaveCount(0);
  await expect(page.getByLabel("관심 해제")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("자세히 보기");
});

test("콘솔 에러가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|stock-logo|ERR_|Failed to fetch|404/i.test(text)) return; // 픽스처는 API 를 안 태운다
    errors.push(text);
  });
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
});
