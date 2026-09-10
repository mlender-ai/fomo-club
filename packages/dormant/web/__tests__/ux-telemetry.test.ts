import { describe, expect, it } from "vitest";
import { aggregateRows, applyUxEvents, normalizeSessionId, percentile, type UxSessionRow } from "../lib/ux-telemetry";

/**
 * WO-SUB-00 §4-2 — 계측 적재·집계 규칙.
 * 기준선 숫자가 여기서 나오므로 산식이 흔들리면 이후 A/B 판정이 전부 흔들린다.
 */

function row(overrides: Partial<UxSessionRow> = {}): UxSessionRow {
  return {
    sessionId: "sess-abcdef",
    date: "2026-07-27",
    updatedAt: "2026-07-27T00:00:00.000Z",
    counts: {},
    dwellMs: [],
    scrollRatios: [],
    cardsConsumed: [],
    viewByPosition: {},
    skipByPosition: {},
    ...overrides,
  };
}

describe("세션 식별자", () => {
  it("안전 문자·길이만 통과", () => {
    expect(normalizeSessionId("abc123-_XYZ")).toBe("abc123-_XYZ");
    expect(normalizeSessionId("짧음")).toBeNull();
    expect(normalizeSessionId("has space here")).toBeNull();
    expect(normalizeSessionId(123)).toBeNull();
    expect(normalizeSessionId(null)).toBeNull();
  });
});

describe("이벤트 접기", () => {
  it("알 수 없는 이벤트는 버린다", () => {
    const next = applyUxEvents(row(), [{ event: "bogus" as never }]);
    expect(next.counts).toEqual({});
  });

  it("체류시간은 10분에서 자른다(탭 열어두고 떠난 세션 방지)", () => {
    const next = applyUxEvents(row(), [{ event: "card_dwell", durationMs: 9_999_999 }]);
    expect(next.dwellMs).toEqual([600_000]);
  });

  it("음수 체류시간은 0으로", () => {
    expect(applyUxEvents(row(), [{ event: "card_dwell", durationMs: -50 }]).dwellMs).toEqual([0]);
  });

  it("스크롤 비율은 0~1 로 클램프", () => {
    const next = applyUxEvents(row(), [
      { event: "detail_scroll_depth", maxRatio: 1.7 },
      { event: "detail_scroll_depth", maxRatio: -0.2 },
    ]);
    expect(next.scrollRatios).toEqual([1, 0]);
  });

  it("위치는 1~50 밖이면 버린다(카운트는 유지)", () => {
    const next = applyUxEvents(row(), [
      { event: "card_view", position: 0 },
      { event: "card_view", position: 999 },
      { event: "card_view", position: 3 },
    ]);
    expect(next.viewByPosition).toEqual({ "3": 1 });
    expect(next.counts.card_view).toBe(3);
  });

  it("입력 행을 변형하지 않는다(append-only 성격 유지)", () => {
    const base = row();
    applyUxEvents(base, [{ event: "card_view", position: 1 }]);
    expect(base.counts).toEqual({});
    expect(base.viewByPosition).toEqual({});
  });

  it("표본 배열은 상한을 넘지 않는다", () => {
    const many = Array.from({ length: 500 }, () => ({ event: "card_dwell" as const, durationMs: 100 }));
    expect(applyUxEvents(row(), many).dwellMs).toHaveLength(200);
  });
});

describe("백분위", () => {
  it("빈 배열은 null(0 으로 채우지 않는다)", () => {
    expect(percentile([], 50)).toBeNull();
  });

  it("중앙값·p90", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 90)).toBe(9);
  });
});

describe("집계", () => {
  it("비율은 분모가 0이면 null — 0% 로 위장하지 않는다", () => {
    const agg = aggregateRows([], "2026-07-27");
    expect(agg.detailOpenRate).toBeNull();
    expect(agg.watchlistRate).toBeNull();
    expect(agg.deckCompleteRate).toBeNull();
    expect(agg.sessions).toBe(0);
  });

  it("여러 세션을 합산하고 위치별 이탈률을 낸다", () => {
    const a = row({
      counts: { card_view: 4, card_detail_open: 1, card_watchlist_add: 1, deck_complete: 1 },
      dwellMs: [1000, 3000],
      scrollRatios: [0.4, 0.9],
      viewByPosition: { "1": 1, "2": 1 },
      skipByPosition: { "2": 1 },
    });
    const b = row({
      sessionId: "sess-second",
      counts: { card_view: 2, card_detail_open: 1 },
      dwellMs: [2000],
      viewByPosition: { "1": 1 },
    });
    const agg = aggregateRows([a, b], "2026-07-27");
    expect(agg.sessions).toBe(2);
    expect(agg.counts.card_view).toBe(6);
    expect(agg.detailOpenRate).toBeCloseTo(33.33, 1); // 2/6
    expect(agg.watchlistRate).toBeCloseTo(16.67, 1); // 1/6
    expect(agg.deckCompleteRate).toBe(50); // 1 완주 / 위치1 노출 2
    expect(agg.skipRateByPosition["2"]).toBe(100); // 2번 위치 노출 1 중 이탈 1
    expect(agg.skipRateByPosition["1"]).toBe(0);
    expect(agg.dwellMsP50).toBe(2000);
  });
});

/**
 * WO-SUB-04 사후 비교 준비 — 슬롯 구성 라벨.
 *
 * A/B 검정력이 부족해(`POWER_wo_sub_04_ab.md`) 사후 비교로 내려왔고, 그러려면 이벤트에
 * ③ 유무가 붙어야 한다. 종전에는 `position` 만 있어 두 군으로 쪼갤 수 없었다.
 */
describe("슬롯 구성 라벨 (사후 비교 입력)", () => {
  const row = (): UxSessionRow => ({
    sessionId: "s1",
    date: "2026-08-08",
    updatedAt: "",
    counts: {},
    dwellMs: [],
    scrollRatios: [],
    cardsConsumed: [],
    viewByPosition: {},
    skipByPosition: {},
    bySlotGroup: {},
  });

  it("라벨별로 카운트를 나눈다", () => {
    const next = applyUxEvents(row(), [
      { event: "card_view", position: 1, hasChart: true, hasSubstance: true, hasRisk: true },
      { event: "card_view", position: 2, hasChart: false, hasSubstance: false, hasRisk: false },
      { event: "card_detail_open", position: 1, entryPoint: "tap", hasChart: true, hasSubstance: true, hasRisk: true },
    ]);
    expect(next.bySlotGroup?.["chart:1|substance:1|risk:1"]).toEqual({ card_view: 1, card_detail_open: 1 });
    expect(next.bySlotGroup?.["chart:0|substance:0|risk:0"]).toEqual({ card_view: 1 });
  });

  /** 라벨이 없으면 `?` 군이다 — 조용히 제외하면 분모가 줄어 비율이 왜곡된다. */
  it("라벨 없는 이벤트를 버리지 않고 ? 군에 남긴다", () => {
    const next = applyUxEvents(row(), [{ event: "card_view", position: 1 }]);
    expect(next.bySlotGroup?.["chart:?|substance:?|risk:?"]).toEqual({ card_view: 1 });
  });

  it("구버전 행(bySlotGroup 없음)을 읽어도 깨지지 않는다", () => {
    const legacy = { ...row() };
    delete (legacy as { bySlotGroup?: unknown }).bySlotGroup;
    const next = applyUxEvents(legacy as UxSessionRow, [{ event: "card_view", position: 1, hasChart: true }]);
    expect(next.bySlotGroup?.["chart:1|substance:?|risk:?"]).toEqual({ card_view: 1 });
  });
});

describe("사후 비교 집계", () => {
  function rowWith(groups: NonNullable<UxSessionRow["bySlotGroup"]>): UxSessionRow {
    return {
      sessionId: "s",
      date: "2026-08-08",
      updatedAt: "",
      counts: {},
      dwellMs: [],
      scrollRatios: [],
      cardsConsumed: [],
      viewByPosition: {},
      skipByPosition: {},
      bySlotGroup: groups,
    };
  }

  /** 표본이 적으면 성공 1건에 비율이 튄다 — 그 구간에서는 비율을 만들지 않는다. */
  it("두 군 중 하나라도 표본이 부족하면 비율을 내지 않고 사유를 남긴다", () => {
    const result = aggregateRows(
      [rowWith({ "chart:1|substance:1|risk:1": { card_view: 5, card_detail_open: 1 } })],
      "2026-08-08"
    );
    expect(result.slotComparison.withChart.detailOpenRate).toBeNull();
    expect(result.slotComparison.insufficient).toContain("표본 부족");
  });

  it("두 군 모두 충분하면 비율을 낸다", () => {
    const result = aggregateRows(
      [
        rowWith({
          "chart:1|substance:1|risk:1": { card_view: 100, card_detail_open: 8 },
          "chart:0|substance:0|risk:0": { card_view: 50, card_detail_open: 2 },
        }),
      ],
      "2026-08-08"
    );
    expect(result.slotComparison.withChart.detailOpenRate).toBe(8);
    expect(result.slotComparison.withoutChart.detailOpenRate).toBe(4);
    expect(result.slotComparison.insufficient).toBeNull();
  });

  /** 인과로 읽으면 안 된다는 사실이 응답에 실려야 화면이 숨길 수 없다. */
  it("무작위 배정이 아니라는 경고를 응답에 담는다", () => {
    const result = aggregateRows([rowWith({})], "2026-08-08");
    expect(result.slotComparison.caveat).toContain("무작위 배정이 아니다");
    expect(result.slotComparison.caveat).toContain("선택 편향");
  });
});
