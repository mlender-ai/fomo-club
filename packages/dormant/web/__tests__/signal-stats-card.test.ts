import { describe, expect, it } from "vitest";
import { buildSignalStatsCopy, backtestSignal, type BacktestSample, type DailyOhlcv } from "@fomo/core";
import { reconstructClusters, parseTickerPurchaseRows } from "../lib/insider-source";
import { detectStreakSignalDates } from "../lib/signal-backtest-job";

/**
 * WO-P2 §1·§2 가드 — 카드가 "무조건 오르나?"에 답하는 형태를 코드로 못박는다.
 * ① 상승만 말하는 문구 금지(하락 표현 필수) ② 표본 없으면 블록 자체가 없어야 함
 * ③ 과거 클러스터/스트릭 재구성이 실제 데이터 형태에서 동작.
 */

function candlesFrom(closes: readonly number[]): DailyOhlcv[] {
  return closes.map((close, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    return {
      date: d.toISOString().slice(0, 10),
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    };
  });
}

function sample(symbol: string, pct: number): BacktestSample {
  const series = Array.from({ length: 40 }, (_, i) => (i === 0 ? 100 : 100 * (1 + (pct / 100) * Math.min(i, 30) / 30)));
  return { symbol, signalDate: "2026-01-01", candles: candlesFrom(series) };
}

describe("카드 문구 — 상승만 말하는 카드 0 (WO-P2 §2)", () => {
  // 노출 게이트가 n>=30(WO-P6 — n<30 은 숫자 미노출)이라 표본을 그 위로 잡는다.
  const stats = backtestSignal(
    [...Array.from({ length: 27 }, (_, i) => sample(`U${i}`, 8)), ...Array.from({ length: 15 }, (_, i) => sample(`D${i}`, -6))],
    { type: "insider_cluster", computedAt: "2026-07-08" }
  );

  it("승률·표본수·중앙값·하락이 한 세트로 나온다", () => {
    const copy = buildSignalStatsCopy(stats)!;
    const blob = `${copy.headline} ${copy.detail}`;
    expect(blob).toMatch(/\d+번 중 \d+번 올랐어요/); // 승률(건수)
    expect(blob).toMatch(/\(\d+%\)/); // 승률(%)
    expect(blob).toMatch(/중앙값/); // 중앙값
    expect(blob).toMatch(/내렸어요|내린 적/); // ★하락 — 없으면 실패
  });

  it("방법론 한 줄이 함께 온다(정직 규칙 ②)", () => {
    const copy = buildSignalStatsCopy(stats)!;
    expect(copy.method).toMatch(/종가/);
    expect(copy.sourceLabel).toMatch(/역산|실전/);
  });

  it("통계가 없으면 문구도 없다 → 카드가 블록을 숨긴다(빈 껍데기 금지)", () => {
    expect(buildSignalStatsCopy(null)).toBeNull();
    // 표본 미달(=통계 미생성)도 동일
    const few = backtestSignal([sample("A", 5)], { type: "insider_cluster", computedAt: "2026-07-08" });
    expect(few).toBeNull();
    expect(buildSignalStatsCopy(few)).toBeNull();
  });
});

describe("과거 클러스터 재구성 (openinsider screener → 표본)", () => {
  it("며칠 안에 서로 다른 내부자 2명 이상이면 1건, 마지막 거래일이 신호일", () => {
    const rows = [
      { tradeDate: "2026-01-05", insider: "Kim A" },
      { tradeDate: "2026-01-07", insider: "Lee B" },
    ];
    const clusters = reconstructClusters("ABC", rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.signalDate).toBe("2026-01-07");
    expect(clusters[0]!.insiderCount).toBe(2);
  });

  it("같은 사람이 여러 번 사도 클러스터가 아니다(내부자 수 기준)", () => {
    const rows = [
      { tradeDate: "2026-01-05", insider: "Kim A" },
      { tradeDate: "2026-01-06", insider: "Kim A" },
      { tradeDate: "2026-01-07", insider: "kim a" }, // 대소문자 동일인
    ];
    expect(reconstructClusters("ABC", rows)).toHaveLength(0);
  });

  it("며칠에 걸친 매집은 한 사건(마지막 거래일이 신호일), 쿨다운 뒤에야 새 사건", () => {
    const rows = [
      { tradeDate: "2026-01-05", insider: "A" },
      { tradeDate: "2026-01-06", insider: "B" },
      { tradeDate: "2026-01-08", insider: "C" }, // 5일 창 안 → 같은 사건에 흡수
      { tradeDate: "2026-03-02", insider: "D" },
      { tradeDate: "2026-03-03", insider: "E" }, // 쿨다운(30일) 지남 → 새 사건
    ];
    const clusters = reconstructClusters("ABC", rows);
    expect(clusters).toHaveLength(2); // 3인이 나눠 샀다고 표본 3건이 되지 않는다
    expect(clusters.map((c) => c.signalDate)).toEqual(["2026-01-08", "2026-03-03"]);
    expect(clusters[0]!.insiderCount).toBe(3);
  });

  it("테이블 없는 HTML → 빈 배열(가짜 표본 금지)", () => {
    expect(parseTickerPurchaseRows("<html><body>no table</body></html>")).toEqual([]);
    expect(reconstructClusters("ABC", [])).toEqual([]);
  });
});

describe("KR 수급 스트릭 역산", () => {
  const day = (n: number) => `2026-01-${String(n).padStart(2, "0")}`;

  it("3일 이상 연속 순매수가 끊긴 날이 신호일", () => {
    const rows = [
      { date: day(1), net: 100 },
      { date: day(2), net: 200 },
      { date: day(3), net: 50 },
      { date: day(4), net: -10 }, // 끊김 → 신호일 = 01-03
      { date: day(5), net: 30 },
    ];
    expect(detectStreakSignalDates(rows)).toEqual([day(3)]);
  });

  it("연속 2일은 신호가 아니다(최소 3일)", () => {
    const rows = [
      { date: day(1), net: 100 },
      { date: day(2), net: 100 },
      { date: day(3), net: -5 },
    ];
    expect(detectStreakSignalDates(rows)).toEqual([]);
  });

  it("마지막까지 이어지는 스트릭도 신호로 잡는다", () => {
    const rows = [day(1), day(2), day(3)].map((date) => ({ date, net: 10 }));
    expect(detectStreakSignalDates(rows)).toEqual([day(3)]);
  });

  it("빈 입력 → 빈 배열", () => {
    expect(detectStreakSignalDates([])).toEqual([]);
  });
});
