/**
 * 트랙 합산 (UI-02 PART C).
 *
 * 이 계산이 틀리면 **화면의 가장 큰 숫자가 거짓이 된다.** 그래서 테스트가 있다.
 */
import { describe, expect, it } from "vitest";

import { buildPortfolio, TRACK_BASE_USD } from "../lib/lab/portfolio";
import type { FceTrackRow } from "../lib/lab/fce-board";

function track(over: Partial<FceTrackRow>): FceTrackRow {
  return {
    key: "crypto",
    label: "크립토",
    currency: "USDT",
    startingCapital: 500,
    currentCapital: 500,
    realized: null,
    unrealized: null,
    returnPct: null,
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
    asOf: new Date("2026-09-23T00:00:00Z"),
    ...over,
  };
}

describe("트랙 합산", () => {
  it("통화가 달라도 같은 무게를 갖는다 — KR 이 총합을 먹지 않는다", () => {
    const p = buildPortfolio([
      track({ key: "crypto", currency: "USDT", startingCapital: 500, currentCapital: 350 }),
      track({
        key: "stock_kr",
        label: "주식 KR",
        currency: "KRW",
        startingCapital: 100_000_000,
        currentCapital: 100_000_000,
      }),
    ]);

    // 크립토 −30%, KR 0% → 환산 총합은 −15% 여야 한다.
    // 그대로 더했다면 KR 1억이 500 을 덮어 −0.0002% 로 보였을 것이다.
    expect(p.tracks[0]?.normalized).toBeCloseTo(7000, 6);
    expect(p.tracks[1]?.normalized).toBeCloseTo(10_000, 6);
    expect(p.total).toBeCloseTo(17_000, 6);
    expect(p.changePct).toBeCloseTo(-15, 6);
  });

  it("정지 트랙도 합산에 넣는다 — 빼면 수익률이 좋아 보인다", () => {
    // 정지 트랙이 **더 나쁜** 경우로 잡는다. 멈춘 트랙은 보통 나쁜 상태에서
    // 멈추기 때문이고, 그럴 때 빼면 화면이 자기에게 유리하게 거짓말한다.
    // (처음엔 정지 트랙을 −10% 로 뒀다가 크립토 −30% 보다 나아서 방향이 뒤집혔다.
    //  테스트가 잡았다 — 규칙은 "빼면 좋아진다" 가 아니라 "빼지 않는다" 이다.)
    const rows = [
      track({ key: "crypto", startingCapital: 500, currentCapital: 350 }),
      track({
        key: "stock_us",
        label: "주식 US",
        currency: "USD",
        startingCapital: 100_000,
        currentCapital: 50_000,
        status: "stopped",
        statusReason: "체결 invariant",
      }),
    ];
    const withStopped = buildPortfolio(rows);
    const onlyRunning = buildPortfolio(rows.filter((r) => r.status === "running"));

    expect(withStopped.tracks).toHaveLength(2);
    expect(withStopped.total).toBeCloseTo(12_000, 6);
    // 넣으면 −40%, 빼면 −30%. **빼는 쪽이 좋아 보인다.** 그래서 넣는다.
    expect(withStopped.changePct).toBeCloseTo(-40, 6);
    expect(onlyRunning.changePct).toBeCloseTo(-30, 6);
    expect(withStopped.changePct).toBeLessThan(onlyRunning.changePct ?? 0);
  });

  it("평가액을 모르는 트랙은 0 으로 채우지 않고 빼되 그 사실을 남긴다", () => {
    const p = buildPortfolio([
      track({ key: "crypto", startingCapital: 500, currentCapital: 500 }),
      track({
        key: "polymarket",
        label: "폴리마켓",
        currency: "USDC",
        startingCapital: 10_000,
        currentCapital: null,
        status: "excluded",
        statusReason: "451 지역 차단 — NAV 미산출",
      }),
    ]);

    // 0 으로 채웠다면 총합 10,000 · −50% 가 됐을 것이다. 그건 전액 손실이라는 뜻이다.
    expect(p.total).toBeCloseTo(TRACK_BASE_USD, 6);
    expect(p.base).toBe(TRACK_BASE_USD);
    expect(p.changePct).toBeCloseTo(0, 6);
    expect(p.excluded).toEqual([
      { key: "polymarket", label: "폴리마켓", reason: "451 지역 차단 — NAV 미산출" },
    ]);
  });

  it("시작 자본이 0 이면 비율이 없다 — Infinity 로 총합을 망치지 않는다", () => {
    const p = buildPortfolio([
      track({ key: "crypto", startingCapital: 0, currentCapital: 100 }),
      track({ key: "whale", label: "고래", startingCapital: 500, currentCapital: 250 }),
    ]);
    expect(p.tracks[0]?.normalized).toBeNull();
    expect(Number.isFinite(p.total)).toBe(true);
    expect(p.total).toBeCloseTo(5000, 6);
  });

  it("벤치마크를 같은 방식으로 환산해 합친다", () => {
    const p = buildPortfolio([
      track({ key: "crypto", startingCapital: 500, currentCapital: 250, benchmarkReturnPct: 20 }),
      track({
        key: "stock_us",
        label: "주식 US",
        currency: "USD",
        startingCapital: 100_000,
        currentCapital: 110_000,
        benchmarkReturnPct: 5,
      }),
    ]);
    // 벤치마크 +20% · +5% → 환산 12,000 + 10,500 = 22,500 (분모 20,000) → +12.5%
    expect(p.benchmarkTotal).toBeCloseTo(22_500, 6);
    expect(p.benchmarkChangePct).toBeCloseTo(12.5, 6);
  });

  it("벤치마크가 하나도 없으면 null 이다 — 0 으로 만들지 않는다", () => {
    const p = buildPortfolio([track({ benchmarkReturnPct: null })]);
    expect(p.benchmarkTotal).toBeNull();
    expect(p.benchmarkChangePct).toBeNull();
  });
});
