import { describe, it, expect } from "vitest";
import {
  aggregateSectorFlow, pickFlowPair, flowHook, flowSupport, formatKrwShort,
  FLOW_MIN_STOCKS, FLOW_DIRECTION_RATIO, type FlowRow, type SectorFlow, type FlowStory, type FlowDepth,
  sectorDailyFlows, pickConcentration, pickPersistentOutflow, pickReversal,
  FLOW_STREAK_MIN_DAYS, FLOW_REVERSAL_LOOKBACK_DAYS, FLOW_REVERSAL_MAX_DAYS,
  flowStockLine, flowEyebrow, buildFlowDepth, isPlaceholderSector,
  flowDepthHeader, flowSinceTitle, flowSinceLine, flowVolumeTitle, flowVolumeNote, flowWatchTitle, flowWatchSubject,
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
  const pair: FlowStory = {
    kind: "rotation",
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

  /**
   * 금액은 이제 **막대 옆**에 있다(FLOW-01 §B-2). 보조 줄에 또 적으면 같은 숫자가 한 카드에
   * 두 번 나온다 — `macroSupport` 가 같은 이유로 값 줄을 내려놨다.
   * 숫자를 숨긴 것이 아니라 자리를 옮긴 것이므로, 여기서는 **기준**만 확인한다.
   */
  it("무엇을 기준으로 잰 것인지 밝힌다 — 금액은 막대가 그린다", () => {
    const lines = flowSupport(pair);
    expect(lines).toEqual(["최근 5거래일 · 외국인·기관 기준"]);
  });

  it("조 단위는 조로 읽는다", () => {
    expect(formatKrwShort(1_200_000_000_000)).toBe("+1.2조");
    expect(formatKrwShort(-820_000_000_000)).toBe("-8,200억");
  });
});

describe("조사 — 받침 따라 붙인다 (2026-08-29 실측: `전자장비와기기으로`)", () => {
  const pair = (toSector: string): FlowStory => ({
    kind: "rotation",
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

/* ──────────────────────────────────────────────────────────────────────────────
   FLOW-02 — 카드에 종목 이름이 나오고, 종류가 넷이다
   ────────────────────────────────────────────────────────────────────────────── */

describe("대표 종목 줄 (FLOW-02 §C-1 · 완료 확인 5)", () => {
  const bought = [
    { code: "011070", name: "LG이노텍", net: 214e9 },
    { code: "009150", name: "삼성전기", net: 168e9 },
    { code: "090460", name: "비에이치", net: 49e9 },
  ];

  it("종목 이름 둘을 카드에 낸다 — 업종 이름만 보고 나가면 이 카드는 쓸모없다", () => {
    expect(flowStockLine(bought, "in")).toBe("LG이노텍 · 삼성전기 등을 사고 있어요");
  });

  it("빠지는 쪽 카드는 판 종목을 말한다", () => {
    expect(flowStockLine([{ code: "005930", name: "삼성전자", net: -421e9 }], "out"))
      .toBe("삼성전자 등을 팔고 있어요");
  });

  it("이름을 못 찾으면 줄을 만들지 않는다 — 종목코드는 사람이 읽는 이름이 아니다", () => {
    expect(flowStockLine([{ code: "011070", net: 214e9 }], "in")).toBeNull();
    expect(flowStockLine([], "in")).toBeNull();
  });

  it("보조 줄 맨 위에 종목이 온다 — 기준보다 먼저 읽혀야 한다", () => {
    const story: FlowStory = {
      kind: "rotation",
      from: { sector: "반도체", net: -9e11, stocks: 20, positiveDays: 0, days: 3 },
      to: { sector: "전자장비와기기", net: 6e11, stocks: 12, positiveDays: 3, days: 3 },
      windowDays: 3,
    };
    const depth = {
      outflows: [], inflows: [], fromStocks: [], toStocks: bought,
      focusSector: "전자장비와기기", focusDirection: "in" as const,
      focusVolumeStocks: [], focusDaily: [], focusPositiveDays: 0,
    };
    expect(flowSupport(story, depth)).toEqual([
      "LG이노텍 · 삼성전기 등을 사고 있어요",
      "최근 3거래일 · 외국인·기관 기준",
    ]);
  });
});

describe("카드 종류 넷 (FLOW-02 §E · 완료 확인 9)", () => {
  /** 한 업종 × 하루치. 종목 여섯이 같은 금액을 낸다(얇은 업종 기준을 넘기려고). */
  const day = (sector: "A" | "B", index: number, net: number): FlowRow[] =>
    Array.from({ length: 6 }, (_, s) => ({
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      code: `${sector}${s + 1}`,
      net: net / 6,
    }));
  const MAP2: Record<string, string> = {};
  for (let s = 1; s <= 6; s += 1) { MAP2[`A${s}`] = "반도체"; MAP2[`B${s}`] = "우주항공과국방"; }

  const series = (sector: "A" | "B", nets: number[]): FlowRow[] =>
    nets.flatMap((net, i) => day(sector, i, net));

  const MIN = 100e9;

  it("한 곳 집중 — 연속으로 들어온 업종을 짚는다", () => {
    const dailies = sectorDailyFlows(series("B", [50e9, 60e9, 70e9, 80e9, 90e9]), MAP2);
    const story = pickConcentration(dailies, MIN)!;
    expect(story.kind).toBe("concentration");
    expect(flowHook(story)).toContain("방산에 5거래일째");
    expect(flowHook(story)).toContain("돈이 들어오고 있어요");
    // `에만` 이라고 쓰지 않는다 — 다른 업종에도 들어왔을 수 있다.
    expect(flowHook(story)).not.toContain("에만");
  });

  it("사흘은 이야기로 보지 않는다 — 방향이 무작위라도 여덟 번에 한 번 나온다", () => {
    const dailies = sectorDailyFlows(series("B", [-10e9, 60e9, 70e9, 80e9]), MAP2);
    expect(pickConcentration(dailies, MIN)).toBeNull();
    expect(FLOW_STREAK_MIN_DAYS).toBe(4);
  });

  it("오래된 흐름 — 연속으로 빠진 업종을 짚는다", () => {
    const dailies = sectorDailyFlows(series("A", [-50e9, -60e9, -70e9, -80e9]), MAP2);
    const story = pickPersistentOutflow(dailies, MIN)!;
    expect(story.kind).toBe("persistent");
    expect(flowHook(story)).toBe("반도체에서 4거래일째\n돈이 빠지고 있어요");
  });

  it("방향 전환 — 되짚은 창에 들어온 날이 하나도 없어야 「처음」이라고 쓴다", () => {
    const nets = [...Array.from({ length: FLOW_REVERSAL_LOOKBACK_DAYS }, () => -20e9), 150e9];
    const dailies = sectorDailyFlows(series("A", nets), MAP2);
    const story = pickReversal(dailies, MIN)!;
    expect(story.kind).toBe("reversal");
    expect(flowHook(story)).toContain(`${FLOW_REVERSAL_LOOKBACK_DAYS}거래일 만에 처음`);
    expect(flowHook(story)).toContain("반도체로 돈이 들어왔어요");
    // 「처음」의 근거를 카드에 남긴다 — 창을 밝히지 않으면 단정이 된다.
    expect(flowSupport(story)).toContain(`직전 ${FLOW_REVERSAL_LOOKBACK_DAYS}거래일에는 들어온 날이 없었어요`);
  });

  it("되짚을 이력이 모자라면 「처음」을 말하지 않는다", () => {
    const nets = [...Array.from({ length: 5 }, () => -20e9), 150e9];
    expect(pickReversal(sectorDailyFlows(series("A", nets), MAP2), MIN)).toBeNull();
  });

  it("창 안에 들어온 날이 있으면 방향 전환이 아니다", () => {
    const nets = [...Array.from({ length: FLOW_REVERSAL_LOOKBACK_DAYS - 1 }, () => -20e9), 10e9, -20e9, 150e9];
    expect(pickReversal(sectorDailyFlows(series("A", nets), MAP2), MIN)).toBeNull();
  });

  it("길게 이어진 것은 방향 전환이 아니라 집중이다 — 두 종류가 같은 날 겹치지 않게", () => {
    const nets = [...Array.from({ length: FLOW_REVERSAL_LOOKBACK_DAYS }, () => -20e9),
                  60e9, 60e9, 60e9, 60e9];
    const dailies = sectorDailyFlows(series("A", nets), MAP2);
    expect(pickReversal(dailies, MIN)).toBeNull();
    expect(FLOW_REVERSAL_MAX_DAYS).toBe(2);
    expect(pickConcentration(dailies, MIN)!.kind).toBe("concentration");
  });

  it("얇은 업종으로는 한 업종 이야기도 만들지 않는다 — 카드와 같은 기준이다", () => {
    const thin: FlowRow[] = [0, 1, 2, 3].flatMap((i) => [
      { date: `2026-09-0${i + 1}`, code: "T1", net: 60e9 },
      { date: `2026-09-0${i + 1}`, code: "T2", net: 60e9 },
    ]);
    expect(pickConcentration(sectorDailyFlows(thin, { T1: "얇은업종", T2: "얇은업종" }), MIN)).toBeNull();
  });

  it("금액이 임계에 못 미치면 만들지 않는다", () => {
    const dailies = sectorDailyFlows(series("B", [1e9, 1e9, 1e9, 1e9]), MAP2);
    expect(pickConcentration(dailies, MIN)).toBeNull();
  });

  it("맨 위 라벨이 종류마다 다르다 — 「돈이 옮겨가고 있어요」는 이동 카드의 말이다", () => {
    const labels = (["rotation", "concentration", "persistent", "reversal"] as const).map(flowEyebrow);
    expect(new Set(labels).size).toBe(4);
    expect(flowEyebrow("rotation")).toBe("돈이 옮겨가고 있어요");
  });

  it("어떤 종류의 훅도 같은 돈이라고 단정하지 않는다", () => {
    const stories: FlowStory[] = [
      { kind: "concentration", flow: { sector: "우주항공과국방", net: 3e11, stocks: 12, positiveDays: 5, days: 5 },
        direction: "in", windowDays: 5, since: "2026-09-01" },
      { kind: "persistent", flow: { sector: "반도체", net: -3e11, stocks: 12, positiveDays: 0, days: 6 },
        direction: "out", windowDays: 6, since: "2026-09-01" },
      { kind: "reversal", flow: { sector: "화학", net: 2e11, stocks: 12, positiveDays: 1, days: 1 },
        direction: "in", windowDays: 1, since: "2026-09-07", lookbackDays: 15 },
    ];
    for (const story of stories) {
      const hook = flowHook(story);
      for (const banned of ["이동", "옮겨", "때문", "로 인해", "자금이 흘러", "전망", "예상"]) {
        expect(hook, `${story.kind}/${banned}`).not.toContain(banned);
      }
    }
  });
});

describe("한 업종 이야기의 상세 — 없는 쪽을 지어내지 않는다 (FLOW-02 §E)", () => {
  const sectorByCode = { A1: "반도체", A2: "반도체", A3: "반도체", A4: "반도체", A5: "반도체" };
  const windowRows: FlowRow[] = [
    { date: "2026-09-01", code: "A1", net: -700 },
    { date: "2026-09-01", code: "A2", net: -200 },
    { date: "2026-09-02", code: "A1", net: -300 },
  ];
  const flows: SectorFlow[] = [{ sector: "반도체", net: -1200, stocks: 5, positiveDays: 0, days: 2 }];
  const story: FlowStory = {
    kind: "persistent",
    flow: flows[0]!,
    direction: "out",
    windowDays: 2,
    since: "2026-09-01",
  };

  it("빠지는 이야기는 판 종목만 낸다 — 산 종목 목록을 억지로 채우지 않는다", () => {
    const depth = buildFlowDepth(story, windowRows, windowRows, flows, sectorByCode, { A1: "삼성전자", A2: "SK하이닉스" });
    expect(depth.fromStocks.map((s) => s.name)).toEqual(["삼성전자", "SK하이닉스"]);
    expect(depth.toStocks).toEqual([]);
    expect(depth.focusSector).toBe("반도체");
    expect(depth.focusDirection).toBe("out");
  });

  it("거래량 걸음도 초점 쪽에서 고른다", () => {
    const depth = buildFlowDepth(story, windowRows, windowRows, flows, sectorByCode,
      { A1: "삼성전자", A2: "SK하이닉스" }, { A1: 2.2, A2: 1.1 });
    expect(depth.focusVolumeStocks.map((s) => s.name)).toEqual(["삼성전자"]);
  });

  it("일별 막대는 초점 업종의 것이다", () => {
    const depth = buildFlowDepth(story, windowRows, windowRows, flows, sectorByCode);
    expect(depth.focusDaily.map((d) => d.net)).toEqual([-900, -300]);
    expect(depth.focusPositiveDays).toBe(0);
  });
});

describe("상세 문장은 코어가 만든다 (FLOW-02 §B — 실측 `반도체으로`)", () => {
  const depth = (over: Partial<FlowDepth> = {}): FlowDepth => ({
    outflows: [], inflows: [], fromStocks: [], toStocks: [],
    focusSector: "반도체와반도체장비", focusDirection: "in",
    focusVolumeStocks: [], focusDaily: [], focusPositiveDays: 0,
    ...over,
  });

  it("헤더 — 양쪽이 있으면 둘, 한쪽이면 하나. 조사는 표시명 기준이다", () => {
    expect(flowDepthHeader({ fromSector: "반도체와반도체장비", toSector: "전자장비와기기" }))
      .toBe("반도체에서 전자부품으로");
    // 표시명 `반도체` 는 받침이 없다 — 고정 `으로` 를 쓰면 `반도체으로` 가 된다.
    expect(flowDepthHeader({ toSector: "반도체와반도체장비" })).toBe("반도체로 들어온 돈");
    expect(flowDepthHeader({ fromSector: "반도체와반도체장비" })).toBe("반도체에서 빠진 돈");
  });

  it("4걸음 제목·문장이 방향을 따라간다", () => {
    expect(flowSinceTitle(depth())).toBe("반도체로 돈이 들어온 지 얼마나 됐나요");
    expect(flowSinceTitle(depth({ focusDirection: "out" }))).toBe("반도체에서 돈이 빠진 지 얼마나 됐나요");
    const daily = Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, net: i < 14 ? 10 : -10 }));
    expect(flowSinceLine(depth({ focusDaily: daily, focusPositiveDays: 14 })))
      .toBe("최근 20거래일 중 14일이 순매수였어요");
    expect(flowSinceLine(depth({ focusDirection: "out", focusDaily: daily, focusPositiveDays: 14 })))
      .toBe("최근 20거래일 중 6일이 순매도였어요");
  });

  it("3걸음 — 거래가 안 붙은 것도 말한다(§F-2)", () => {
    expect(flowVolumeTitle(depth())).toBe("반도체에서 거래량이 평소보다 늘어난 종목");
    expect(flowVolumeNote(depth(), true)).toEqual(["돈이 들어오면서 거래도 함께 붙고 있어요"]);
    expect(flowVolumeNote(depth({ focusDirection: "out" }), false)).toEqual([
      "돈은 빠지는데 거래량은 평소와 비슷해요",
      "조용히 덜어내는 모습이에요",
    ]);
  });

  it("5걸음 — 초점 업종을 담고, 알림 문장도 방향을 따라간다", () => {
    expect(flowWatchTitle(depth())).toBe("반도체 업종을 계속 지켜볼까요");
    expect(flowWatchSubject(depth())).toBe("돈이 계속 들어오는지, 빠지기 시작하는지 알려드려요");
    expect(flowWatchSubject(depth({ focusDirection: "out" })))
      .toBe("돈이 계속 빠지는지, 들어오기 시작하는지 알려드려요");
  });
});

describe("벤더의 「기타」는 업종이 아니다 (LAUNCH-P1 §D 실측)", () => {
  /**
   * 2026-09-08 실측: 거래소 벤더 업종 79개 중 `기타` 가 **389종목** 으로 가장 크다.
   * 얇은 업종 기준(5종목)을 가볍게 넘으므로, 걸러내지 않으면 어느 날 카드가
   * 「기타에서 돈이 빠지고」 라고 말한다 — 아무 뜻도 없는 카드다.
   */
  const MAP3 = { X1: "기타", X2: "기타", X3: "기타", X4: "기타", X5: "기타", X6: "기타", Y1: "조선", Y2: "조선" };
  const rows3 = (code: string, net: number): FlowRow[] =>
    [0, 1, 2].map((i) => ({ date: `2026-09-0${i + 1}`, code, net }));

  it("자리표 업종은 미분류로 세고 버린다", () => {
    const { flows, unclassified } = aggregateSectorFlow(
      [...Object.keys(MAP3).filter((c) => c.startsWith("X")).flatMap((c) => rows3(c, 1e9)), ...rows3("Y1", 1e9)],
      MAP3
    );
    expect(flows.map((f) => f.sector)).toEqual(["조선"]);
    expect(unclassified).toBe(18); // X1~X6 × 3일
  });

  it("일별 원장에서도 같은 기준으로 뺀다 — 한쪽만 빼면 두 화면이 어긋난다", () => {
    const dailies = sectorDailyFlows([...rows3("X1", 1e9), ...rows3("Y1", 1e9)], MAP3);
    expect(dailies.map((d) => d.sector)).toEqual(["조선"]);
  });

  it("`기타금융`·`기타제조` 는 실제 업종이라 살린다 — 이름이 비슷하다고 버리지 않는다", () => {
    expect(isPlaceholderSector("기타금융")).toBe(false);
    expect(isPlaceholderSector("기타제조")).toBe(false);
    expect(isPlaceholderSector("기타")).toBe(true);
    expect(isPlaceholderSector(" 미분류 ")).toBe(true);
    expect(isPlaceholderSector("")).toBe(true);
  });
});
