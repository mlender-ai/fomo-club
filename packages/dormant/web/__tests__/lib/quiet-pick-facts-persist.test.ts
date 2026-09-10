import { describe, expect, it } from "vitest";
import { quietPickLedgerEntries, type QuietPickResponse } from "../../lib/quiet-pick";

/**
 * WO-SYNC F-2 회귀 고정 — 엔진이 계산한 실수치가 문장으로만 남고 사라지면 안 된다.
 * 2026-08-16 실사에서 발행 10장의 anomalies 수치 필드가 0개였다.
 */

function response(pick: Partial<QuietPickResponse["picks"][number]>): QuietPickResponse {
  return {
    asOf: "2026-08-16T21:41:50.000Z",
    date: "2026-08-16",
    picks: [
      {
        subject: { canonical: "빅텍", symbol: "065450", market: "KOSDAQ", country: "KR" },
        price: { current: 3030, sparkline: [] },
        signal: {
          kind: "institution_streak",
          code: "institution_streak",
          actors: "기관",
          scale: "77주",
          days: 26,
          priceAtSignal: 3005,
          startedAt: "2026-07-09",
          strength: 360,
        },
        hook: "기관이 26일째 조용히 사고 있어요",
        chips: [],
        anomalies: [{ kind: "vacuum", text: "거래가 평소의 30%로 말라 있었어요", chip: null, strength: 3.5 }],
        invalidation: { level: null, text: "" },
        conviction: { whyCompany: "", whyNow: {}, committee: { timingGrade: "C", valuationGrade: "B", verdict1line: "" } },
        companyScore: null,
        dataQuality: { candles: 260, fundamentals: true, ticker: true, identity: true },
        qualifiedAt: "2026-08-16",
        ...pick,
      },
    ],
    qualification: null,
  } as unknown as QuietPickResponse;
}

describe("발행 시점 실수치 박제 (WO-SYNC F-2)", () => {
  it("signalFacts 가 판단 원장 페이로드에 실린다 — 사후 채점이 문장 파싱 없이 가능해야 한다", () => {
    const entries = quietPickLedgerEntries(
      response({ signalFacts: { volumeVacuumRatio: 0.3, pctAboveYearLow: 12.4, volumePct: 8.1 } })
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.payload).toMatchObject({
      signalFacts: { volumeVacuumRatio: 0.3, pctAboveYearLow: 12.4, volumePct: 8.1 },
    });
  });

  it("수치가 없으면 필드를 만들지 않는다 — 0 으로 채우지 않는다", () => {
    const entries = quietPickLedgerEntries(response({}));
    expect(entries[0]?.payload).not.toHaveProperty("signalFacts");
  });

  it("문장에 녹은 30% 가 수치 0.3 으로 복원 가능하다", () => {
    const picks = response({ signalFacts: { volumeVacuumRatio: 0.3 } }).picks;
    // 카드는 문장을 되파싱하지 않고 이 값을 읽는다.
    expect(picks[0]?.signalFacts?.volumeVacuumRatio).toBe(0.3);
    expect(picks[0]?.anomalies[0]?.text).toContain("30%");
  });
});
