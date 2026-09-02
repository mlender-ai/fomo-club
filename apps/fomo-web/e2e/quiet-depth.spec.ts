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

test("[DETAIL-02] 실적 공시가 실제 숫자·전년 동기 대비·한 줄 해석을 들고 온다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="depth-next"]').click();
  const why = page.locator('[data-testid="depth-why-now"]');
  const text = await why.innerText();

  // 완료 1 — 매출·영업이익·순이익 숫자가 나온다.
  for (const label of ["매출", "영업이익", "순이익"]) {
    expect(text, `${label} 줄 없음`).toContain(label);
  }
  expect(text).toContain("1,240억");

  // 완료 2·3 — 전년 동기 대비 증감률과 흑자 전환 문장.
  expect(text).toContain("작년 2분기보다 +18%");
  expect(text).toContain("흑자로");

  // 완료 4 — 한 줄 해석. 완료 5 — 평가 표현이 없다.
  await expect(page.locator('[data-testid="depth-why-now-headline"]').first())
    .toContainText("매출 늘고 영업이익 흑자로 돌아섰어요");
  for (const banned of ["좋았어요", "호실적", "실적이 개선"]) {
    expect(text, `평가 표현 "${banned}"`).not.toContain(banned);
  }

  // 완료 6 — 금액이 규모 대비로 환산되고, 분자가 계약 총액임을 문장이 말한다.
  await expect(page.locator('[data-testid="depth-why-now-scale"]').first())
    .toContainText("계약금액이 최근 1년 매출의 26%");

  // 기간 라벨이 해석보다 **먼저** 온다 — 반기 제목 아래 분기 숫자를 놓기 때문이다.
  const periodBox = await page.locator('[data-testid="depth-why-now-period"]').first().boundingBox();
  const headlineBox = await page.locator('[data-testid="depth-why-now-headline"]').first().boundingBox();
  expect(periodBox!.y).toBeLessThan(headlineBox!.y);

  // 완료 8 — 원문 링크는 제목 옆이 아니라 **같은 항목의 맨 아래**로 밀린다.
  await expect(page.locator('[data-testid="depth-why-now-source"]').first()).toContainText("공시 원문");
  const figures = page.locator('[data-testid="depth-why-now-figures"]').first();
  // 같은 항목 안에서 비교해야 한다 — 다른 항목의 링크와 견주면 좌표 비교가 뜻을 잃는다.
  const row = figures.locator("xpath=..");
  const figuresBox = await figures.boundingBox();
  const sourceBox = await row.locator('[data-testid="depth-why-now-source"]').boundingBox();
  expect(sourceBox!.y).toBeGreaterThan(figuresBox!.y + figuresBox!.height - 1);
});

test("[DETAIL-02] 투자조언 면책이 **네 걸음 전부**에 있다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });

  /**
   * 인과 면책(`왜 샀는지는 확인할 수 없어요`)만으로는 부족하다 — 그건 다른 말이다.
   * 그리고 걸음은 **상호 배타 렌더**라, 마지막 걸음에만 두면 재무 수치를 읽고 나가는
   * 경로에 면책이 한 번도 걸리지 않는다(오버레이는 어느 걸음에서든 닫을 수 있다).
   */
  const disclaimer = page.locator('[data-testid="depth-disclaimer"]');
  for (let step = 0; step < 4; step += 1) {
    // `toHaveCount(1)` 은 양방향이다 — 걸음 안으로 되돌리면 2, 지우면 0 이라 둘 다 터진다.
    await expect(disclaimer, `${step + 1}걸음에 면책 없음`).toHaveCount(1);
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText("투자 조언이 아니에요");
    if (step === 1) {
      // 수치가 실제로 나오는 걸음 — 면책이 같은 화면에 있어야 한다.
      await expect(page.locator('[data-testid="depth-why-now-figures"]').first()).toBeVisible();
    }
    if (step < 3) await page.locator('[data-testid="depth-next"]').click();
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

/**
 * **DS-07 §3 — 하단 고정 바.**
 *
 * 진행 버튼이 본문 끝에 있던 종전 구조는 걸음마다 버튼 높이가 달라지고, 긴 걸음에서는
 * 스크롤을 끝까지 내려야 넘어갈 수 있었다. 바를 화면 아래에 고정하고 걸음에 따라 내용만
 * 바꾼다. 재는 것 셋: **아래끝에 붙어 있는가**, **넘김 버튼 자리가 같은가**, **본문
 * 마지막 줄을 가리지 않는가.**
 */
test("[DS-07 §3] 하단 바가 아래끝에 붙어 있고 본문을 가리지 않는다", async ({ page }) => {
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });

  /**
   * 진입 애니메이션(`ds-sheet-up`, 300ms)이 끝나기를 기다린다. 시트가 밀려 올라오는 동안은
   * `transform` 이 걸려 있어 `fixed` 인 바도 시트를 따라 올라온다 — **그게 맞다.** 바는
   * 시트의 일부로 같이 들어와야 한다. 재는 것은 들어온 뒤의 자리다.
   */
  const sheet = page.locator('[data-testid="depth-header"]').locator("xpath=..");
  await sheet.waitFor();
  await sheet.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
  });

  const bar = page.locator('[data-testid="depth-bar"]');
  const viewport = page.viewportSize()!;
  /** 바 아래끝이 화면 아래끝인가. 세이프 에어리어를 더해도 바 밑에 빈틈이 없어야 한다. */
  const pinned = async () => {
    const box = (await bar.boundingBox())!;
    return Math.round(box.y + box.height);
  };
  const barTop = async () => Math.round((await bar.boundingBox())!.y);
  /** 본문 마지막 줄이 바 위에 있는가 — `BOTTOM_PAD` 가 바 높이를 못 따라가면 여기서 걸린다. */
  const lastLineClears = async () => {
    const body = page.locator('[data-testid="depth-scroll"]');
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const bottom = await body.evaluate((el) => {
      const last = el.lastElementChild?.getBoundingClientRect();
      return last ? Math.round(last.bottom) : 0;
    });
    return bottom <= (await barTop());
  };

  expect(await pinned()).toBe(viewport.height);
  const nextTop = await barTop();
  expect(await lastLineClears()).toBe(true);

  // 넘김 버튼만 담은 세 걸음에서는 바 높이도 자리도 완전히 같다.
  for (const label of ["왜 사는지 보기", "어떤 회사인지 보기"]) {
    await expect(page.locator('[data-testid="depth-next"]')).toContainText(label);
    await page.locator('[data-testid="depth-next"]').click();
    expect(await barTop()).toBe(nextTop);
    expect(await pinned()).toBe(viewport.height);
    expect(await lastLineClears()).toBe(true);
  }

  /**
   * 마지막 걸음은 즐겨찾기(44px) + 나가기 링크(36px)를 쌓으므로 **바가 더 높다.** 위끝이
   * 올라가는 것은 정상이고, 지켜야 하는 것은 두 가지다 — 아래끝이 그대로 붙어 있는가,
   * 그리고 높아진 바가 본문 마지막 줄을 먹지 않는가.
   */
  await expect(page.locator('[data-testid="depth-next"]')).toContainText("계속 지켜볼까요");
  await page.locator('[data-testid="depth-next"]').click();
  await expect(page.locator('[data-testid="depth-next"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="depth-watch"]')).toHaveCount(1);
  expect(await pinned()).toBe(viewport.height);
  expect(await barTop()).toBeLessThan(nextTop);
  expect(await lastLineClears()).toBe(true);
});
