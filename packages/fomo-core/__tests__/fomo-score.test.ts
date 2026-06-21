import { describe, expect, it } from "vitest";
import {
  computeFomoScore,
  isLeadingSetup,
  fomoLabelTextsSafe,
  rankByScore,
  isFrontHookSafe,
  C_WEIGHTS,
  type FomoScoreInputs,
} from "../src";

describe("computeFomoScore — 포모 점수 엔진(§2)", () => {
  it("거래량 회전이 C를 강하게 끌어올림 → 🔥 hot", () => {
    const s = computeFomoScore({ volumeRatio: 3.5, changePct: 7, mentionScore: 90 });
    expect(s.fomoScore).toBeGreaterThanOrEqual(80);
    expect(s.label).toBe("hot");
    expect(s.confidence).toBe(1); // 세 항목 다 있음
  });

  it("가중치대로 — 거래량(45)이 언급(20)보다 C에 크게 기여", () => {
    const volOnly = computeFomoScore({ volumeRatio: 3.5 }).fomoScore; // 100 * 45/45
    const mentionOnly = computeFomoScore({ mentionScore: 100 }).fomoScore; // 100 * 20/20
    // 둘 다 단독이면 100점(재정규화)이지만, 같이 있을 때 거래량 만점·언급 0이 언급만점·거래량0보다 높아야
    const volHi = computeFomoScore({ volumeRatio: 3.5, mentionScore: 0 }).fomoScore;
    const mentionHi = computeFomoScore({ volumeRatio: 1, mentionScore: 100 }).fomoScore;
    expect(volHi).toBeGreaterThan(mentionHi);
    expect(volOnly).toBe(100);
    expect(mentionOnly).toBe(100);
  });

  it("💎 incoming — C<60 & L≥60 에서만 (수급 선행)", () => {
    // 조용한 수급주: 거래량·가격 약함(C<60), 외국인·기관 강한 연속 순매수(L≥60)
    const s = computeFomoScore({
      volumeRatio: 1.1,
      changePct: 0.5,
      foreignNetStreak: 5,
      foreignNetRatio: 0.01,
      institutionNetStreak: 5,
      institutionNetRatio: 0.01,
    });
    expect(s.fomoScore).toBeLessThan(60);
    expect(s.leadSignal).toBeGreaterThanOrEqual(60);
    expect(s.label).toBe("incoming");
    expect(isLeadingSetup(s)).toBe(true);
  });

  it("💎 트리거 경계 — L<60 이면 incoming 아님", () => {
    const s = computeFomoScore({ volumeRatio: 1.1, foreignNetStreak: 1 });
    expect(s.leadSignal).toBeLessThan(60);
    expect(s.label).not.toBe("incoming");
  });

  it("순매도 streak 는 L 에 기여 안 함(선행=순매수만)", () => {
    expect(computeFomoScore({ foreignNetStreak: -5, foreignNetRatio: 0.01 }).leadSignal).toBe(0);
  });

  it("가짜숫자 금지 — 입력 없는 항목 제외 + confidence↓", () => {
    const volOnly = computeFomoScore({ volumeRatio: 2 });
    expect(volOnly.confidence).toBeCloseTo(C_WEIGHTS.volume / 100, 5); // 0.45
    expect(volOnly.inputs.price).toBeUndefined();
    expect(volOnly.inputs.mention).toBeUndefined();
    const empty = computeFomoScore({});
    expect(empty.fomoScore).toBe(0);
    expect(empty.confidence).toBe(0);
    expect(empty.label).toBe("silent");
  });

  it("매집 다이버전스 — 거래량↑·가격 평탄이면 L 보너스 + 플래그", () => {
    const base = computeFomoScore({ volumeRatio: 2.5, changePct: 0.5, foreignNetStreak: 3 });
    const noDiv = computeFomoScore({ volumeRatio: 2.5, changePct: 6, foreignNetStreak: 3 });
    expect(base.inputs.accumulationDivergence).toBe(true);
    expect(noDiv.inputs.accumulationDivergence).toBeUndefined();
    expect(base.leadSignal).toBeGreaterThan(noDiv.leadSignal);
  });

  it("방향 — prevScore 대비 ↑/↓/flat", () => {
    expect(computeFomoScore({ volumeRatio: 3.5, prevScore: 10 }).direction).toBe("up");
    expect(computeFomoScore({ volumeRatio: 1, mentionScore: 0, prevScore: 90 }).direction).toBe("down");
    expect(computeFomoScore({ volumeRatio: 1.75, prevScore: 30 }).direction).toBe("flat"); // C≈30, |Δ|<5
  });

  it("강한 하락 → cooling (C≥60인데 식는 중)", () => {
    const s = computeFomoScore({ volumeRatio: 3, mentionScore: 80, changePct: -7 });
    expect(s.fomoScore).toBeGreaterThanOrEqual(60);
    expect(s.label).toBe("cooling");
  });

  it("라벨별 임계 — warming(60~80)·quiet(40~60)·silent(<40)", () => {
    expect(computeFomoScore({ volumeRatio: 2.7, mentionScore: 60 }).label).toBe("warming"); // C≈66
    expect(computeFomoScore({ volumeRatio: 2, mentionScore: 60 }).label).toBe("quiet"); // C≈46
    expect(computeFomoScore({ mentionScore: 10 }).label).toBe("silent"); // C=10
  });

  it("결정적 — 같은 입력 같은 출력", () => {
    const i: FomoScoreInputs = { volumeRatio: 2, changePct: 3, foreignNetStreak: 4, asOf: "6/21" };
    expect(computeFomoScore(i)).toEqual(computeFomoScore(i));
  });

  it("source-kind separation — 출력에 강세/약세 근거 필드 없음(주목만)", () => {
    const s = computeFomoScore({ mentionScore: 100, volumeRatio: 2 });
    expect(s).not.toHaveProperty("bullish");
    expect(s).not.toHaveProperty("bearish");
    // mention 은 C(주목)에만 들어간다
    expect(s.inputs.mention).toBe(100);
  });

  it("금칙어 가드 — 모든 라벨 문구에 예측·판정·점수 어휘 0", () => {
    expect(fomoLabelTextsSafe()).toBe(true);
    const labels: FomoScoreInputs[] = [
      { volumeRatio: 3.5, mentionScore: 90 },
      { foreignNetStreak: 5, foreignNetRatio: 0.01, institutionNetStreak: 5, institutionNetRatio: 0.01 },
      { mentionScore: 5 },
      { volumeRatio: 3, mentionScore: 80, changePct: -7 },
    ];
    for (const l of labels) {
      const t = computeFomoScore(l).labelText;
      expect(isFrontHookSafe(t), `금칙어: ${t}`).toBe(true);
      expect(t).not.toMatch(/점수|등급|추천|오를|사라|급등할/);
    }
  });
});

describe("rankByScore — 포모/시총 순위(시장·섹터 둘 다, §3)", () => {
  const items = [
    { key: "A", score: 90, sector: "반도체" },
    { key: "B", score: 70, sector: "반도체" },
    { key: "C", score: 80, sector: "바이오" },
    { key: "D", score: 70, sector: "바이오" },
  ];
  it("시장 전체 순위 — 점수 내림차순", () => {
    const r = rankByScore(items);
    expect(r.get("A")!.overall).toBe(1);
    expect(r.get("C")!.overall).toBe(2);
  });
  it("섹터 내 순위 별도", () => {
    const r = rankByScore(items);
    expect(r.get("A")!.sector).toBe(1); // 반도체 1위
    expect(r.get("B")!.sector).toBe(2);
    expect(r.get("C")!.sector).toBe(1); // 바이오 1위
  });
  it("동점은 key 사전순으로 결정적", () => {
    const a = rankByScore(items);
    const b = rankByScore([...items].reverse());
    expect(a.get("B")!.overall).toBe(b.get("B")!.overall); // 70점 동점 B/D 안정적
  });
});
