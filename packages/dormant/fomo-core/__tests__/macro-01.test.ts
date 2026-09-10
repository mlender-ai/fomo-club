import { describe, it, expect } from "vitest";
import {
  MACRO_INDICATORS,
  MACRO_MAX_CARDS,
  MACRO_MAX_PER_CATEGORY,
  MACRO_MAX_STALE_CALENDAR_DAYS,
  MACRO_MAX_STALE_TRADING_DAYS,
  detectMacroMove,
  isMacroFresh,
  macroFreshnessLabel,
  macroHook,
  selectMacroMoves,
  tradingDaysBetween,
  type MacroMove,
  type MacroSeries,
} from "../src/keyword-cards/macro-move";
import { MACRO_SENSITIVITY, linkMacroToPicks, macroSupport, type RecentPick } from "../src/keyword-cards/macro-link";

/**
 * **MACRO-01** — 거시 카드를 유가 하나에서 늘린 뒤의 규칙.
 *
 * 종전에는 5종을 정의해 두고 사실상 유가 하나만 카드가 됐고, 그 유가마저 6일 묵은 값이었다.
 * 여기서 재는 것은 넷이다 — **지표가 늘었나 · 오래된 걸 거르나 · 하루 몇 장인가 · 문장이
 * 사건 종류에 맞나.**
 */

const series = (id: MacroSeries["id"], values: number[], startDay = 10): MacroSeries => ({
  id,
  points: values.map((value, i) => ({ date: `2026-08-${String(startDay + i).padStart(2, "0")}`, value })),
});

describe("§A — 지표를 늘렸다", () => {
  it("최소 8종 이상을 매일 본다 (완료 확인 1)", () => {
    expect(MACRO_INDICATORS.length).toBeGreaterThanOrEqual(8);
  });

  it("금리·환율·원자재·지수·신용을 다 덮는다", () => {
    const categories = new Set(MACRO_INDICATORS.map((i) => i.category));
    for (const required of ["fx", "rate", "credit", "index", "commodity"] as const) {
      expect(categories.has(required), required).toBe(true);
    }
  });

  it("국내 지표가 있다 — 우리 종목 대부분이 국내인데 종전엔 하나도 없었다", () => {
    const ids = new Set(MACRO_INDICATORS.map((i) => i.id));
    for (const domestic of ["kospi", "kosdaq", "ktb3y", "corp3y", "usdkrw"] as const) {
      expect(ids.has(domestic), domestic).toBe(true);
    }
  });

  it("모든 지표에 감응도가 있다 — 연결할 수 없는 지표는 카드가 못 된다", () => {
    for (const indicator of MACRO_INDICATORS) {
      expect(MACRO_SENSITIVITY[indicator.id], indicator.id).toBeDefined();
    }
  });

  it("임계가 지표마다 다르다 — 하나로 두면 그건 분포를 안 본 것이다", () => {
    const moves = new Set(MACRO_INDICATORS.map((i) => i.movePct));
    expect(moves.size).toBeGreaterThan(5);
  });

  /**
   * 급변은 **드물어야** 급변이다. 후보 수를 맞추느라 급변 임계까지 같이 내리면
   * `하루에 0.7% 올랐어요` 를 급변이라고 쓰게 된다 — 거짓말에 가깝다.
   */
  it("급변 임계가 일간 변동으로서 의미 있는 크기다", () => {
    for (const indicator of MACRO_INDICATORS) {
      expect(indicator.spikePct, indicator.id).toBeGreaterThan(0.9);
    }
  });
});

describe("§B-3 — 오래된 지표로 카드를 만들지 않는다", () => {
  it("주말은 거래일로 세지 않는다 — 안 그러면 월요일마다 거시 카드가 전멸한다", () => {
    // 2026-08-28(금) → 2026-08-31(월): 달력 3일이지만 거래일로는 1일이다.
    expect(tradingDaysBetween("2026-08-28", "2026-08-31")).toBe(1);
    expect(isMacroFresh("2026-08-28", "2026-08-31")).toBe(true);
  });

  it("거래일로 2일을 넘게 묵으면 거른다", () => {
    expect(MACRO_MAX_STALE_TRADING_DAYS).toBe(2);
    // 08-25(화) → 08-31(월) = 거래일 4일. 사용자가 본 「6일 전 유가」가 정확히 이것이다.
    expect(tradingDaysBetween("2026-08-25", "2026-08-31")).toBe(4);
    expect(isMacroFresh("2026-08-25", "2026-08-31")).toBe(false);
  });

  /**
   * 거래일만 세면 금요일 값이 화요일까지 통과하는데, 화면에는 `4일 전 기준` 이라고 뜬다.
   * 그건 사용자가 지적한 「6일 전 데이터」와 같은 종류의 불쾌함이다 — 달력일도 같이 본다.
   */
  it("화면에 `4일 전 기준` 이 뜨는 값은 거른다", () => {
    // 08-28(금) → 09-01(화): 거래일 2일이라 거래일 자로만 보면 통과한다.
    expect(tradingDaysBetween("2026-08-28", "2026-09-01")).toBe(2);
    expect(macroFreshnessLabel("2026-08-28", "2026-09-01")).toBe("4일 전 기준");
    // 그런데 달력 4일이라 걸린다.
    expect(isMacroFresh("2026-08-28", "2026-09-01")).toBe(false);

    // 금 → 월(달력 3일)은 통과한다 — 월요일 카드를 죽이지 않는다.
    expect(isMacroFresh("2026-08-28", "2026-08-31")).toBe(true);
  });

  it("달력일 상한이 3일이다 — 그 이상은 화면에 오래돼 보인다", () => {
    expect(MACRO_MAX_STALE_CALENDAR_DAYS).toBe(3);
  });

  it("표시는 달력일이다 — 사용자가 세는 것은 달력이니까 (완료 확인 4)", () => {
    expect(macroFreshnessLabel("2026-08-31", "2026-09-01")).toBe("어제 기준");
    expect(macroFreshnessLabel("2026-09-01", "2026-09-01")).toBe("오늘 기준");
    expect(macroFreshnessLabel("2026-08-28", "2026-08-31")).toBe("3일 전 기준");
  });

  it("절대 날짜를 쓰지 않는다 — 오늘과 빼봐야 오래된 줄 아는 표기는 안 쓴다", () => {
    for (const label of [
      macroFreshnessLabel("2026-08-31", "2026-09-01"),
      macroFreshnessLabel("2026-08-28", "2026-08-31"),
    ]) {
      expect(label).not.toMatch(/\d{4}|월|일 기준일/);
    }
  });
});

describe("§C-1 — 네 가지 사건만 카드가 된다", () => {
  it("연속 흐름 — 며칠째 같은 방향이고 누적으로 충분히 움직였을 때", () => {
    // 유가 movePct 6.2 — 80 → 86 은 7.5%.
    const move = detectMacroMove(series("oil", [80, 82, 84, 86]))!;
    expect(move.kind).toBe("streak");
    expect(move.streakDays).toBe(3);
  });

  it("연속이어도 변동이 작으면 만들지 않는다 — 조용한 날은 조용하다", () => {
    expect(detectMacroMove(series("oil", [80, 80.1, 80.2, 80.3]))).toBeNull();
  });

  it("급변 — 연속이 아니어도 하루에 크게 움직이면 사건이다", () => {
    // 유가 spikePct 7 — 80 → 86.5 는 8.1%.
    const move = detectMacroMove(series("oil", [80, 86.5]))!;
    expect(move.kind).toBe("spike");
    expect(move.streakDays).toBe(1);
  });

  it("기준선 통과 — 숫자가 아니라 선을 넘은 것이다", () => {
    const move = detectMacroMove(series("usdkrw", [1395, 1402]))!;
    expect(move.kind).toBe("level");
    expect(move.crossedLevel).toBe(1400);
  });

  it("관계 역전 — 장단기 금리차가 부호를 바꾸면 값 변화보다 큰 사건이다", () => {
    const move = detectMacroMove(series("yieldcurve", [0.12, -0.05]))!;
    expect(move.kind).toBe("inversion");
  });

  /**
   * 역전이 일어난 날 그걸 「3일째 내리고 있어요」로 말하면 훨씬 작은 이야기가 된다.
   * 강한 사건이 먼저 이겨야 한다.
   */
  it("강한 사건이 먼저 이긴다 — 역전 > 기준선 > 급변 > 연속", () => {
    const inverting = detectMacroMove(series("yieldcurve", [0.3, 0.2, 0.1, -0.1]))!;
    expect(inverting.kind).toBe("inversion");

    const crossing = detectMacroMove(series("usdkrw", [1380, 1390, 1396, 1405]))!;
    expect(crossing.kind).toBe("level");
  });
});

describe("§C-2 — 하루 몇 장인가", () => {
  const move = (id: MacroMove["indicator"]["id"], strength: number): { move: MacroMove } => ({
    move: {
      indicator: MACRO_INDICATORS.find((i) => i.id === id)!,
      kind: "streak",
      streakDays: 3,
      direction: "up",
      from: 1,
      to: 2,
      changePct: 5,
      series: [1, 2],
      asOf: "2026-08-31",
      strength,
    },
  });

  it("최대 3장 (완료 확인 6)", () => {
    expect(MACRO_MAX_CARDS).toBe(3);
    const picked = selectMacroMoves([
      move("usdkrw", 9),
      move("oil", 8),
      move("kospi", 7),
      move("gold", 6),
      move("vix", 5),
    ]);
    expect(picked).toHaveLength(3);
  });

  it("같은 분류에서 2장을 넘지 않는다 (완료 확인 7)", () => {
    expect(MACRO_MAX_PER_CATEGORY).toBe(2);
    // 금리 넷이 다 크게 움직인 날 — 그날 덱이 금리 브리핑이 되면 안 된다.
    const picked = selectMacroMoves([
      move("ktb3y", 9),
      move("ust10y", 8),
      move("ust2y", 7),
      move("yieldcurve", 6),
    ]);
    expect(picked.filter((p) => p.move.indicator.category === "rate")).toHaveLength(2);
  });

  it("강한 순으로 고른다 — 목록 순서가 아니라", () => {
    const picked = selectMacroMoves([move("usdkrw", 1), move("oil", 9), move("gold", 5)]);
    expect(picked.map((p) => p.move.indicator.id)).toEqual(["oil", "gold", "usdkrw"]);
  });

  it("조건에 맞는 게 없으면 0장이다 — 채우려고 임계를 낮추지 않는다", () => {
    expect(selectMacroMoves([])).toEqual([]);
  });
});

describe("§C — 지수는 시장으로, 나머지는 업종으로 잇는다", () => {
  const picks: RecentPick[] = [
    { canonical: "가나다전자", sector: "반도체와반도체장비", market: "KOSPI", pickedAt: "2026-08-20" },
    { canonical: "라마바화학", sector: "화학", market: "KOSDAQ", pickedAt: "2026-08-21" },
    { canonical: "사아자정밀", sector: "기계", market: "KOSDAQ", pickedAt: "2026-08-22" },
  ];

  it("지수는 그 시장 종목에만 붙는다 — 다 해당하는 연결은 연결이 아니다", () => {
    const move = detectMacroMove(series("kosdaq", [800, 790, 780, 758]))!;
    const link = linkMacroToPicks(move, picks)!;
    expect(link.favored.map((p) => p.canonical)).toEqual(["라마바화학", "사아자정밀"]);
    expect(link.hurt).toHaveLength(0);
    expect(macroSupport(link)[0]).toBe("우리가 짚은 곳 중 코스닥 종목이 2곳이에요");
  });

  it("그 시장 픽이 2곳 미만이면 카드가 안 나온다 — 그게 맞다", () => {
    const move = detectMacroMove(series("kospi", [2600, 2570, 2540, 2460]))!;
    expect(linkMacroToPicks(move, picks)).toBeNull(); // KOSPI 픽이 하나뿐
  });

  it("업종 지표는 업종으로 잇는다", () => {
    const move = detectMacroMove(series("oil", [80, 82, 84, 86]))!;
    // 유가에 닿는 업종만 세므로 위 픽 셋으로는 화학 하나뿐이라 2곳을 못 채운다.
    const link = linkMacroToPicks(move, [
      ...picks,
      { canonical: "차카타항공", sector: "항공사", market: "KOSPI", pickedAt: "2026-08-23" },
    ])!;
    // 유가 상승 → 화학·항공은 불리한 쪽. 기계·반도체는 유가와 무관해 안 붙는다.
    expect(link.hurt.map((p) => p.canonical)).toEqual(["라마바화학", "차카타항공"]);
    expect(link.favored).toHaveLength(0);
  });
});

describe("§D — 카드 문장", () => {
  it("사건 종류마다 문장이 다르다 (§D-3)", () => {
    expect(macroHook(detectMacroMove(series("oil", [80, 82, 84, 86]))!)).toContain("3일째");
    expect(macroHook(detectMacroMove(series("oil", [80, 86.5]))!)).toContain("하루에");
    expect(macroHook(detectMacroMove(series("usdkrw", [1395, 1402]))!)).toContain("1,400원");
    expect(macroHook(detectMacroMove(series("yieldcurve", [0.12, -0.05]))!)).toContain("뒤집혔어요");
  });

  /**
   * 목적격 조사를 붙이면 단위마다 정답이 갈린다 — `1,400원을`(맞음) · `$80.0을`(틀림,
   * 「달러를」) · `4.00%을`(틀림, 「퍼센트를」). 숫자를 소리로 읽어야 받침이 정해지는데
   * 우리는 그 소리를 모른다. 조사가 필요 없는 말로 쓴다.
   */
  it("기준선 문장에 목적격 조사를 붙이지 않는다", () => {
    for (const [id, values] of [
      ["usdkrw", [1395, 1402]],
      ["oil", [79, 81]],
      ["ust10y", [3.9, 4.05]],
      ["vix", [19, 21]],
    ] as const) {
      const hook = macroHook(detectMacroMove(series(id, [...values]))!);
      expect(hook, id).not.toMatch(/원을 넘|\d을 넘|%을 넘|을 넘었어요/);
    }
  });

  it("예측하지 않는다 — 무슨 일이 벌어졌는지만 말한다", () => {
    for (const indicator of MACRO_INDICATORS) {
      for (const text of [MACRO_SENSITIVITY[indicator.id].upText, MACRO_SENSITIVITY[indicator.id].downText]) {
        expect(text, indicator.id).not.toMatch(/오를 거|내릴 거|전망|예상|수혜|추천|사세요/);
      }
    }
  });

  it("보조 줄이 한 줄이다 — 같은 숫자를 카드에 두 번 쓰지 않는다 (완료 확인 8)", () => {
    const move = detectMacroMove(series("oil", [80, 82, 84, 86]))!;
    const link = linkMacroToPicks(move, [
      { canonical: "A", sector: "화학", pickedAt: "2026-08-20" },
      { canonical: "B", sector: "항공사", pickedAt: "2026-08-21" },
    ])!;
    const support = macroSupport(link);
    expect(support).toHaveLength(1);
    expect(support[0]).not.toMatch(/→|\$/);
  });
});
