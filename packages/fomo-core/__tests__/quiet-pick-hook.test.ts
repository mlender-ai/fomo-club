import { describe, expect, it } from "vitest";
import {
  computeQuietPickAnomalies,
  buildQuietPickHook,
  buildQuietPickChips,
  buildCommitteeVerdictLine,
  quietPickSubLine,
  findBannedTerms,
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
        actorNoun: "임원",
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
  it("빈도: 지난 1년 매수 적으면 발화(임원)", () => {
    const a = computeQuietPickAnomalies({ kind: "insider_cluster", actorNoun: "임원", scale: "$4.8M", days: 3, insiderCount: 16, priorBuys12mo: 2 });
    expect(a.some((x) => x.kind === "frequency")).toBe(true);
    expect(a[0]!.text).toContain("2건");
    // 인원은 훅이 말한다 — 빈도 지표는 빈도만 말하고 칩도 빈도 축이다(H4).
    expect(a[0]!.chip).toBe("1년 매수 2건");
    expect(a[0]!.axis).toBe("unusual");
  });
  it("빈도 0건은 '1년 만의 매수' 칩", () => {
    const a = computeQuietPickAnomalies({ kind: "insider_cluster", actorNoun: "임원", scale: "$1M", days: 3, insiderCount: 4, priorBuys12mo: 0 });
    expect(a[0]!.chip).toBe("1년 만의 매수");
  });
  it("참여자: 8명+ 은 '임원 …명' 이례성이되 **칩은 만들지 않는다**(훅이 이미 말한다)", () => {
    const a = computeQuietPickAnomalies({ kind: "insider_cluster", actorNoun: "임원", scale: "$1M", days: 3, insiderCount: 9, priorBuys12mo: 30 });
    const participants = a.find((x) => x.kind === "participants");
    expect(participants?.text).toContain("임원 9명");
    expect(participants?.chip).toBeNull();
  });
  it("규모: 하루 거래량 대비·시총 대비", () => {
    const a = computeQuietPickAnomalies({ kind: "foreign_streak", actorNoun: "외국인", scale: "27만주", days: 5, volumePct: 40 });
    expect(a.some((x) => x.kind === "scale" && x.text.includes("40%"))).toBe(true);
    expect(a.find((x) => x.kind === "scale")?.chip).toBe("하루 거래량의 40%");
    // 100% 초과는 '배'로(522% 같은 비현실 % 방지).
    const big = computeQuietPickAnomalies({ kind: "insider_cluster", actorNoun: "임원", scale: "$9M", days: 3, insiderCount: 4, priorBuys12mo: 30, volumePct: 522 });
    expect(big.some((x) => x.kind === "scale" && x.text.includes("5배") && !x.text.includes("522"))).toBe(true);
    const b = computeQuietPickAnomalies({ kind: "insider_cluster", actorNoun: "임원", scale: "$9M", days: 3, insiderCount: 3, priorBuys12mo: 30, mcapPct: 3.2 });
    expect(b.some((x) => x.kind === "scale" && x.text.includes("시총의 3.2%"))).toBe(true);
  });
  it("침묵: 오늘 뉴스 0건", () => {
    const a = computeQuietPickAnomalies({ kind: "foreign_streak", actorNoun: "외국인", scale: "3만주", days: 3, mentionCount: 0 });
    expect(a.some((x) => x.kind === "silence")).toBe(true);
  });
  it("지표 없으면 빈 배열(가짜 금지 → 엔진이 발행 제외)", () => {
    const a = computeQuietPickAnomalies({ kind: "foreign_streak", actorNoun: "외국인", scale: "1만주", days: 3, volumePct: 5, mentionCount: 4, volumeElevated: true, isLongestStreak: false });
    expect(a).toHaveLength(0);
  });
});

/**
 * WO-SUB-HOOK PART 1 — 훅 규칙 H1~H6.
 * 실측에서 깨진 것은 "훅이 없다"가 아니라 **훅이 나열이었다**는 점이다. 규칙을 테스트로 못박는다.
 */
describe("buildQuietPickHook — H1~H6", () => {
  it("H1 한 문장 — em-dash·세미콜론으로 절을 잇지 않는다", () => {
    for (const f of thirtyFacts()) {
      const hook = buildQuietPickHook(f);
      expect(hook).not.toContain("—");
      expect(hook).not.toContain(";");
      // 문장 종결이 하나뿐이다(중간에 마침표로 문장을 더 붙이지 않는다).
      expect(hook.split(/[.!?]/).filter((s) => s.trim()).length).toBe(1);
    }
  });

  it("H2 최대 2줄 · 줄당 28자", () => {
    for (const f of thirtyFacts()) {
      expect(buildQuietPickHook(f).length).toBeLessThanOrEqual(56);
    }
  });

  it("H3 부정문으로 시작 금지 — 무엇이 일어났는지를 먼저 쓴다", () => {
    // 실측 회귀: 침묵 지표만 있는 종목의 훅이 "거래량도 안 늘었어요" 였다.
    const quietOnly: QuietPickAnomalyFacts = {
      kind: "multi_cluster",
      actorNoun: "외국인·기관",
      scale: "47만주",
      days: 4,
      volumeElevated: false,
    };
    const hook = buildQuietPickHook(quietOnly);
    expect(hook).toBe("외국인과 기관이 4일째 같이 사고 있어요");
    for (const f of [...thirtyFacts(), quietOnly]) {
      const hook = buildQuietPickHook(f);
      expect(/^(안 |못 |아직 |거래량도 안)/.test(hook)).toBe(false);
      expect(hook.includes("안 늘었")).toBe(false);
    }
  });

  it("H4 훅이 가진 축(주체·인원·지속)은 이례성 칩으로 다시 만들지 않는다", () => {
    for (const f of thirtyFacts()) {
      const chips = buildQuietPickChips(f);
      // 참여 인원 칩은 존재하지 않는다 — 훅이 말한다.
      if (typeof f.insiderCount === "number") {
        expect(chips.some((chip) => chip === `임원 ${f.insiderCount}명`)).toBe(false);
      }
      // 축 중복 없음(같은 칩이 두 번 들어가지 않는다).
      expect(new Set(chips).size).toBe(chips.length);
      expect(chips.length).toBeLessThanOrEqual(3);
    }
  });

  it("H5 금지어가 훅·칩·이례성 문장 어디에도 없다", () => {
    for (const f of thirtyFacts()) {
      const texts = [
        buildQuietPickHook(f),
        ...buildQuietPickChips(f),
        ...computeQuietPickAnomalies(f).map((a) => a.text),
      ];
      for (const text of texts) {
        expect(findBannedTerms(text), `금지어: ${text}`).toEqual([]);
      }
    }
  });

  it("H6 서브라인은 훅과 같은 일수면 표시하지 않는다", () => {
    const hook = "기관이 5일째 조용히 사고 있어요";
    expect(quietPickSubLine(hook, "5일째 계속 — 어제보다 1일 더")).toBeNull();
    // 훅에 없는 변화(인원 증가)는 남긴다 — 그건 새 정보다.
    expect(quietPickSubLine("임원 7명이 사흘 새 같이 샀어요", "9명으로 늘었어요")).toBe("9명으로 늘었어요");
    expect(quietPickSubLine(hook, undefined)).toBeNull();
  });

  it("결정론: 같은 입력 같은 훅", () => {
    const f: QuietPickAnomalyFacts = { kind: "insider_cluster", actorNoun: "임원", scale: "$4.8M", days: 3, insiderCount: 16, priorBuys12mo: 2, mentionCount: 0 };
    expect(buildQuietPickHook(f)).toBe(buildQuietPickHook(f));
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

/**
 * 골든 케이스 3건 (WO-SUB-HOOK §1-2) — 실측 화면에서 뽑은 종목이다.
 * 리라이트를 **그대로** 고정한다. 문구가 바뀌면 여기서 먼저 깨진다.
 */
describe("골든 케이스 — 빅텍 · 한미반도체 · Amrize", () => {
  const 빅텍: QuietPickAnomalyFacts = {
    kind: "institution_streak",
    actorNoun: "기관",
    scale: "74주",
    days: 25,
    isLongestStreak: true,
    streakWindowDays: 40,
    volumeVacuumRatio: 0.25,
  };
  const 한미반도체: QuietPickAnomalyFacts = {
    kind: "multi_cluster",
    actorNoun: "외국인·기관",
    scale: "47만주",
    days: 4,
    volumeElevated: false,
  };
  const amrize: QuietPickAnomalyFacts = {
    kind: "insider_cluster",
    actorNoun: "임원",
    scale: "$3.6M",
    days: 3,
    insiderCount: 7,
    pctAboveYearLow: 1,
  };

  it("빅텍 — 훅 한 문장 + 칩 3개(최장 · 진공 · 규모)", () => {
    expect(buildQuietPickHook(빅텍)).toBe("기관이 25일째 조용히 사고 있어요");
    expect(buildQuietPickChips(빅텍)).toEqual(["40거래일 중 최장", "거래량 평소의 25%", "기관 74주"]);
  });

  it("한미반도체 — 부정문 훅이 사라지고 무슨 일이 있었는지가 앞에 온다", () => {
    expect(buildQuietPickHook(한미반도체)).toBe("외국인과 기관이 4일째 같이 사고 있어요");
    expect(buildQuietPickChips(한미반도체)).toEqual(["거래량은 그대로", "47만주", "4일 연속"]);
  });

  it("Amrize — 임원 7명 · 사흘 새", () => {
    expect(buildQuietPickHook(amrize)).toBe("임원 7명이 사흘 새 같이 샀어요");
    expect(buildQuietPickChips(amrize)).toEqual(["$3.6M", "52주 저점 +1%", "최근 3일"]);
  });

  /**
   * 완료 조건 3 — 한 화면에 같은 숫자가 3회 이상 반복되지 않는다.
   * 실측에서는 빅텍 카드에 `25`가 5회 있었다(훅·서브라인·칩·디테일 헤더·이례성 행).
   */
  it("같은 숫자가 카드 한 장에 3회 이상 나오지 않는다", () => {
    for (const facts of [빅텍, 한미반도체, amrize]) {
      const screen = [buildQuietPickHook(facts), ...buildQuietPickChips(facts)].join(" ");
      const counts = new Map<string, number>();
      for (const n of screen.match(/\d+/g) ?? []) counts.set(n, (counts.get(n) ?? 0) + 1);
      for (const [number, count] of counts) {
        expect(count, `숫자 ${number} 가 ${count}회 반복`).toBeLessThan(3);
      }
    }
  });
});

/** 하루치 다양한 픽(실측 분포 모사) — 지배 이례성·등급이 종목마다 다르다. */
function diverseDayFacts(): Array<{ facts: QuietPickAnomalyFacts; timing: "A" | "B" | "C"; valuation: "A" | "B" | "C" }> {
  const F = (o: Partial<QuietPickAnomalyFacts> & Pick<QuietPickAnomalyFacts, "kind" | "actorNoun" | "scale" | "days">): QuietPickAnomalyFacts => o as QuietPickAnomalyFacts;
  return [
    { facts: F({ kind: "insider_cluster", actorNoun: "임원", scale: "$4.8M", days: 3, insiderCount: 16, priorBuys12mo: 0, mentionCount: 0 }), timing: "C", valuation: "B" },
    { facts: F({ kind: "insider_cluster", actorNoun: "임원", scale: "$3M", days: 5, insiderCount: 10, priorBuys12mo: 30, volumePct: 12 }), timing: "B", valuation: "C" },
    { facts: F({ kind: "insider_cluster", actorNoun: "임원", scale: "$9M", days: 4, insiderCount: 3, priorBuys12mo: 30, volumePct: 55, mcapPct: 4 }), timing: "C", valuation: "A" },
    { facts: F({ kind: "foreign_streak", actorNoun: "외국인", scale: "27만주", days: 12, volumePct: 40, isLongestStreak: true, streakWindowDays: 40, mentionCount: 0 }), timing: "B", valuation: "C" },
    { facts: F({ kind: "foreign_streak", actorNoun: "외국인", scale: "9만주", days: 3, volumePct: 45, isLongestStreak: false, mentionCount: 3 }), timing: "A", valuation: "B" },
    { facts: F({ kind: "institution_streak", actorNoun: "기관", scale: "12만주", days: 4, volumePct: 60, isLongestStreak: true, streakWindowDays: 40 }), timing: "A", valuation: "A" },
    { facts: F({ kind: "multi_cluster", actorNoun: "외국인·기관", scale: "31만주", days: 6, volumePct: 30, isLongestStreak: true, streakWindowDays: 40, mentionCount: 0 }), timing: "B", valuation: "B" },
    { facts: F({ kind: "institution_streak", actorNoun: "기관", scale: "5만주", days: 3, volumePct: 8, isLongestStreak: false, mentionCount: 0, volumeElevated: false }), timing: "C", valuation: "C" },
  ];
}

describe("buildQuietPickChips — 서로 다른 축 최대 3개", () => {
  it("칩은 3개를 넘지 않고 축이 겹치지 않는다", () => {
    for (const { facts } of diverseDayFacts()) {
      const chips = buildQuietPickChips(facts);
      expect(chips.length).toBeLessThanOrEqual(3);
      // 규모 축이 두 번 오지 않는다(상대 규모 + 절대 규모 동시 노출 금지).
      const sizeChips = chips.filter((chip) => chip.includes("하루 거래량의") || chip.includes(facts.scale));
      expect(sizeChips.length).toBeLessThanOrEqual(1);
    }
  });

  it("칩에도 금지어가 없다", () => {
    for (const { facts } of diverseDayFacts()) {
      for (const chip of buildQuietPickChips(facts)) expect(findBannedTerms(chip)).toEqual([]);
    }
  });
});

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
  it("총평에 금지어가 없다", () => {
    for (const { facts, timing, valuation } of diverseDayFacts()) {
      const line = buildCommitteeVerdictLine(computeQuietPickAnomalies(facts), timing, valuation);
      expect(findBannedTerms(line), line).toEqual([]);
    }
  });
});
