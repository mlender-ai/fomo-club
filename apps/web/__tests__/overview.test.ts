/**
 * Overview 조립 (UI-04). 화면이 거짓말하지 않게 하는 규칙들을 직접 찌른다.
 */
import { describe, expect, it } from "vitest";

import { buildOverview, mergeBands, type OverviewInput } from "../lib/lab/overview";
import type { FceTrackRow } from "../lib/lab/fce-board";

const NOW = new Date("2026-09-24T12:00:00Z");

function track(over: Partial<FceTrackRow>): FceTrackRow {
  return {
    key: "crypto",
    label: "크립토",
    currency: "USDT",
    startingCapital: 500,
    currentCapital: 500,
    realized: null,
    unrealized: null,
    returnPct: 0,
    trades: null,
    winRatePct: null,
    profitFactor: null,
    mddPct: null,
    sampleNote: null,
    status: "running",
    statusReason: null,
    evidenceNote: null,
    elapsedDays: null,
    calendarDays: null,
    leverage: null,
    benchmarkLabel: null,
    benchmarkReturnPct: null,
    asOf: NOW,
    ...over,
  };
}

function input(over: Partial<OverviewInput>): OverviewInput {
  return { tracks: [], trades: [], positions: [], btc: [], lostDays: [], research: [], now: NOW, ...over };
}

const day = (d: string, h = 0) => new Date(`2026-09-${d}T${String(h).padStart(2, "0")}:00:00Z`);

describe("Overview 곡선", () => {
  it("곡선 끝이 Hero 와 같다 — 마지막 점은 측정값이다", () => {
    const o = buildOverview(
      input({
        tracks: [track({ currentCapital: 400, returnPct: -20, trades: 2 })],
        trades: [
          { trackKey: "crypto", symbol: "BTC", direction: "long", exitAt: day("10"), netPnlUsdt: -50, netReturnPct: -10 },
          { trackKey: "crypto", symbol: "ETH", direction: "long", exitAt: day("20"), netPnlUsdt: -50, netReturnPct: -10 },
        ],
      })
    );
    const pts = o.series.points;
    expect(pts[0]?.value).toBeCloseTo(10_000, 6); // 시작은 트랙당 $10,000
    expect(pts[pts.length - 1]?.value).toBeCloseTo(o.hero.total, 6);
    expect(o.hero.total).toBeCloseTo(8_000, 6);
  });

  it("거래가 닫히기 전 시각에는 그 손익이 반영되지 않는다 — 실현 기준", () => {
    const o = buildOverview(
      input({
        tracks: [track({ currentCapital: 450, trades: 1 })],
        trades: [
          { trackKey: "crypto", symbol: "BTC", direction: "long", exitAt: day("20"), netPnlUsdt: -50, netReturnPct: -10 },
        ],
      })
    );
    const before = o.series.points.find((p) => p.at < day("20").toISOString());
    const after = o.series.points.find((p) => p.at > day("21").toISOString());
    expect(before?.value).toBeCloseTo(10_000, 6);
    expect(after?.value).toBeCloseTo(9_000, 6);
  });

  it("BTC 봉이 없는 시각은 벤치마크를 잇지 않는다 — 선이 끊긴다", () => {
    const o = buildOverview(
      input({
        tracks: [track({ trades: 1 })],
        trades: [
          { trackKey: "crypto", symbol: "BTC", direction: "long", exitAt: day("20"), netPnlUsdt: 0, netReturnPct: 0 },
        ],
        // 19일에만 봉이 있고 그 뒤로 없다
        btc: [
          { at: day("19", 0), close: 100 },
          { at: day("19", 1), close: 110 },
        ],
      })
    );
    const inside = o.series.points.find((p) => p.at === day("19", 1).toISOString() || p.at.startsWith("2026-09-19T0"));
    const later = o.series.points.find((p) => p.at.startsWith("2026-09-22"));
    expect(inside?.benchmark).not.toBeNull();
    expect(later?.benchmark).toBeNull();
  });
});

describe("Overview 트랙 정렬 (E-1)", () => {
  it("운용중 먼저 수익률 순, 그다음 보류·정지·제외", () => {
    const o = buildOverview(
      input({
        tracks: [
          track({ key: "polymarket", label: "폴리", status: "excluded", statusReason: "451", currentCapital: 500 }),
          track({ key: "stock_us", label: "US", status: "stopped", statusReason: "invariant", currentCapital: 500 }),
          track({ key: "crypto", label: "크립토", returnPct: -30, currentCapital: 350 }),
          track({ key: "stock_kr", label: "KR", status: "held", statusReason: "큐 보류", currentCapital: 500 }),
          track({ key: "whale", label: "고래", returnPct: -6, currentCapital: 470 }),
        ],
      })
    );
    expect(o.tracks.map((t) => t.key)).toEqual(["whale", "crypto", "stock_kr", "stock_us", "polymarket"]);
  });

  it("정지 트랙은 부제에 사유가 나온다 — 숨기지 않는다 (모르는 사유면 상태 이름)", () => {
    const o = buildOverview(
      input({ tracks: [track({ key: "stock_us", status: "stopped", statusReason: "원인 미상" })] })
    );
    expect(o.tracks[0]?.subtitle).toBe("정지");
    // 원문은 버리지 않는다 — 상세의 ⓘ 가 연다.
    expect(o.tracks[0]?.statusReason).toBe("원인 미상");
  });

  it("운용중 트랙 수가 상태 그대로다 — 보류는 운용중이 아니다", () => {
    const o = buildOverview(
      input({
        tracks: [
          track({ key: "crypto" }),
          track({ key: "whale" }),
          track({ key: "stock_kr", status: "held", statusReason: "큐 보류" }),
        ],
      })
    );
    expect(o.stats.running).toBe(2);
    expect(o.stats.total).toBe(3);
  });
});

describe("전략 경쟁 (H)", () => {
  const losing = {
    tracks: [track({ returnPct: -20, currentCapital: 400, trades: 1 })],
    trades: [
      { trackKey: "crypto", symbol: "BTC", direction: "long", exitAt: day("20"), netPnlUsdt: -100, netReturnPct: -20 },
    ],
  };
  const hours = (n: number, f: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => ({ at: new Date(day("15").getTime() + i * 3_600_000), close: f(i) }));

  it("BTC 가 오르기만 하면 낙폭이 0 이라 기준선을 만들 수 없다 — 만들어내지 않는다", () => {
    const o = buildOverview(input({ ...losing, btc: hours(200, (i) => 100 + i) }));
    expect(o.competition.rows[0]?.baseline).toBeNull();
    expect(o.competition.rows[0]?.beats).toBeNull();
    expect(o.competition.beaten).toBe(0);
  });

  it("기준선보다 못한 트랙은 넘지 못한 것으로 센다", () => {
    // 오르다 한 번 꺾이는 BTC — 수익 +, 낙폭 − → 기준선이 양수
    const o = buildOverview(input({ ...losing, btc: hours(200, (i) => (i < 150 ? 100 + i : 250 - (i - 150))) }));
    expect(o.competition.rows[0]?.baseline?.value).toBeGreaterThan(0);
    expect(o.competition.rows[0]?.beats).toBe(false);
    expect(o.competition.beaten).toBe(0);
    expect(o.competition.measured).toBe(1);
  });

  it("기준선은 트랙마다 그 트랙 시작일부터 잰다 (UI-FIX B-4)", () => {
    // BTC: 15일~ 오르다 꺾이고, 23일부터는 오르기만 한다.
    const btc = hours(240, (i) => (i < 100 ? 100 + i : i < 150 ? 200 - (i - 100) : 150 + (i - 150)));
    const o = buildOverview(
      input({
        tracks: [
          track({ key: "crypto", returnPct: -10, currentCapital: 450 }),
          track({ key: "whale", label: "고래 추종", returnPct: -5, currentCapital: 475 }),
        ],
        trades: [
          { trackKey: "crypto", symbol: "A", direction: "long", exitAt: day("16", 12), netPnlUsdt: -50, netReturnPct: -10 },
          { trackKey: "whale", symbol: "B", direction: "long", exitAt: day("22", 12), netPnlUsdt: -25, netReturnPct: -5 },
        ],
        btc,
      })
    );
    const crypto = o.competition.rows.find((r) => r.key === "crypto");
    const whale = o.competition.rows.find((r) => r.key === "whale");
    expect(crypto?.from.slice(0, 10)).toBe("2026-09-15");
    expect(whale?.from.slice(0, 10)).toBe("2026-09-21");
    // 기간이 다르면 기준선도 다르다 — 한 값으로 둘을 재지 않는다.
    expect(crypto?.baseline?.value).not.toBeCloseTo(whale?.baseline?.value ?? 0, 3);
  });
});

describe("거래 수는 원장 하나에서 (UI-FIX B-5)", () => {
  it("FCE 채점판 N 이 아니라 닫힌 거래 행을 센다 — 복기와 같은 모집단", () => {
    const o = buildOverview(
      input({
        tracks: [
          // 채점판은 검증 창 안의 거래만 세서 1 이라고 말한다
          track({ key: "crypto", trades: 1, winRatePct: 100 }),
          // 주식 체결은 원장에 없다 — 누적 거래에 섞지 않는다
          track({ key: "stock_us", label: "주식 US", trades: 3, status: "stopped" }),
        ],
        trades: [
          { trackKey: "crypto", symbol: "A", direction: "long", exitAt: day("10"), netPnlUsdt: -5, netReturnPct: -1 },
          { trackKey: "crypto", symbol: "B", direction: "long", exitAt: day("19"), netPnlUsdt: 10, netReturnPct: 2 },
          { trackKey: "crypto", symbol: "C", direction: "long", exitAt: day("20"), netPnlUsdt: 0, netReturnPct: 0 },
        ],
      })
    );
    expect(o.stats.trades).toBe(3);
    expect(o.ledger.crypto?.count).toBe(3);
    expect(o.ledger.crypto?.wins).toBe(1);
    // FCE 와 같은 공식 — 승 ÷ 전체 (0원 거래도 분모에 남는다)
    expect(o.ledger.crypto?.winRatePct).toBeCloseTo(100 / 3, 6);
    expect(o.ledger.crypto?.profitFactor).toBeCloseTo(2, 6);
    expect(o.ledger.stock_us).toBeUndefined();
  });

  it("정지 트랙의 부제는 에러 코드가 아니라 사람 말이다 (A-4)", () => {
    const o = buildOverview(
      input({
        tracks: [
          track({
            key: "stock_us",
            status: "stopped",
            statusReason: "체결 invariant — fill_price_outside_observed_range",
          }),
          track({ key: "stock_kr", status: "held", statusReason: "봉 불일치 정지 예방 · 대기 주문 13,940건" }),
          track({ key: "polymarket", status: "excluded", statusReason: "451 지역 차단 · 평가 불가 보유 8건 → NAV 미산출" }),
        ],
      })
    );
    const sub = Object.fromEntries(o.tracks.map((t) => [t.key, t.subtitle]));
    expect(sub).toEqual({ stock_us: "체결 가격 이상", stock_kr: "데이터 불일치", polymarket: "지역 차단" });
  });
});

describe("유실일 띠 (C-2)", () => {
  it("붙어 있는 날은 한 띠로 묶는다", () => {
    const bands = mergeBands(
      [
        { trackKey: "crypto", day: "2026-09-18", coveragePct: 12.5, reason: "" },
        { trackKey: "crypto", day: "2026-09-19", coveragePct: 19.8, reason: "" },
        { trackKey: "crypto", day: "2026-09-21", coveragePct: 53, reason: "" },
      ],
      Date.parse("2026-09-01T00:00:00Z"),
      Date.parse("2026-09-30T00:00:00Z")
    );
    expect(bands).toHaveLength(2);
    expect(bands[0]?.days).toBe(2);
    expect(bands[0]?.minCoveragePct).toBe(12.5);
  });
});
