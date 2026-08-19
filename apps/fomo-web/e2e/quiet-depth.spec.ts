import { expect, test } from "@playwright/test";

/**
 * 상세 렌더 스모크 — DS-03 완료 기준 중 **픽셀로만 확인되는 것**.
 *
 * 픽스처(`/quiet-depth-preview`)는 API 를 태우지 않는다. 그래서 ③ 회사 · ④ 값 · ⑥ 우리 기록이
 * **없는 것이 정상**이고, 이 스펙은 그 "없음"이 빈 헤더 없이 깔끔히 사라지는지도 함께 본다.
 */

const PREVIEW = "/quiet-depth-preview";
const ACCENT = "rgb(212, 255, 63)";

test("완료 기준 1·8 — 섹션은 6개 이하, 확보 안 된 섹션은 통째로 사라진다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="depth-hook"]')).toHaveCount(1);

  const titles = await page.locator("h2").allInnerTexts();
  expect(titles.length).toBeLessThanOrEqual(5); // ① 결론은 제목이 없다 → 총 6섹션 이하
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

test("② 근거 — 라벨-값 2열, 중복 출력 없음 (완료 기준 9)", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const evidence = page.locator('[data-testid="depth-evidence"]');
  await expect(evidence).toHaveCount(1);
  const text = await evidence.innerText();
  expect(text).toContain("임원 3명 · $2.8M");
  expect(text).not.toContain("3명 · 3명");
  // 라벨 고정폭 88px.
  const labelWidth = await evidence.locator("span").first().evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(labelWidth).toBe(88);
});

test("③ 헤더 — 56px, 뒤로 화살표 44×44, 하단 CTA 없음", async ({ page }) => {
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

  // 관심은 헤더 우측 별. 하단 CTA 버튼은 없다(§10).
  await expect(page.getByLabel("관심")).toHaveCount(1);
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
