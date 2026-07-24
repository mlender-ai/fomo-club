import { describe, expect, it } from "vitest";
import {
  computeQuietPickAnomalies,
  buildQuietPickHook,
  buildCommitteeVerdictLine,
  type QuietPickAnomalyFacts,
  type QuietPickSignalKind,
} from "../src";

const KINDS: QuietPickSignalKind[] = ["insider_cluster", "institution_streak", "foreign_streak", "multi_cluster"];

/** 30개 결정론 입력 — 실측처럼 수치가 종목마다 다르다(단조 증가로 유니크 보장, 난수 없음). */
function thirtyFacts(): QuietPickAnomalyFacts[] {
  const out: QuietPickAnomalyFacts[] = [];
  for (let i = 0; i < 30; i += 1) {
    const kind = KINDS[i % KINDS.length]!;
    const days = 3 + i;
    if (kind === "insider_cluster") {
      const insiderCount = 3 + i; // 3..32 (>=8 이면 참여 이례성)
      out.push({
        kind,
        actorNoun: "내부자",
        actors: `내부자 ${insiderCount}명`,
        scale: `$${(0.5 + i * 0.4).toFixed(1)}M`,
        days,
        insiderCount,
        priorBuys12mo: i % 9, // 0..8 → 빈도 이례성 발화
        volumePct: 18 + i * 3,
        mentionCount: i % 3 === 0 ? 0 : 5,
      });
    } else {
      out.push({
        kind,
        actorNoun: kind === "foreign_streak" ? "외국인" : kind === "institution_streak" ? "기관" : "외국인·기관",
        actors: kind === "foreign_streak" ? "외국인" : kind === "institution_streak" ? "기관" : "외국인·기관",
        scale: `${8 + i * 3}만주`,
        days,
        volumePct: 21 + i * 2,
        mentionCount: i % 2 === 0 ? 0 : 3,
        isLongestStreak: i % 2 === 0,
        streakWindowDays: 40,
      });
    }
  }
  return out;
}

const FORBIDDEN = ["매수하세요", "사세요", "파세요", "목표가", "보장", "오른다", "급등", "폭등", "사라", "팔아"];

describe("computeQuietPickAnomalies — 보유 수치로 이례성 언어화", () => {
  it("빈도: 지난 1년 매수 적으면 발화(내부자)", () => {
    const a = computeQuietPickAnomalies({ kind: "insider_cluster", actorNoun: "내부자", actors: "내부자 16명", scale: "$4.8M", days: 3, insiderCount: 16, priorBuys12mo: 2 });
    expect(a.some((x) => x.kind === "frequency")).toBe(true);
    expect(a[0]!.text).toContain("2건");
    expect(a[0]!.text).toContain("16");
  });
  it("참여자: 8명+ 은 '임원 …명' 이례성", () => {
    const a = computeQuietPickAnomalies({ kind: "insider_cluster", actorNoun: "내부자", actors: "내부자 9명", scale: "$1M", days: 3, insiderCount: 9, priorBuys12mo: 30 });
    expect(a.some((x) => x.kind === "participants" && x.text.includes("임원 9명"))).toBe(true);
  });
  it("규모: 하루 거래량 대비·시총 대비", () => {
    const a = computeQuietPickAnomalies({ kind: "foreign_streak", actorNoun: "외국인", actors: "외국인", scale: "27만주", days: 5, volumePct: 40 });
    expect(a.some((x) => x.kind === "scale" && x.text.includes("40%"))).toBe(true);
    const b = computeQuietPickAnomalies({ kind: "insider_cluster", actorNoun: "내부자", actors: "내부자 3명", scale: "$9M", days: 3, insiderCount: 3, priorBuys12mo: 30, mcapPct: 3.2 });
    expect(b.some((x) => x.kind === "scale" && x.text.includes("시총의 3.2%"))).toBe(true);
  });
  it("침묵: 오늘 뉴스 0건", () => {
    const a = computeQuietPickAnomalies({ kind: "foreign_streak", actorNoun: "외국인", actors: "외국인", scale: "3만주", days: 3, mentionCount: 0 });
    expect(a.some((x) => x.kind === "silence")).toBe(true);
  });
  it("지표 없으면 빈 배열(가짜 금지 → 엔진이 발행 제외)", () => {
    const a = computeQuietPickAnomalies({ kind: "foreign_streak", actorNoun: "외국인", actors: "외국인", scale: "1만주", days: 3, volumePct: 5, mentionCount: 4, volumeElevated: true, isLongestStreak: false });
    expect(a).toHaveLength(0);
  });
});

describe("buildQuietPickHook — [이례성] 앞·실수치·탈템플릿", () => {
  it("결정론: 같은 입력 같은 훅", () => {
    const f: QuietPickAnomalyFacts = { kind: "insider_cluster", actorNoun: "내부자", actors: "내부자 16명", scale: "$4.8M", days: 3, insiderCount: 16, priorBuys12mo: 2, mentionCount: 0 };
    expect(buildQuietPickHook(f)).toBe(buildQuietPickHook(f));
  });
  it("훅은 이례성 문구로 시작하고 실수치를 담는다", () => {
    for (const f of thirtyFacts()) {
      const anomalies = computeQuietPickAnomalies(f);
      if (anomalies.length === 0) continue;
      const hook = buildQuietPickHook(f);
      expect(hook.startsWith(anomalies[0]!.text)).toBe(true); // 이례성이 앞
      expect(/\d/.test(hook)).toBe(true); // 실수치
    }
  });
  it("CI 반복도: 종목마다 수치가 다르면 훅도 다르다 (동일 ≤2회)", () => {
    const hooks = thirtyFacts().map(buildQuietPickHook);
    const counts = new Map<string, number>();
    for (const h of hooks) counts.set(h, (counts.get(h) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
  it("투자조언·예측 금칙어 없음", () => {
    for (const f of thirtyFacts()) {
      const hook = buildQuietPickHook(f);
      for (const w of FORBIDDEN) expect(hook.includes(w)).toBe(false);
    }
  });
});

/** 하루치 다양한 픽(실측 분포 모사) — 지배 이례성·등급이 종목마다 다르다. */
function diverseDayFacts(): Array<{ facts: QuietPickAnomalyFacts; timing: "A" | "B" | "C"; valuation: "A" | "B" | "C" }> {
  const F = (o: Partial<QuietPickAnomalyFacts> & Pick<QuietPickAnomalyFacts, "kind" | "actorNoun" | "actors" | "scale" | "days">): QuietPickAnomalyFacts => o as QuietPickAnomalyFacts;
  return [
    { facts: F({ kind: "insider_cluster", actorNoun: "내부자", actors: "내부자 16명", scale: "$4.8M", days: 3, insiderCount: 16, priorBuys12mo: 0, mentionCount: 0 }), timing: "C", valuation: "B" },
    { facts: F({ kind: "insider_cluster", actorNoun: "내부자", actors: "내부자 10명", scale: "$3M", days: 5, insiderCount: 10, priorBuys12mo: 30, volumePct: 12 }), timing: "B", valuation: "C" },
    { facts: F({ kind: "insider_cluster", actorNoun: "내부자", actors: "내부자 3명", scale: "$9M", days: 4, insiderCount: 3, priorBuys12mo: 30, volumePct: 55, mcapPct: 4 }), timing: "C", valuation: "A" },
    { facts: F({ kind: "foreign_streak", actorNoun: "외국인", actors: "외국인", scale: "27만주", days: 12, volumePct: 40, isLongestStreak: true, streakWindowDays: 40, mentionCount: 0 }), timing: "B", valuation: "C" },
    { facts: F({ kind: "foreign_streak", actorNoun: "외국인", actors: "외국인", scale: "9만주", days: 3, volumePct: 45, isLongestStreak: false, mentionCount: 3 }), timing: "A", valuation: "B" },
    { facts: F({ kind: "institution_streak", actorNoun: "기관", actors: "기관", scale: "12만주", days: 4, volumePct: 60, isLongestStreak: true, streakWindowDays: 40 }), timing: "A", valuation: "A" },
    { facts: F({ kind: "multi_cluster", actorNoun: "외국인·기관", actors: "외국인·기관", scale: "31만주", days: 6, volumePct: 30, isLongestStreak: true, streakWindowDays: 40, mentionCount: 0 }), timing: "B", valuation: "B" },
    { facts: F({ kind: "institution_streak", actorNoun: "기관", actors: "기관", scale: "5만주", days: 3, volumePct: 8, isLongestStreak: false, mentionCount: 0, volumeElevated: false }), timing: "C", valuation: "C" },
  ];
}

describe("buildCommitteeVerdictLine — 이례성 결합 탈템플릿(WO-G1A2 §5)", () => {
  it("하루치 다양한 픽에서 총평 유니크 ≥70% · 동일 ≤2회", () => {
    const day = diverseDayFacts();
    const lines = day.map(({ facts, timing, valuation }) =>
      buildCommitteeVerdictLine(computeQuietPickAnomalies(facts), timing, valuation)
    );
    const counts = new Map<string, number>();
    for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
    expect(counts.size / lines.length).toBeGreaterThanOrEqual(0.7);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
  it("결정론: 같은 입력 같은 총평", () => {
    const { facts, timing, valuation } = diverseDayFacts()[0]!;
    const a = computeQuietPickAnomalies(facts);
    expect(buildCommitteeVerdictLine(a, timing, valuation)).toBe(buildCommitteeVerdictLine(a, timing, valuation));
  });
});
