import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assembleThemeInsight } from "../src/theme-understanding/assemble";
import { affinityAxisSignal, buildAxisSignals } from "../src/keyword-cards/multi-axis-hook";

/**
 * WO-SUB-06 §5-4 · 완료 조건 4 — "커뮤니티 소스가 bull/bear 증거에 포함되면 테스트가 실패한다."
 *
 * ## 이미 있는 것과 없는 것
 *
 * 필터는 **이미 구현돼 있다**: `assemble.ts` 의 `groundEvidence` 가 강세/약세 근거에서
 * `doc.kind === "community"` 를 버리고, 워딩은 반대로 community 만 받는다(대칭). 병치 3상태도
 * `decideStance` 가 balanced / bull-dominant / bear-dominant / insufficient 로 나눈다.
 * `theme-understanding.test.ts` 가 그 규칙을 픽스처로 감시한다.
 *
 * 없던 것은 **층을 가로지르는 단정**이다. 오염 경로는 두 개인데(응축 증거 · 축 증거) 각 층의
 * 테스트가 자기 층만 본다. "이게 틀리는 경우" 섹션은 두 층을 한 화면에 놓으므로, 어느 층에서
 * 새어도 같은 사고가 된다. 그래서 여기서 두 층을 함께 단정한다.
 */

const DOCS = [
  { id: "N1", kind: "news" as const, title: "3사 증설 물량 2028년 가동 예정", body: "증설 물량이 2028년 전후로 겹친다" },
  { id: "C1", kind: "community" as const, title: "여기서 더 빠지면 손절이다 무조건 반등", body: "손절이다" },
];

describe("층 1 — 응축 증거(강세/약세)", () => {
  it("커뮤니티 원문을 인용한 근거는 강세·약세 어디에도 남지 않는다", () => {
    const result = assembleThemeInsight("반도체", DOCS, {
      stocks: [],
      bull: [{ claim: "증설 물량 가동 시점이 겹친다", sourceId: "N1", quote: "증설 물량이 2028년" }],
      bear: [{ claim: "커뮤니티가 손절을 말한다", sourceId: "C1", quote: "손절이다" }],
      wordings: [],
      stanceNote: "",
    });
    expect(result.bull.length).toBe(1);
    expect(result.bear.length).toBe(0);
    expect(result.sources.every((source) => source.kind !== "community")).toBe(true);
  });

  it("한쪽만 남으면 반대편이 없다는 사실을 문구로 남긴다 — 침묵 금지", () => {
    const result = assembleThemeInsight("반도체", DOCS, {
      stocks: [],
      bull: [{ claim: "증설 물량 가동 시점이 겹친다", sourceId: "N1", quote: "증설 물량이 2028년" }],
      bear: [],
      wordings: [],
      stanceNote: "",
    });
    expect(result.stance).toBe("bull-dominant");
    expect(result.stanceNote).toMatch(/약세|반대/);
  });

  it("양쪽 모두 없으면 insufficient — '균형'으로 위장하지 않는다", () => {
    const result = assembleThemeInsight("반도체", DOCS, { stocks: [], bull: [], bear: [], wordings: [], stanceNote: "" });
    expect(result.stance).toBe("insufficient");
  });
});

describe("층 2 — 축 증거(sourceKind)", () => {
  it("user 종류는 취향(affinity) 축에서만 나온다", () => {
    const signals = buildAxisSignals({
      signals: { changePct: 4.2, volumeRatio: 2.1, asOf: "2026-08-07" },
      affinity: { fired: true, strength: 0.6, hookText: "네가 멈춰보던 패턴과 닮았어요." },
    });
    for (const signal of signals) {
      const userEvidence = signal.evidence.filter((entry) => entry.sourceKind === "user");
      if (signal.axis === "affinity") continue;
      expect(userEvidence, `${signal.axis} 축에 user 증거가 있다`).toEqual([]);
    }
  });

  it("취향 축 증거는 user 로 라벨된다 — 시장 사실로 위장하지 않는다", () => {
    const signal = affinityAxisSignal({ fired: true, strength: 0.6, hookText: "닮은 패턴이에요." });
    expect(signal.evidence.every((entry) => entry.sourceKind === "user")).toBe(true);
  });
});

/**
 * 구조 단정 — 필터가 리팩터로 사라지는 것을 막는다.
 *
 * 픽스처 테스트는 필터를 지우면 실패하지만, 조립 함수를 새로 만들어 옆에 두는 리팩터에서는
 * 통과할 수 있다. 규칙이 코드에 남아 있는지 자체를 본다(레포의 소스 스캐너 관례와 같다).
 */
describe("구조 — 출처 종류 분리가 조립 코드에 남아 있다", () => {
  it("groundEvidence 가 community 를 배제하는 줄이 있다", () => {
    const source = readFileSync(new URL("../src/theme-understanding/assemble.ts", import.meta.url), "utf8");
    expect(source).toMatch(/doc\.kind === "community"/);
    expect(source).toMatch(/doc\.kind !== "community"/);
  });
});
