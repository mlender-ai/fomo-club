import { describe, it, expect } from "vitest";
import { computeSignal } from "../signal/computeSignal.js";
import { checkSafety } from "../safety/forbidden.js";
import type { MarketSnapshot } from "../types.js";
import type { FinancialContext } from "../prompts/interpret-v2.2.0.js";

function base(): MarketSnapshot {
  return {
    ticker: "AAPL",
    market: "US",
    price: 200,
    changePercent: 0,
    volume: 1_000_000,
    condition: "neutral",
    summary: "",
  };
}

function bull(): MarketSnapshot {
  return {
    ...base(),
    price: 200,
    changePercent: 1.5,
    rsi: 68,
    macdHistogram: 1.2,
    sma20: 190,
    sma200: 170,
    fiftyTwoWeekPosition: 0.85,
    momentum20: 20,
    daysAboveSma200: 12,
    condition: "bullish",
  };
}

function bear(): MarketSnapshot {
  return {
    ...base(),
    price: 150,
    changePercent: -2,
    rsi: 32,
    macdHistogram: -1.1,
    sma20: 160,
    sma200: 185,
    fiftyTwoWeekPosition: 0.15,
    momentum20: -18,
    condition: "bearish",
  };
}

const bullCtx: FinancialContext = { revenueGrowth: 0.3, profitMargins: 0.25, returnOnEquity: 0.22, debtToEquity: 80 };
const bearCtx: FinancialContext = { revenueGrowth: -0.1, profitMargins: 0.02, returnOnEquity: 0.03, debtToEquity: 250 };

describe("computeSignal — 결정론적 척추 점수", () => {
  it("상승 스냅샷 → 높은 점수·상위 등급·bullish 상태", () => {
    const s = computeSignal(bull(), bullCtx);
    expect(s.score).toBeGreaterThanOrEqual(70);
    expect(["S", "AA", "A"]).toContain(s.grade);
    expect(s.state).toBe("bullish");
  });

  it("하락 스냅샷 → 낮은 점수·bearish 상태", () => {
    const s = computeSignal(bear(), bearCtx);
    expect(s.score).toBeLessThanOrEqual(35);
    expect(s.state).toBe("bearish");
  });

  it("중립(단서 거의 없음) → 40~60 사이", () => {
    const s = computeSignal({ ...base(), rsi: 50, fiftyTwoWeekPosition: 0.5 });
    expect(s.score).toBeGreaterThanOrEqual(40);
    expect(s.score).toBeLessThanOrEqual(60);
  });

  it("결정론적 — 같은 입력 같은 출력", () => {
    expect(computeSignal(bull(), bullCtx)).toEqual(computeSignal(bull(), bullCtx));
  });
});

describe("computeSignal — 드라이버", () => {
  it("드라이버는 정량 detail을 갖고 기여도순 정렬", () => {
    const s = computeSignal(bull(), bullCtx);
    expect(s.drivers.length).toBeGreaterThan(0);
    for (const d of s.drivers) {
      expect(d.detail.length).toBeGreaterThan(0);
      expect(["up", "down", "flat"]).toContain(d.direction);
    }
    // weight*|contribution| 내림차순
    const mag = s.drivers.map((d) => Math.abs(d.contribution) * d.weight);
    for (let i = 1; i < mag.length; i++) expect(mag[i - 1]).toBeGreaterThanOrEqual(mag[i]!);
  });

  it("ctx 없으면 fundamental 드라이버 없음(있는 입력만)", () => {
    const s = computeSignal(bull());
    expect(s.drivers.every((d) => d.kind === "technical")).toBe(true);
  });

  it("RSI 드라이버 방향은 값과 일치", () => {
    const s = computeSignal(bull(), bullCtx);
    const rsi = s.drivers.find((d) => d.key === "rsi");
    expect(rsi?.direction).toBe("up");
  });
});

describe("computeSignal — 시간축 trajectory & 규제", () => {
  it("momentum/200일선 일수가 있으면 trajectory 문장 생성", () => {
    const s = computeSignal(bull(), bullCtx);
    expect(s.trajectory.length).toBeGreaterThan(0);
    expect(s.trajectory.join(" ")).toMatch(/200일선|20봉|모멘텀/);
  });

  it("드라이버 detail은 투자조언 금칙어를 포함하지 않는다(BLOCKED 아님)", () => {
    const s = computeSignal(bull(), bullCtx);
    const text = s.drivers.map((d) => d.detail).join(" ") + " " + s.trajectory.join(" ");
    expect(checkSafety(text).result).not.toBe("BLOCKED");
  });
});
