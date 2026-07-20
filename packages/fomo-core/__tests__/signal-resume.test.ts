import { describe, expect, it } from "vitest";
import {
  SIGNAL_RESUME_MIN_SAMPLE,
  SIGNAL_TYPE_CODES,
  formatSignalResumeBadge,
  inferStandardSignalTypes,
  normalizeSignalTypeCodes,
  signalPerformanceBonus,
} from "../src/keyword-cards/signal-resume";

describe("signal resume taxonomy", () => {
  it("미등록 코드 제거와 제품 우선순위 정렬이 결정론적이다", () => {
    expect(normalizeSignalTypeCodes(["score_80_plus", "unknown", "foreign_streak", "foreign_streak"])).toEqual([
      "foreign_streak",
      "score_80_plus",
    ]);
    expect(new Set(SIGNAL_TYPE_CODES).size).toBe(SIGNAL_TYPE_CODES.length);
  });

  it("n<30은 승률을 숨기고 표본수만 공개한다", () => {
    const text = formatSignalResumeBadge("insider_cluster", { n: SIGNAL_RESUME_MIN_SAMPLE - 1, winRate: 96.4, medianReturn: 12 });
    expect(text).toBe("내부자 클러스터 매수 · 축적 중 (n=29)");
    expect(text).not.toContain("96.4");
  });

  it("실데이터 필드와 최근 와이코프 이벤트만 표준 코드로 판정한다", () => {
    expect(inferStandardSignalTypes({
      headline: "내부자 3명 클러스터 매수 뒤 공급계약 공시",
      signals: { institutionNetStreak: 4, foreignNetStreak: 3 },
      companyScore: 84,
      wyckoff: {
        sourceLength: 100,
        zones: [],
        events: [
          { kind: "spring", index: 10, price: 90, label: "과거 스프링", explanation: "과거" },
          { kind: "pullback", index: 94, price: 103, label: "최근 눌림목", explanation: "최근" },
        ],
      },
    })).toEqual([
      "insider_cluster",
      "institution_streak",
      "foreign_streak",
      "pullback",
      "material_contract",
      "score_80_plus",
    ]);
  });

  it("충분한 표본의 좋은 성과만 quietScore에 최대 3점 보조한다", () => {
    expect(signalPerformanceBonus(["foreign_streak"], { foreign_streak: { n: 29, winRate: 90, medianReturn: 5 } })).toBe(0);
    expect(signalPerformanceBonus(["foreign_streak"], { foreign_streak: { n: 80, winRate: 68, medianReturn: 5 } })).toBe(1.8);
    expect(signalPerformanceBonus(["foreign_streak"], { foreign_streak: { n: 80, winRate: 95, medianReturn: 5 } })).toBe(3);
    expect(signalPerformanceBonus(["foreign_streak"], { foreign_streak: { n: 80, winRate: 42, medianReturn: -2 } })).toBe(0);
  });

  it("다중 주체 클러스터를 독립 이력 코드로 기록한다", () => {
    expect(inferStandardSignalTypes({
      quietMoney: {
        asOf: "2026-07-17",
        events: [],
        cluster: {
          type: "cluster_multi",
          windowTradingDays: 10,
          actors: ["insider", "institution"],
          actorCount: 2,
          startDate: "2026-07-10",
          endDate: "2026-07-17",
          strength: 3,
          headline: "내부자·기관 동시 유입 · 10거래일 내 2개 주체",
          evidence: [],
        },
      },
    })).toEqual(["cluster_multi"]);
  });
});
