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

  it("정지 트랙은 부제에 사유가 나온다 — 숨기지 않는다", () => {
    const o = buildOverview(
      input({ tracks: [track({ key: "stock_us", status: "stopped", statusReason: "체결 invariant" })] })
    );
    expect(o.tracks[0]?.subtitle).toBe("체결 invariant");
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
    expect(o.competition.baseline).toBeNull();
    expect(o.competition.beaten).toBe(0);
  });

  it("기준선보다 못한 트랙은 넘지 못한 것으로 센다", () => {
    // 오르다 한 번 꺾이는 BTC — 수익 +, 낙폭 − → 기준선이 양수
    const o = buildOverview(input({ ...losing, btc: hours(200, (i) => (i < 150 ? 100 + i : 250 - (i - 150))) }));
    expect(o.competition.baseline?.value).toBeGreaterThan(0);
    expect(o.competition.rows[0]?.beats).toBe(false);
    expect(o.competition.beaten).toBe(0);
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
