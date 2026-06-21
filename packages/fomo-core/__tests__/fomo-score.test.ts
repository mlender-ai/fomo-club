import { describe, expect, it } from "vitest";
import {
  computeFomoScore,
  fomoCardView,
  fomoWhy,
  confidenceGrade,
  isLeadingSetup,
  fomoLabelTextsSafe,
  rankByScore,
  rankFeedByFomo,
  isFrontHookSafe,
  C_WEIGHTS,
  type FomoScoreInputs,
} from "../src";

describe("fomoWhy / confidenceGrade — 상세 포모 해부(척추 ③)", () => {
  it("incoming → 수급 선행 정직 설명", () => {
    const s = computeFomoScore({ foreignNetStreak: 5, foreignNetRatio: 0.01, institutionNetStreak: 5, institutionNetRatio: 0.01 });
    expect(s.label).toBe("incoming");
    expect(fomoWhy(s)).toContain("수급");
  });
  it("조용한 종목 → '왜 조용한가' 정직(가짜 흥분 없음)", () => {
    expect(fomoWhy(computeFomoScore({ mentionScore: 5 }))).toContain("조용");
  });
  it("거래량 주도 → 거래 몰림 설명", () => {
    expect(fomoWhy(computeFomoScore({ volumeRatio: 3.2, changePct: 0.3 }))).toMatch(/거래|담는/);
  });
  it("모든 동인 설명에 예측·판정 어휘 0", () => {
    const cases = [
      computeFomoScore({ volumeRatio: 3.5, mentionScore: 90 }),
      computeFomoScore({ foreignNetStreak: 5, foreignNetRatio: 0.01, institutionNetStreak: 5, institutionNetRatio: 0.01 }),
      computeFomoScore({ volumeRatio: 3, mentionScore: 80, changePct: -7 }),
      computeFomoScore({ mentionScore: 5 }),
      computeFomoScore({ volumeRatio: 2.5, changePct: 0.5 }),
    ];
    for (const s of cases) {
      const w = fomoWhy(s);
      expect(isFrontHookSafe(w), `금칙어: ${w}`).toBe(true);
      expect(w).not.toMatch(/오를|사라|급등할|추천|유망/);
    }
  });
  it("근거 등급 — confidence 구간", () => {
    expect(confidenceGrade(0.8)).toBe("근거 탄탄");
    expect(confidenceGrade(0.45)).toBe("근거 보통");
    expect(confidenceGrade(0.2)).toBe("근거 약함");
  });

  // HOTFIX 회귀 — "한 물 가는 분위기"(쇠퇴 판정) 제거 + 가드 구멍 막힘.
  it("가드 구멍 — '한 물 가는 분위기예요'는 이제 거부(false)", () => {
    expect(isFrontHookSafe("한 물 가는 분위기예요")).toBe(false);
    expect(isFrontHookSafe("한물 갔어요")).toBe(false);
    expect(isFrontHookSafe("끝물이에요")).toBe(false);
  });
  it("정상 카피('분위기' 정상 사용)는 통과 — 과금지 아님", () => {
    expect(isFrontHookSafe("관심이 데워지는 분위기예요")).toBe(true);
    expect(fomoLabelTextsSafe()).toBe(true); // 새 cooling 카피 포함 전부 통과
  });
  it("cooling 경로(라벨·fomoWhy·카드 헤드라인)에 '한물'/'한 물' 없음", () => {
    const cooling = computeFomoScore({ volumeRatio: 3, mentionScore: 80, changePct: -7 });
    expect(cooling.label).toBe("cooling");
    const texts = [cooling.labelText, fomoWhy(cooling), fomoCardView(cooling, { sector: "반도체" }).headline];
    for (const t of texts) {
      expect(t).not.toMatch(/한\s?물|한물|끝물/);
      expect(isFrontHookSafe(t), `cooling 텍스트 가드 통과: ${t}`).toBe(true);
    }
  });
});

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

describe("fomoCardView — 엔진 출력 → 카드(척추 ②, 단일 출처)", () => {
  it("점수·라벨이 엔진 결과와 정확히 일치(단일 출처)", () => {
    const s = computeFomoScore({ volumeRatio: 3.5, changePct: 7, mentionScore: 90 });
    const v = fomoCardView(s, { sector: "반도체" });
    expect(v.scoreText).toBe(`포모 ${s.fomoScore}`);
    expect(v.emoji).toBe("🔥");
    expect(v.badge).toBe("지금 한복판");
    expect(v.tone).toBe("hot");
  });

  it("💎 incoming 특별 취급 — isLeading + 특별 문구(reason 있어도 유지, 예측 0)", () => {
    const s = computeFomoScore({
      volumeRatio: 1.1,
      foreignNetStreak: 5,
      foreignNetRatio: 0.01,
      institutionNetStreak: 5,
      institutionNetRatio: 0.01,
    });
    const v = fomoCardView(s, { sector: "2차전지", reason: "수주 기대로 묶임" });
    expect(s.label).toBe("incoming");
    expect(v.isLeading).toBe(true);
    expect(v.emoji).toBe("💎");
    expect(v.headline).toContain("이미 움직였");
    expect(v.headline).not.toMatch(/오를|될 것|상승할/);
  });

  it("강도 비례 톤 — 핫 세게(hot)·조용 차분(calm)·식는 중(cooling)", () => {
    expect(fomoCardView(computeFomoScore({ volumeRatio: 3.5, mentionScore: 90 })).tone).toBe("hot");
    expect(fomoCardView(computeFomoScore({ mentionScore: 10 })).tone).toBe("calm");
    expect(fomoCardView(computeFomoScore({ volumeRatio: 3, mentionScore: 80, changePct: -7 })).tone).toBe("cooling");
  });

  it("근거(reason) 우선 — incoming 아닐 때 grounded 헤드라인", () => {
    const s = computeFomoScore({ volumeRatio: 3.5, mentionScore: 90 }); // hot
    expect(fomoCardView(s, { sector: "반도체", reason: "HBM4 공급계약 보도" }).headline).toBe("HBM4 공급계약 보도");
  });

  it("가드 위반 reason 은 폐기 → 라벨 헤드라인 폴백", () => {
    const s = computeFomoScore({ volumeRatio: 3.5, mentionScore: 90 });
    const v = fomoCardView(s, { sector: "반도체", reason: "지금 매수 추천! 급등할 종목" });
    expect(v.headline).toBe("지금 반도체에서 가장 시선이 몰리는 자리예요");
  });

  it("데이터 0 → 점수 보류(빈 문자열), 라벨 silent", () => {
    const v = fomoCardView(computeFomoScore({}));
    expect(v.scoreText).toBe("");
    expect(v.badge).toBe("조용");
  });

  it("금칙어 가드 — 모든 라벨 헤드라인에 예측·판정 0", () => {
    const cases = [
      computeFomoScore({ volumeRatio: 3.5, mentionScore: 90 }),
      computeFomoScore({ foreignNetStreak: 5, foreignNetRatio: 0.01, institutionNetStreak: 5, institutionNetRatio: 0.01 }),
      computeFomoScore({ mentionScore: 50, volumeRatio: 2 }),
      computeFomoScore({ mentionScore: 10 }),
      computeFomoScore({ volumeRatio: 3, mentionScore: 80, changePct: -7 }),
    ];
    for (const s of cases) {
      const h = fomoCardView(s, { sector: "반도체" }).headline;
      expect(isFrontHookSafe(h), `금칙어: ${h}`).toBe(true);
    }
  });
});

describe("rankFeedByFomo — 발견 피드 밴드 정렬 + 일별 셔플(척추 ④)", () => {
  const items = [
    { key: "식는주", label: "cooling" as const },
    { key: "조용주", label: "quiet" as const },
    { key: "핫주", label: "hot" as const },
    { key: "데우주", label: "warming" as const },
    { key: "수급주", label: "incoming" as const }, // 💎
    { key: "잠잠주", label: "silent" as const },
  ];

  it("밴드 순서 — 🔥/💎 상단, 식는중·silent 하단", () => {
    const order = rankFeedByFomo(items, { seed: "2026-06-22" });
    const band = (k: string) => order.indexOf(k);
    // hot·incoming(💎) 이 warming·quiet·cooling·silent 보다 앞
    expect(band("핫주")).toBeLessThan(band("데우주"));
    expect(band("수급주")).toBeLessThan(band("데우주"));
    expect(band("데우주")).toBeLessThan(band("조용주"));
    expect(band("조용주")).toBeLessThan(band("식는주"));
    expect(band("잠잠주")).toBe(order.length - 1); // silent 최하단
  });

  it("★핵심 — 💎(incoming, C 낮음)가 상위 밴드에 노출(바닥 안 가라앉음)", () => {
    // 💎가 hot 과 같은 최상위 밴드(0) → 항상 상위 2개 안.
    const order = rankFeedByFomo(items, { seed: "2026-06-22" });
    expect(order.slice(0, 2)).toContain("수급주");
    // 여러 시드에서도 늘 상위 밴드(데우는중보다 위)
    for (const seed of ["a", "b", "2026-06-21", "x"]) {
      const o = rankFeedByFomo(items, { seed });
      expect(o.indexOf("수급주")).toBeLessThan(o.indexOf("데우주"));
    }
  });

  it("일별 시드 결정성 — 같은 날 같은 순서, 다른 날 다른 순서", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ key: `q${i}`, label: "quiet" as const }));
    expect(rankFeedByFomo(many, { seed: "2026-06-22" })).toEqual(rankFeedByFomo(many, { seed: "2026-06-22" }));
    expect(rankFeedByFomo(many, { seed: "2026-06-22" })).not.toEqual(rankFeedByFomo(many, { seed: "2026-06-23" }));
  });

  it("콜드스타트(취향 없음) — 객관 밴드 순서로 안전", () => {
    const order = rankFeedByFomo(items, { seed: "2026-06-22" });
    expect(order[order.length - 1]).toBe("잠잠주"); // 억지로 상단에 안 올림
  });

  it("개인화 seam — rank 주입 시 밴드 내 그 순서(밴드는 유지)", () => {
    const band0 = [
      { key: "h1", label: "hot" as const },
      { key: "h2", label: "hot" as const },
      { key: "w1", label: "warming" as const },
    ];
    const order = rankFeedByFomo(band0, { seed: "x", rank: (k) => (k === "h2" ? 100 : 0) });
    expect(order[0]).toBe("h2"); // 취향 점수 높은 게 밴드 내 위로
    expect(order[order.length - 1]).toBe("w1"); // 밴드는 유지(warming 은 그대로 아래)
  });

  it("dropSilent — silent 제외", () => {
    expect(rankFeedByFomo(items, { seed: "x", dropSilent: true })).not.toContain("잠잠주");
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
