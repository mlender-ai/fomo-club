import { describe, expect, it } from "vitest";
import {
  buildCardFrontHook,
  computeFomoScore,
  isEverydayHookText,
  isFrontHookSafe,
  selectFomoHook,
  signalsFromBasics,
  translateTaFact,
  type CardFrontSignals,
  type FomoCatalyst,
  type StockBasics,
  type TaFact,
} from "../src";

describe("buildCardFrontHook rev2 — FOMO 강도 모델(§2·§3)", () => {
  it("최고 강도 앵글 선택 — 수급 연속(사회적 증거 ★최강)이 테마보다 위", () => {
    const h = buildCardFrontHook({
      foreignNetStreak: 5,
      institutionNetStreak: 4,
      themeProminenceRank: 2,
      themeLabel: "AI 메모리",
    });
    expect(h.angle).toBe("social");
    expect(h.headline).toContain("담는 중");
    expect(h.intensity).toBe("high");
  });

  it("고정 우선순위 아님 — 수급 없고 테마 1위면 '판이 큼' 앵글", () => {
    const h = buildCardFrontHook({ themeProminenceRank: 1, themeLabel: "원전 슈퍼사이클" });
    expect(h.angle).toBe("big");
    expect(h.headline).toContain("원전 슈퍼사이클");
    expect(h.headline).toContain("1위");
  });

  it("D-day — 임박 일정이 있으면 강하게(지금 봐야)", () => {
    const cat: FomoCatalyst[] = [{ label: "2분기 실적 발표", when: "7월 말", kind: "schedule" }];
    const h = buildCardFrontHook({ catalysts: cat, themeProminenceRank: 3 });
    expect(h.angle).toBe("dday");
    expect(h.headline).toContain("7월 말");
    expect(h.headline).toContain("2분기 실적 발표");
  });

  it("의외성 — 가격 조용한데 테마 큰 인지 갭", () => {
    const h = buildCardFrontHook({ changePct: 0.4, themeProminenceRank: 2, themeLabel: "HBM" });
    expect(["surprise", "big"]).toContain(h.angle);
  });

  it("강도 비례 톤(§3) — 약한 신호는 calm, 강한 신호는 high", () => {
    expect(buildCardFrontHook({ near52WeekHigh: true }).intensity).not.toBe("high");
    expect(buildCardFrontHook({ foreignNetStreak: 6, volumeRatio: 3 }).intensity).toBe("high");
  });

  it("조용한 종목 — '잠잠'으로 끝내지 않고 다음 재료를 보여준다", () => {
    const withNext = buildCardFrontHook({
      catalysts: [{ label: "신제품 출시 컨퍼런스", when: "8월", kind: "schedule" }],
    });
    expect(withNext.angle).toBe("dday"); // 일정이 있으면 차분해도 그걸 후킹
    const trulyQuiet = buildCardFrontHook({});
    expect(trulyQuiet.angle).toBe("quiet");
    expect(trulyQuiet.intensity).toBe("calm");
    expect(trulyQuiet.headline).toBe("오늘은 뚜렷한 신호 없음"); // 솔직
  });

  it("데이터 없는 앵글은 후보에서 제외(환각 금지)", () => {
    // 거래량/수급/테마 전무 → 가격만 약함 → quiet
    expect(buildCardFrontHook({ changePct: 1.2 }).angle).toBe("quiet");
    // 컷 미달 수급은 social 후보에서 빠짐
    expect(buildCardFrontHook({ foreignNetStreak: 2 }).angle).toBe("quiet");
  });

  it("다가오는 재료 — 익명 '재료' 금지, 구체/일정만, 일정 우선 정렬, 최대 3개", () => {
    const cats: FomoCatalyst[] = [
      { label: "재료", kind: "news" }, // 익명 → 제거
      { label: "HBM4 공급계약 보도", when: "6/18", kind: "news" },
      { label: "외국인 3주째 순매수", kind: "flow" },
      { label: "2분기 실적", when: "7/25", kind: "schedule" },
      { label: "AI 테마 묶임", kind: "theme" },
    ];
    const h = buildCardFrontHook({ themeProminenceRank: 1, themeLabel: "AI", catalysts: cats });
    expect(h.catalysts.length).toBe(3);
    expect(h.catalysts.every((c) => c.label !== "재료")).toBe(true);
    expect(h.catalysts[0]!.kind).toBe("schedule"); // 일정 먼저
  });

  it("결정적 — 같은 입력은 같은 앵글·같은 카피", () => {
    const sig: CardFrontSignals = { foreignNetStreak: 4, themeProminenceRank: 2, themeLabel: "방산" };
    expect(buildCardFrontHook(sig)).toEqual(buildCardFrontHook(sig));
  });

  it("금칙어 가드 — 어떤 앵글 결과에도 예측·판정·점수·등급 어휘가 없다", () => {
    const samples: CardFrontSignals[] = [
      { foreignNetStreak: 8, volumeRatio: 5 },
      { themeProminenceRank: 1, themeLabel: "2차전지" },
      { catalysts: [{ label: "FDA 승인 심사", when: "9월", kind: "schedule" }] },
      { changePct: 0.2, themeProminenceRank: 2, themeLabel: "코인" },
      {},
    ];
    for (const s of samples) {
      const h = buildCardFrontHook(s);
      const joined = `${h.headline} ${h.catalysts.map((c) => c.label).join(" ")}`;
      expect(isFrontHookSafe(joined), `금칙어: ${joined}`).toBe(true);
      expect(joined).not.toMatch(/점수|등급|추천|유망|급등할|폭등|사라|오를 것/);
    }
  });

  it("예측 섞인 named catalyst 는 헤드라인 채택 안 함(가드)", () => {
    const h = buildCardFrontHook({ catalysts: [{ label: "급등할 거란 전망", kind: "news" }] });
    expect(h.angle).not.toBe("named");
  });
});

describe("signalsFromBasics — baseline(stock-basics) → 신호 도출", () => {
  const base: StockBasics = { name: "테스트", metrics: [] };

  it("등락률 — changeText 의 부호 포함 비율을 그대로(네이버 실제 포맷)", () => {
    expect(signalsFromBasics({ ...base, changeText: "2,000 (0.55%)", changeDir: "up" }).changePct).toBe(0.55);
    expect(signalsFromBasics({ ...base, changeText: "20,500 (-6.50%)", changeDir: "down" }).changePct).toBe(-6.5);
    expect(signalsFromBasics({ ...base, changeText: "1,500 (6.20%)", changeDir: "down" }).changePct).toBe(-6.2);
  });

  it("52주 신고가 — 현재가가 최고가의 98% 이상이면 부근", () => {
    expect(
      signalsFromBasics({ ...base, priceText: "99,000원", metrics: [{ label: "최근 1년 최고가", value: "100,000원" }] })
        .near52WeekHigh
    ).toBe(true);
    expect(
      signalsFromBasics({ ...base, priceText: "80,000원", metrics: [{ label: "최근 1년 최고가", value: "100,000원" }] })
        .near52WeekHigh
    ).toBe(false);
  });

  it("52주 저가권 — 현재가가 최저가의 105% 이하면 부근", () => {
    expect(
      signalsFromBasics({ ...base, priceText: "105,000원", metrics: [{ label: "최근 1년 최저가", value: "100,000원" }] })
        .near52WeekLow
    ).toBe(true);
    expect(
      signalsFromBasics({ ...base, priceText: "120,000원", metrics: [{ label: "최근 1년 최저가", value: "100,000원" }] })
        .near52WeekLow
    ).toBe(false);
  });

  it("정체성 — '동사는' 보일러플레이트 제거한 첫 구절", () => {
    expect(signalsFromBasics({ ...base, summary: "동사는 모바일 메모리 설계 팹리스. 2010년 설립." }).identity).toBe(
      "모바일 메모리 설계 팹리스"
    );
  });

  it("데이터 없으면 빈 신호(환각 금지) → 차분 카드로 귀결", () => {
    expect(buildCardFrontHook(signalsFromBasics(base)).angle).toBe("quiet");
  });
});

describe("selectFomoHook — 상태 배지와 분리된 종목별 헤드라인", () => {
  const forbidden =
    /차트\s?사실|낙폭|과매도|과매수|정배열|역배열|RSI|MACD|볼린저|이평선|가지런|가격만 먼저|가장 많이 오른 쪽|추천|급등할|반등할|오를 것|내릴 것|매수\s?신호|매도\s?신호/;

  it("가격 큼+주목 약은 긴장형 헤드라인을 고른다", () => {
    const fomo = computeFomoScore({ volumeRatio: 1, changePct: 10.58 });
    const hook = selectFomoHook({ fomo, signals: { changePct: 10.58, volumeRatio: 1 } });
    expect(fomo.label).toBe("lone");
    expect(hook.kind).toBe("axis_tension");
    expect(hook.headline).toBe("가격은 +10.6% 올랐는데, 거래량·뉴스는 아직 안 따라왔어요.");
  });

  it("빠지는 중인데 거래·관심이 늘면 하락 긴장형을 고른다", () => {
    const fomo = computeFomoScore({ volumeRatio: 2.8, changePct: -8.34 });
    const hook = selectFomoHook({ fomo, signals: { changePct: -8.34, volumeRatio: 2.8 } });
    expect(hook.kind).toBe("axis_tension");
    expect(hook.headline).toBe("가격은 빠졌는데, 거래량은 오히려 늘었어요.");
  });

  it("거래량·52주 위치는 피드에서 확인할 재료로 헤드라인 자격을 가진다", () => {
    const volumeFomo = computeFomoScore({ volumeRatio: 2.2, changePct: 1 });
    const positionFomo = computeFomoScore({ changePct: 1, trendStrength: 0.42 });
    expect(volumeFomo.label).toBe("warming");
    expect(positionFomo.label).toBe("warming");

    const a = selectFomoHook({ fomo: volumeFomo, signals: { volumeRatio: 2.2, changePct: 1 } });
    const b = selectFomoHook({ fomo: positionFomo, signals: { near52WeekHigh: true, changePct: 1 } });
    expect(a.kind).toBe("volume_event");
    expect(a.headline).toBe("최근 거래가 평소 2.2배로 늘었어요.");
    expect(b.kind).toBe("position");
    expect(b.headline).toBe("최근 1년 중 가장 높은 가격대까지 왔어요.");
  });

  it("순수 TA 모양형만 있으면 헤드라인을 차지하지 않고 보조문장으로 내려간다", () => {
    const fomo = computeFomoScore({ changePct: 1, trendStrength: 0.42 });
    const fact: TaFact = {
      kind: "ma_bullish",
      role: "event",
      confidence: "high",
      text: "20·60·120일선이 위쪽으로 정렬된 상태예요.",
    };
    const hook = selectFomoHook({ fomo, taFact: fact });
    expect(hook.kind).toBe("fallback");
    expect(hook.headline).toBe("오늘은 뚜렷한 신호 없음");
    expect(hook.subLine).toBe("최근 3개월 흐름이 위쪽으로 이어지고 있어요.");
  });

  it("데이터가 빈약하면 상태 헤드라인으로 폴백하고 디테일을 지어내지 않는다", () => {
    const fomo = computeFomoScore({});
    const hook = selectFomoHook({ fomo });
    expect(hook.kind).toBe("fallback");
    expect(hook.headline).toBe("오늘은 뚜렷한 신호 없음");
    expect(hook.subLine).toBeUndefined();
  });

  it("TA 사실은 일상어로 번역하고 업계어 라벨을 남기지 않는다", () => {
    const fact: TaFact = {
      kind: "rsi_oversold",
      role: "event",
      confidence: "high",
      text: "최근 낙폭이 가팔라 RSI가 바닥 영역(과매도)이에요.",
    };
    const translated = translateTaFact(fact);
    expect(translated).toBe("며칠 새 빠르게 빠졌고, 단기엔 너무 많이 떨어졌단 신호도 같이 나와요.");
    expect(translated).not.toMatch(forbidden);
    expect(isEverydayHookText(translated!)).toBe(true);
  });

  it("테마 상대성 — 피어 대비 덜 움직인 종목과 가장 많이 오른 종목을 구분한다", () => {
    const calm = computeFomoScore({ changePct: 0.4, mentionScore: 20 });
    const lagging = selectFomoHook({
      fomo: calm,
      signals: {
        themeLabel: "AI",
        changePct: 0.4,
        themePeerCount: 6,
        themeRelativeRank: 6,
        themeAverageChangePct: 5.2,
        themeRelativeChangePct: -4.8,
      },
    });
    expect(lagging.kind).toBe("relative");
    expect(lagging.headline).toBe("AI 테마 안에서 다른 속도의 변동성이 잡혔어요.");

    const moving = computeFomoScore({ changePct: 7, mentionScore: 80 });
    const leading = selectFomoHook({
      fomo: moving,
      signals: {
        themeLabel: "AI",
        changePct: 7,
        themePeerCount: 6,
        themeRelativeRank: 1,
        themeAverageChangePct: 2.1,
        themeRelativeChangePct: 4.9,
      },
    });
    expect(leading.kind).toBe("relative");
    expect(leading.headline).toBe("같은 AI 테마 종목들 중 오늘 변동성이 가장 컸어요.");
  });

  it("뉴스 재료와 D-day seam — 데이터가 들어온 경우에만 재료 헤드라인을 고른다", () => {
    const fomo = computeFomoScore({ mentionScore: 30 });
    const withoutSchedule = selectFomoHook({ fomo, signals: { catalysts: [{ label: "공급계약 보도", kind: "news" }] } });
    expect(withoutSchedule.kind).toBe("news_event");
    expect(withoutSchedule.headline).toBe("공급계약 보도 소식이 나왔어요.");

    const withSchedule = selectFomoHook({
      fomo,
      signals: { catalysts: [{ label: "2분기 실적 발표", when: "7월 말", kind: "schedule" }] },
    });
    expect(withSchedule.kind).toBe("dday");
    expect(withSchedule.headline).toBe("7월 말 2분기 실적 발표가 있어요.");
  });

  it("mentionScore는 주목축 A에 반영된다", () => {
    const quietVolume = computeFomoScore({ volumeRatio: 1, mentionScore: 0 });
    const mentioned = computeFomoScore({ volumeRatio: 1, mentionScore: 100 });
    expect(mentioned.inputs.mention).toBe(100);
    expect(mentioned.attentionAxis).toBeGreaterThan(quietVolume.attentionAxis);
  });

  it("언급 데이터가 충분하면 숫자 있는 mention 헤드라인을 고른다", () => {
    const fomo = computeFomoScore({ mentionScore: 90 });
    const hook = selectFomoHook({ fomo, signals: { mentionScore: 90, mentionCount: 4 } });
    expect(hook.kind).toBe("mention_event");
    expect(hook.headline).toBe("오늘 뉴스·커뮤니티에서 4번 언급됐어요.");
  });

  it("뉴스 이벤트는 모양형보다 먼저 헤드라인을 차지한다", () => {
    const fomo = computeFomoScore({ volumeRatio: 2.5, changePct: 1 });
    const hook = selectFomoHook({
      fomo,
      signals: {
        newsEventLabel: "대규모 공급계약 공시",
        volumeRatio: 2.5,
        near52WeekHigh: true,
      },
    });
    expect(hook.kind).toBe("news_event");
    expect(hook.headline).toBe("대규모 공급계약 공시 소식이 나왔어요.");
    expect(hook.subLine).toBe("최근 거래가 평소 2.5배로 늘었어요.");
  });

  it("뉴스 이벤트는 하락 긴장형보다 먼저 헤드라인을 차지한다", () => {
    const fomo = computeFomoScore({ mentionScore: 100, volumeRatio: 2.4, changePct: -8.3 });
    const hook = selectFomoHook({
      fomo,
      signals: {
        newsEventLabel: "신약개발 해법은 AI·오픈이노베이션",
        mentionScore: 100,
        mentionCount: 4,
        volumeRatio: 2.4,
        changePct: -8.3,
      },
    });

    expect(hook.kind).toBe("news_event");
    expect(hook.headline).toBe("신약개발 해법은 AI·오픈이노베이션 소식이 나왔어요.");
    expect(hook.subLine).toBe("가격은 빠졌는데, 뉴스·커뮤니티 언급은 늘었어요.");
  });

  it("긴 뉴스 원문 제목은 카드 헤드라인에서 짧게 정리한다", () => {
    const fomo = computeFomoScore({ mentionScore: 80 });
    const hook = selectFomoHook({
      fomo,
      signals: {
        newsEventLabel: "SK바이오팜 신약개발 해법은 AI·오픈이노베이션과 글로벌 공동연구 확대",
        mentionScore: 80,
        mentionCount: 3,
      },
    });

    expect(hook.kind).toBe("news_event");
    expect(hook.headline).toBe("SK바이오팜 신약개발 해법은 AI·오픈이노베이션과 글로벌 공동연구 … 소식이 나왔어요.");
    expect(hook.headline.length).toBeLessThanOrEqual(50);
  });

  it("헤드라인·보조문장은 안전하고 결정적이다", () => {
    const fomo = computeFomoScore({ foreignNetStreak: 4, volumeRatio: 2.4, changePct: 0.4 });
    const fact: TaFact = {
      kind: "ma_bullish",
      role: "event",
      confidence: "high",
      text: "20·60·120일선이 위쪽으로 정렬된 상태예요.",
    };
    const input = { fomo, signals: { foreignNetStreak: 4, volumeRatio: 2.4, changePct: 0.4 }, taFact: fact };
    const a = selectFomoHook(input);
    const b = selectFomoHook(input);
    expect(a).toEqual(b);
    const joined = `${a.headline} ${a.subLine ?? ""}`;
    expect(joined).not.toMatch(forbidden);
    expect(isFrontHookSafe(joined)).toBe(true);
    expect(isEverydayHookText(joined)).toBe(true);
  });
});
