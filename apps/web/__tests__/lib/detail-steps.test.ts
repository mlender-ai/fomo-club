import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFlowDepth, type FlowRow, type SectorFlow, type FlowPair } from "@fomo/core/keyword-cards/sector-flow";
import { macroBand, MACRO_BAND_MIN_POINTS } from "@fomo/core/keyword-cards/macro-move";
import {
  sectorDisplayName,
  overlongSectorNames,
  SECTOR_DISPLAY_MAX_CHARS,
  SECTOR_DISPLAY_NAMES,
} from "@fomo/core/keyword-cards/sector-display";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * DETAIL-01 완료 확인 — **상세가 실제로 걸음을 갖는가.**
 *
 * 화면 렌더 테스트가 아니라 배선·계산 테스트다. 이 저장소의 카드 배선 테스트와 같은 방식으로,
 * 「끊기면 화면이 비는」 연결만 지킨다.
 */

describe("업종 표시명 (FLOW-01 §A-1 · DETAIL-01 §E)", () => {
  it("표에 없으면 원문 그대로 — 자르지 않는다", () => {
    expect(sectorDisplayName("은행")).toBe("은행");
    expect(sectorDisplayName("우리가모르는업종")).toBe("우리가모르는업종");
  });

  it("긴 분류명은 짧은 표시명으로 바뀐다", () => {
    expect(sectorDisplayName("반도체와반도체장비")).toBe("반도체");
    expect(sectorDisplayName("전자장비와기기")).toBe("전자부품");
    expect(sectorDisplayName("우주항공과국방")).toBe("방산");
  });

  it("표에 적은 표시명은 전부 상한 안이다 — 화면에서 잘릴 이름을 표에 두지 않는다", () => {
    expect(overlongSectorNames(Object.keys(SECTOR_DISPLAY_NAMES))).toEqual([]);
  });

  it("빈 값은 빈 문자열 — 화면이 'undefined' 를 그리지 않게", () => {
    expect(sectorDisplayName(undefined)).toBe("");
    expect(sectorDisplayName("  ")).toBe("");
  });

  it("상한은 규약이다 — 값이 바뀌면 표를 다시 본다", () => {
    expect(SECTOR_DISPLAY_MAX_CHARS).toBe(7);
  });
});

describe("자금 흐름 상세 재료 (DETAIL-01 §B)", () => {
  const sectorByCode = {
    A1: "반도체와반도체장비",
    A2: "반도체와반도체장비",
    B1: "전자장비와기기",
    B2: "전자장비와기기",
    C1: "화학",
  };
  const flows: SectorFlow[] = [
    { sector: "전자장비와기기", net: 600, stocks: 6, positiveDays: 3, days: 3 },
    { sector: "화학", net: 100, stocks: 5, positiveDays: 2, days: 3 },
    { sector: "얇은업종", net: 900, stocks: 2, positiveDays: 3, days: 3 },
    { sector: "반도체와반도체장비", net: -900, stocks: 9, positiveDays: 0, days: 3 },
  ];
  const pair: FlowPair = {
    from: flows[3]!,
    to: flows[0]!,
    windowDays: 3,
  };
  const windowRows: FlowRow[] = [
    { date: "2026-09-01", code: "A1", net: -700 },
    { date: "2026-09-01", code: "A2", net: -200 },
    { date: "2026-09-01", code: "B1", net: 400 },
    { date: "2026-09-01", code: "B2", net: 200 },
    { date: "2026-09-01", code: "C1", net: 100 },
  ];
  const names = { A1: "삼성전자", A2: "SK하이닉스", B1: "LG이노텍", B2: "삼성전기", C1: "롯데케미칼" };

  it("빠진 곳·들어온 곳을 각각 최대 3개 낸다 — 한 쌍만 보여주지 않는다", () => {
    const depth = buildFlowDepth(pair, windowRows, windowRows, flows, sectorByCode, names);
    expect(depth.inflows.map((r) => r.sector)).toEqual(["전자장비와기기", "화학"]);
    expect(depth.outflows.map((r) => r.sector)).toEqual(["반도체와반도체장비"]);
  });

  it("얇은 업종은 상세에서도 뺀다 — 카드와 같은 기준이어야 표가 서로를 배신하지 않는다", () => {
    const depth = buildFlowDepth(pair, windowRows, windowRows, flows, sectorByCode, names);
    expect(depth.inflows.some((r) => r.sector === "얇은업종")).toBe(false);
  });

  it("2걸음 — 판 종목은 금액 큰 순, 산 종목도 금액 큰 순", () => {
    const depth = buildFlowDepth(pair, windowRows, windowRows, flows, sectorByCode, names);
    expect(depth.fromStocks.map((s) => s.name)).toEqual(["삼성전자", "SK하이닉스"]);
    expect(depth.toStocks.map((s) => s.name)).toEqual(["LG이노텍", "삼성전기"]);
  });

  it("이름을 모르면 이름 없이 간다 — 코드를 이름 자리에 넣지 않는다", () => {
    const depth = buildFlowDepth(pair, windowRows, windowRows, flows, sectorByCode, {});
    expect(depth.toStocks.every((s) => s.name === undefined)).toBe(true);
  });

  it("3걸음 — 거래가 붙은 종목만, 배수 순", () => {
    const depth = buildFlowDepth(pair, windowRows, windowRows, flows, sectorByCode, names, { B1: 2.4, B2: 1.2 });
    expect(depth.toVolumeStocks.map((s) => s.name)).toEqual(["LG이노텍"]);
  });

  it("거래가 안 붙으면 빈 목록 — 그것도 정보다(§D-4)", () => {
    const depth = buildFlowDepth(pair, windowRows, windowRows, flows, sectorByCode, names, { B1: 1.1, B2: 1.0 });
    expect(depth.toVolumeStocks).toEqual([]);
  });

  it("4걸음 — 일별은 오래된 것부터, 순매수 날 수를 함께 낸다", () => {
    const daily: FlowRow[] = [
      { date: "2026-08-28", code: "B1", net: -50 },
      { date: "2026-08-31", code: "B1", net: 300 },
      { date: "2026-09-01", code: "B1", net: 400 },
      { date: "2026-09-01", code: "B2", net: 200 },
    ];
    const depth = buildFlowDepth(pair, windowRows, daily, flows, sectorByCode, names);
    expect(depth.toDaily.map((d) => d.date)).toEqual(["2026-08-28", "2026-08-31", "2026-09-01"]);
    expect(depth.toDaily.at(-1)!.net).toBe(600);
    expect(depth.toPositiveDays).toBe(2);
  });
});

describe("거시 1년 밴드 (DETAIL-01 §A-1)", () => {
  const series = (values: number[]) => values.map((value, i) => ({ date: `d${i}`, value }));

  it("표본이 모자라면 만들지 않는다 — 20일치로 '1년 중' 이라 하면 거짓이다", () => {
    expect(macroBand(series(Array.from({ length: 20 }, (_, i) => i)))).toBeNull();
  });

  it("바닥 근처면 낮은 편이라고 말한다", () => {
    const values = Array.from({ length: MACRO_BAND_MIN_POINTS }, (_, i) => 100 - i * 0.5);
    const band = macroBand(series(values));
    expect(band).not.toBeNull();
    expect(band!.percentile).toBe(0);
    expect(band!.label).toBe("최근 1년 중 낮은 편이에요");
  });

  it("천장 근처면 높은 편이라고 말한다", () => {
    const values = Array.from({ length: MACRO_BAND_MIN_POINTS }, (_, i) => i);
    const band = macroBand(series(values));
    expect(band!.percentile).toBe(100);
    expect(band!.label).toBe("최근 1년 중 높은 편이에요");
  });

  it("움직이지 않은 지표는 위치를 만들지 않는다 — 0으로 나눈 값은 위치가 아니다", () => {
    expect(macroBand(series(Array.from({ length: MACRO_BAND_MIN_POINTS }, () => 50)))).toBeNull();
  });
});

/**
 * 배선 — 끊기면 상세가 비거나 열리지 않는 연결만 지킨다.
 * 소품 목록을 통째로 못 박지 않는다(그 방식이 이 저장소에서 한 번 개선을 막았다).
 */
describe("상세 배선 (완료 확인 1·4·7·8)", () => {
  const deck = read("../../../fomo-web/components/QuietPickDeck.tsx");
  const macro = read("../../../fomo-web/components/MacroDepth.tsx");
  const flow = read("../../../fomo-web/components/FlowDepth.tsx");
  const quietPick = read("../../lib/quiet-pick.ts");

  it("서버가 흐름 상세 재료를 응답에 싣는다", () => {
    expect(quietPick).toContain("buildFlowDepth(pair, inWindow, dailyRows, flows, sectorByCode, nameByCode, volumeRatioByCode)");
    expect(quietPick).toContain("...(depth ? { depth } : {}),");
  });

  it("서버가 거시 상세 재료(업종·밴드)를 싣는다", () => {
    expect(quietPick).toContain("favorSectors: displaySectors(");
    expect(quietPick).toContain("hurtSectors: displaySectors(");
    expect(quietPick).toContain("macroBand(macroCollection.series[move.indicator.id] ?? [])");
  });

  it("흐름 카드를 누르면 흐름 상세가 열린다 — 재료가 없으면 열지 않는다", () => {
    expect(deck).toContain("if (!slot.card.depth) return;");
    expect(deck).toContain("setSelectedFlow(slot.card);");
    expect(deck).toContain("<FlowDepth");
  });

  it("두 상세 모두 걸음 점을 그린다 (완료 확인 10)", () => {
    expect(macro).toContain("<StepDots total={steps.length} index={index} />");
    expect(flow).toContain("<StepDots total={steps.length} index={index} />");
  });

  it("두 상세 모두 마지막 걸음이 즐겨찾기다 (완료 확인 8)", () => {
    for (const src of [macro, flow]) {
      expect(src).toContain("<WatchStep");
      expect(src).toContain("<WatchAction");
      expect(src.lastIndexOf('"watch"')).toBeGreaterThan(0);
    }
  });

  it("담는 대상이 지표·업종으로 갈린다 (완료 확인 9)", () => {
    expect(macro).toContain('kind: "indicator"');
    expect(flow).toContain('kind: "sector"');
  });

  it("상세에서 종목을 누르면 그 종목 상세로 간다 (완료 확인 7)", () => {
    expect(deck).toContain("const resolveStockDetail = (canonical: string): (() => void) | undefined =>");
    expect(deck).toContain("resolveStock={resolveStockDetail}");
    expect(macro).toContain("resolveStock?.(item.canonical)");
    expect(flow).toContain("resolveStock?.(row.name!)");
  });

  it("예측하지 않는다 — 상세 문구에 오를/내릴 거예요가 없다", () => {
    /*
      주석은 뺀다. 두 파일 모두 「그래서 오를 거예요를 덧붙이지 않는다」고 **적어 두었고**,
      그 다짐이 금칙어 검사에 걸려선 안 된다. 검사 대상은 화면에 나가는 문자열이다.
    */
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const src of [macro, flow]) {
      expect(code(src)).not.toMatch(/오를 거예요|내릴 거예요|오릅니다|급등할/);
    }
  });

  it("같은 돈이 옮겨갔다고 하지 않는다 (FLOW-01 §E-1)", () => {
    expect(flow).not.toMatch(/자금이 .*이동했어요|돈이 이동했어요/);
    expect(flow).toContain("같은 돈이 옮겨갔는지는 알 수 없어요");
  });
});
