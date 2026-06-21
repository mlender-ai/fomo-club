import { describe, expect, it } from "vitest";
import {
  buildCardFrontHook,
  isFrontHookSafe,
  signalsFromBasics,
  type CardFrontSignals,
  type FomoCatalyst,
  type StockBasics,
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
    expect(trulyQuiet.headline).toContain("지켜볼 재료가 아직 없어요"); // 솔직
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

  it("정체성 — '동사는' 보일러플레이트 제거한 첫 구절", () => {
    expect(signalsFromBasics({ ...base, summary: "동사는 모바일 메모리 설계 팹리스. 2010년 설립." }).identity).toBe(
      "모바일 메모리 설계 팹리스"
    );
  });

  it("데이터 없으면 빈 신호(환각 금지) → 차분 카드로 귀결", () => {
    expect(buildCardFrontHook(signalsFromBasics(base)).angle).toBe("quiet");
  });
});
