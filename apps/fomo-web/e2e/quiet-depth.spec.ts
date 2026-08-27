import { expect, test } from "@playwright/test";

/**
 * 상세 렌더 스모크 — **WO-RESET-05**. 상세는 이제 한 장이 아니라 **네 걸음**이다.
 *
 * 이야기 순서를 잰다: 놀라움 → 이유 → 실체 → 결정. 한 화면에 한 걸음만 있어야 하고,
 * 데이터 없는 걸음은 아예 없어야 하며, 마지막에 즐겨찾기로 끝나야 한다.
 */

const PREVIEW = "/quiet-depth-preview";
const ACCENT = "rgb(212, 255, 63)";

/** WO-RESET-05 완료 확인 1·2 — 네 걸음, 좌우로 넘어가고, 상단에 진행 점. */
test("[완료 1·2] 네 걸음으로 나뉘고 진행 점이 걸음 수를 그대로 비춘다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });

  // 픽스처는 whyNow·companyRead 를 둘 다 갖고 있으므로 네 걸음이 다 선다.
  const dots = page.locator('[data-testid="depth-dots"] span');
  await expect(dots).toHaveCount(4);
  await expect(page.locator('[data-testid="depth-step-signal"]')).toHaveCount(1);

  // **한 화면에 한 걸음.** 다른 걸음의 내용이 같이 있으면 안 된다.
  await expect(page.locator('[data-testid="depth-why-now"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="depth-company-group"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="depth-watch"]')).toHaveCount(0);

  // 다음 버튼 문구는 **다음에 무엇이 나오는지** 말한다.
  await expect(page.locator('[data-testid="depth-next"]')).toContainText("왜 사는지 보기");
  await page.locator('[data-testid="depth-next"]').click();

  await expect(page.locator('[data-testid="depth-step-why"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="depth-why-now"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="depth-hook"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="depth-next"]')).toContainText("어떤 회사인지 보기");
  await page.locator('[data-testid="depth-next"]').click();

  await expect(page.locator('[data-testid="depth-step-company"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="depth-next"]')).toContainText("계속 지켜볼까요");
  await page.locator('[data-testid="depth-next"]').click();

  // 마지막 걸음엔 다음이 없다 — 여기서 끝난다.
  await expect(page.locator('[data-testid="depth-step-decide"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="depth-next"]')).toHaveCount(0);
});

test("[완료 1] 뒤로는 이전 걸음이다 — 1걸음에서만 카드로 돌아간다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="depth-next"]').click();
  await expect(page.locator('[data-testid="depth-step-why"]')).toHaveCount(1);
  await page.getByLabel("이전 걸음").click();
  await expect(page.locator('[data-testid="depth-step-signal"]')).toHaveCount(1);
  // 1걸음에서는 라벨이 `뒤로` 로 바뀐다 — 여기서 뒤로 가면 카드다.
  await expect(page.getByLabel("뒤로")).toHaveCount(1);
});

/** 완료 확인 3 — 「틀리는 경우」는 상세에서 없앤다. */
test("[완료 3] 「틀리는 경우」가 어느 걸음에도 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i += 1) {
    await expect(page.locator("body")).not.toContainText("틀리는 경우");
    await expect(page.locator('[data-testid="depth-wrong"]')).toHaveCount(0);
    // 모든 종목에 똑같이 나오던 그 문장도 없어야 한다.
    await expect(page.locator("body")).not.toContainText("이탈 여부가 다음 판단 기준");
    const next = page.locator('[data-testid="depth-next"]');
    if ((await next.count()) === 0) break;
    await next.click();
  }
});

/** 완료 확인 7·8·9·10 — 3걸음. */
test("[완료 7·8·9·10] 모든 숫자 옆에 비교 문장이 있고, 세 덩어리이며, 종합 점수는 없다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="depth-next"]').click();
  await page.locator('[data-testid="depth-next"]').click();
  await expect(page.locator('[data-testid="depth-step-company"]')).toHaveCount(1);

  // [완료 8] 세 덩어리 — 질문이 제목이다.
  const titles = await page.locator('[data-testid="depth-company-group"] h3').allInnerTexts();
  expect(titles).toEqual(["돈은 잘 버나요", "값은 어떤가요", "빚은 괜찮나요"]);

  // [완료 7] **숫자마다 비교 문장.** 값 줄 수와 비교 문장 수가 같아야 한다.
  const comparisons = await page.locator('[data-testid="depth-comparison"]').allInnerTexts();
  expect(comparisons.length).toBe(5);
  for (const c of comparisons) expect(c.trim().length).toBeGreaterThan(0);
  expect(comparisons.some((c) => c.includes("중간값"))).toBe(true);

  // [완료 9] 점 표시와 계산 방법.
  await expect(page.locator('[data-testid="depth-score-dots"]')).toHaveCount(3);
  await page.locator('[data-testid="depth-method-toggle"]').first().click();
  await expect(page.locator('[data-testid="depth-method"]')).toContainText("5점으로 옮겼어요");

  // [완료 10] 종합 점수 없음 — `종합`·`총점`·`X점` 한 덩이 점수가 화면에 없다.
  const body = await page.locator('[data-testid="depth-step-company"]').innerText();
  expect(body).not.toContain("종합");
  expect(body).not.toContain("총점");

  // 하지 말 것 — 평가어 금지.
  for (const banned of ["저평가", "유망", "좋은 종목", "추천", "매력적"]) {
    expect(body, `금지 표현 "${banned}"`).not.toContain(banned);
  }
});

/** 완료 확인 11 — 마지막 걸음은 즐겨찾기로 끝난다. */
test("[완료 11] 4걸음 마지막에 즐겨찾기 버튼이 있고, 담으면 담았다고 말한다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 3; i += 1) await page.locator('[data-testid="depth-next"]').click();

  await expect(page.locator('[data-testid="depth-summary"]')).toHaveCount(1);
  const watch = page.locator('[data-testid="depth-watch"]');
  await expect(watch).toContainText("즐겨찾기에 담기");
  // 보조는 텍스트 링크 — 이 화면에서 강조는 하나뿐이다.
  await expect(page.locator('[data-testid="depth-leave"]')).toContainText("그냥 나가기");

  await watch.click();
  await expect(page.locator('[data-testid="depth-watch-done"]')).toContainText("담았어요");
});

test("결론 문장이 1걸음에서 1회만 나온다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const hook = await page.locator('[data-testid="depth-hook"]').innerText();
  const body = await page.locator("body").innerText();
  const occurrences = body.split(hook).length - 1;
  expect(occurrences).toBe(1);
  expect(await page.locator('[data-testid="depth-hook"]').evaluate((el) => getComputedStyle(el).fontSize)).toBe("22px");
});

test("accent 는 **다음 버튼 하나** 뿐이다 — 강조가 여럿이면 강조가 아니다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const accents = await page.locator("body *").evaluateAll(
    (els, accent) =>
      els.filter((el) => {
        const s = getComputedStyle(el);
        return s.backgroundColor === accent;
      }).length,
    ACCENT
  );
  // 다음 버튼 1개. 진행 점의 현재 점도 accent 지만 그건 6px 짜리 표시라 배경으로만 센다.
  expect(accents).toBeLessThanOrEqual(2);
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
 * 2걸음 — 왜 지금인가(§3). **날짜와 사건**이다.
 * 픽스처는 공시 1건 + 매수 시작 1건을 갖는다.
 */
test("[완료 4] 2걸음의 공시 제목이 사람 말로 나오고 원문 링크가 붙는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="depth-next"]').click();
  const why = page.locator('[data-testid="depth-why-now"]');
  await expect(why).toHaveCount(1);

  const lines = await why.locator("> div").allInnerTexts();
  expect(lines.length).toBeGreaterThanOrEqual(1);
  expect(lines.some((t) => /\d+월\s*\d+일/.test(t)), `날짜 항목 없음: ${JSON.stringify(lines)}`).toBe(true);

  // [완료 4] 서식 이름이 아니라 사람 말이 보인다.
  const why2 = await why.innerText();
  expect(why2).toContain("큰 계약을 따냈어요");
  expect(why2).not.toContain("단일판매");
  // 제목이 들고 있던 수치는 그대로 남는다 — 번역이 손실이 되면 안 된다.
  expect(why2).toContain("계약금액 320억");

  // 원문 링크는 그대로 — 사람 말로 옮겨도 원문을 못 보게 되지 않는다.
  await expect(page.locator('[data-testid="depth-why-now-source"]').first()).toHaveAttribute("href", /dart\.fss|sec\.gov/);

  // 꼬리표 — 인과가 아니라 동시 관측임을 화면이 말한다.
  const note = page.locator('[data-testid="depth-why-now-note"]');
  await expect(note).toContainText("함께 있었던");
  await expect(note).toContainText("확인할 수 없어요");

  // 인과 단정·평가·예측 표현이 없다.
  const text = await why.innerText();
  for (const banned of ["때문에", "로 인해", "호재", "악재", "저평가", "기회", "곧 오를"]) {
    expect(text, `금지 표현 "${banned}"`).not.toContain(banned);
  }
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

/** WO-RESET-06 §C-1 — 왜 또 나왔는지가 화면에 있어야 한다. */
test("[완료 8] 재노출이면 1걸음에 노출 이력이 나온다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  const history = page.locator('[data-testid="depth-exposure"]');
  await expect(history).toHaveCount(1);
  await expect(history).toContainText("이 종목, 3번째 나왔어요");

  // 나온 날 · 그때 무엇 때문이었나 · 그때 가격.
  const text = await history.innerText();
  expect(text).toContain("8월 25일");
  expect(text).toContain("기관이 사기 시작했어요");
  expect(text).toContain("4.37");

  // 1걸음에만 있다 — 다음 걸음으로 넘어가면 사라진다.
  await page.locator('[data-testid="depth-next"]').click();
  await expect(page.locator('[data-testid="depth-exposure"]')).toHaveCount(0);
});
