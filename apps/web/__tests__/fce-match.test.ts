/**
 * UI-10 PART D — **숫자가 FCE 와 같다.** 하나라도 다르면 실패.
 *
 * 견본은 같은 시각(2026-09-27 02:52)의 FCE 값(`TRACKS`)과 FCE 원장(`journal.json`)이다. 랩이 원장으로 센 성적이
 * FCE 가 낸 성적과 **소수점까지** 같아야 한다 — 다르면 랩이 계산을 다시 하고 있는 것이다.
 */
import { describe, expect, it } from "vitest";

import { ledgerStats, populationOf } from "../lib/lab/overview";
import { TRACKS, TRADES, fixtures } from "./fixtures/lab";

const data = fixtures();
const stats = ledgerStats(TRADES, populationOf(TRACKS));
const fce = (key: string) => TRACKS.find((t) => t.key === key)!;

describe("랩이 센 성적 = FCE 가 낸 성적", () => {
  for (const key of ["crypto", "whale"]) {
    it(`${key} — N · 승률 · PF`, () => {
      const s = stats.get(key)!;
      expect(s.count).toBe(fce(key).trades);
      expect(Number((s.winRatePct as number).toFixed(1))).toBeCloseTo(fce(key).winRatePct as number, 1);
      expect(s.profitFactor as number).toBeCloseTo(fce(key).profitFactor as number, 2);
    });
  }

  it("전략 탭 · Overview · 복기가 같은 거래 수 — 그리고 그게 FCE 의 N 이다", () => {
    const crypto = data.strategies.rows.find((r) => r.key === "crypto")!;
    const whale = data.strategies.rows.find((r) => r.key === "whale")!;
    expect(crypto.trades).toBe(165);
    expect(whale.trades).toBe(94);
    expect(data.overview.stats.trades).toBe(165 + 94);
    expect(data.journal.total.count).toBe(165 + 94);
  });

  it("MDD 는 FCE 값 — 랩이 곡선으로 다시 재지 않는다(FCE 가 낼 때)", () => {
    const crypto = data.strategies.rows.find((r) => r.key === "crypto")!;
    expect(Math.abs(crypto.mddPct as number)).toBeCloseTo(36.8944, 4);
  });

  it("자본은 FCE 자본 블록 그대로", () => {
    const t = data.strategies.portfolio.tracks.find((x) => x.key === "crypto")!;
    expect(t.nativeCurrent).toBe(364.9352);
  });
});
