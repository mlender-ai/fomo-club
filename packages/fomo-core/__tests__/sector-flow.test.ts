import { describe, it, expect } from "vitest";
import {
  aggregateSectorFlow, pickFlowPair, flowHook, flowSupport, formatKrwShort,
  FLOW_MIN_STOCKS, FLOW_DIRECTION_RATIO, type FlowRow, type SectorFlow,
} from "../src/keyword-cards/sector-flow";

const MAP = { A1: "반도체", A2: "반도체", A3: "반도체", A4: "반도체", A5: "반도체", A6: "반도체",
              B1: "방산", B2: "방산", B3: "방산", B4: "방산", B5: "방산", B6: "방산" };

/** 한 업종에 `stocks` 종목 × `days` 일, 매일 같은 금액. */
const rows = (codes: string[], days: number, perDay: number): FlowRow[] =>
  codes.flatMap((code) => Array.from({ length: days }, (_, d) => ({ date: `2026-08-${20 + d}`, code, net: perDay })));

describe("업종 집계 — 분류를 못 찾은 종목은 버리고 센다 (§E-3)", () => {
  it("업종별로 순매수를 합친다", () => {
    const { flows } = aggregateSectorFlow(rows(["A1", "A2"], 2, 100), MAP);
    expect(flows[0]).toMatchObject({ sector: "반도체", net: 400, stocks: 2, days: 2 });
  });

  it("모르는 종목은 「기타」로 묶지 않고 **버린다** — 분류가 틀리면 카드가 통째로 거짓이 된다", () => {
    const { flows, unclassified } = aggregateSectorFlow(
      [...rows(["A1"], 1, 100), { date: "2026-08-20", code: "ZZZ", net: 999 }], MAP
    );
    expect(unclassified).toBe(1);
    expect(flows.every((f) => f.sector !== "기타")).toBe(true);
    expect(flows[0]!.net).toBe(100);
  });

  it("순매수였던 날 수를 센다 — 하루 몰빵과 이어진 흐름을 가른다", () => {
    const mixed: FlowRow[] = [
      { date: "d1", code: "A1", net: 1000 }, { date: "d2", code: "A1", net: -10 }, { date: "d3", code: "A1", net: 5 },
    ];
    expect(aggregateSectorFlow(mixed, MAP)[ "flows" ][0]).toMatchObject({ positiveDays: 2, days: 3 });
  });
});

describe("From/To 고르기 — 아무 날에나 만들지 않는다 (§D-2)", () => {
  const strong = () => {
    const out = aggregateSectorFlow(
      [...rows(Object.keys(MAP).filter((c) => c.startsWith("A")), 5, -100_000_000),
       ...rows(Object.keys(MAP).filter((c) => c.startsWith("B")), 5, 100_000_000)], MAP
    ).flows;
    return out;
  };

  it("빠진 쪽과 들어온 쪽을 고른다", () => {
    const pair = pickFlowPair(strong(), 5, 100_000_000)!;
    expect(pair.to.sector).toBe("방산");
    expect(pair.from.sector).toBe("반도체");
  });

  it("금액이 임계에 못 미치면 만들지 않는다", () => {
    expect(pickFlowPair(strong(), 5, 10_000_000_000)).toBeNull();
  });

  it("종목이 얇은 업종은 쓰지 않는다 — 두 종목의 합계는 종목 이야기다", () => {
    const thin: SectorFlow[] = [
      { sector: "방산", net: 1e9, stocks: FLOW_MIN_STOCKS - 1, positiveDays: 5, days: 5 },
      { sector: "반도체", net: -1e9, stocks: FLOW_MIN_STOCKS - 1, positiveDays: 0, days: 5 },
    ];
    expect(pickFlowPair(thin, 5, 1)).toBeNull();
  });

  it("방향이 유지 안 되면 만들지 않는다 — 하루 몰빵은 흐름이 아니다", () => {
    const spiky: SectorFlow[] = [
      { sector: "방산", net: 1e9, stocks: 9, positiveDays: 1, days: 5 },
      { sector: "반도체", net: -1e9, stocks: 9, positiveDays: 4, days: 5 },
    ];
    expect(pickFlowPair(spiky, 5, 1)).toBeNull();
    expect(FLOW_DIRECTION_RATIO).toBe(0.6);
  });

  it("업종이 하나뿐이면 만들 수 없다 — From 과 To 가 필요하다", () => {
    expect(pickFlowPair([{ sector: "방산", net: 1e9, stocks: 9, positiveDays: 5, days: 5 }], 5, 1)).toBeNull();
  });
});

describe("문장 — **인과로 말하지 않는다** (§E-1 · 완료 확인 7)", () => {
  const pair = {
    from: { sector: "반도체", net: -820_000_000_000, stocks: 20, positiveDays: 0, days: 5 },
    to: { sector: "방산", net: 310_000_000_000, stocks: 12, positiveDays: 5, days: 5 },
    windowDays: 5,
  };

  it("두 사실을 나란히 쓴다 — 같은 돈이라고 단정하지 않는다", () => {
    const hook = flowHook(pair);
    expect(hook).toContain("반도체에서 돈이 빠지고");
    expect(hook).toContain("방산으로 들어오고 있어요");
    for (const banned of ["이동", "옮겨", "때문", "로 인해", "자금이 흘러"]) {
      expect(hook, banned).not.toContain(banned);
    }
  });

  it("창·주체·양쪽 금액을 밝힌다 — 숫자를 숨기지 않는다", () => {
    const lines = flowSupport(pair);
    expect(lines[0]).toBe("최근 5거래일 · 외국인·기관 기준");
    expect(lines[1]).toContain("반도체 -8,200억");
    expect(lines[1]).toContain("방산 +3,100억");
  });

  it("조 단위는 조로 읽는다", () => {
    expect(formatKrwShort(1_200_000_000_000)).toBe("+1.2조");
    expect(formatKrwShort(-820_000_000_000)).toBe("-8,200억");
  });
});

describe("조사 — 받침 따라 붙인다 (2026-08-29 실측: `전자장비와기기으로`)", () => {
  const pair = (toSector: string) => ({
    from: { sector: "반도체와반도체장비", net: -9e11, stocks: 20, positiveDays: 0, days: 3 },
    to: { sector: toSector, net: 6e11, stocks: 12, positiveDays: 3, days: 3 },
    windowDays: 3,
  });

  /**
   * 조사는 **표시명 기준**으로 붙는다(DETAIL-01/FLOW-01 §A-1 이후).
   * `전자장비와기기` 는 이제 `전자부품` 으로 나가므로 받침 없는 예로 쓸 수 없다 —
   * 표시명이 받침 없이 끝나는 업종으로 바꾼다. 검사하는 것은 여전히 조사 규칙이다.
   */
  it("받침 없으면 `로`", () => {
    expect(flowHook(pair("가스유틸리티"))).toContain("가스로 들어오고"); // 표시명 `가스`
    expect(flowHook(pair("가스유틸리티"))).not.toContain("가스으로");
  });

  it("표시명으로 나간다 — 분류 원문을 화면에 그대로 쓰지 않는다 (FLOW-01 §A-1)", () => {
    const hook = flowHook(pair("전자장비와기기"));
    expect(hook).toContain("전자부품으로 들어오고");
    expect(hook).toContain("반도체에서 돈이 빠지고");
    expect(hook).not.toContain("반도체와반도체장비");
  });

  it("받침 있으면 `으로`", () => {
    expect(flowHook(pair("건설"))).toContain("건설로 들어오고"); // ㄹ 예외
    expect(flowHook(pair("은행"))).toContain("은행으로 들어오고");
  });

  it("ㄹ 받침은 예외다 — `서울로` 이지 `서울으로` 가 아니다", () => {
    expect(flowHook(pair("철강"))).toContain("철강으로");
    expect(flowHook(pair("생명보험"))).toContain("생명보험으로");
  });
});
