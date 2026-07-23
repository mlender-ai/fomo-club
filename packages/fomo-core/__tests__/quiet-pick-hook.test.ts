import { describe, expect, it } from "vitest";
import { buildQuietPickHook, type QuietPickHookInput, type QuietPickSignalKind } from "../src";

const KINDS: QuietPickSignalKind[] = ["insider_cluster", "institution_streak", "foreign_streak", "multi_cluster"];

/** 30개 결정론 입력(난수 없음) — 실측 수치 스윕으로 신호·주체·규모·일수를 고루 변주. */
function thirtyInputs(): QuietPickHookInput[] {
  const out: QuietPickHookInput[] = [];
  for (let i = 0; i < 30; i += 1) {
    const kind = KINDS[i % KINDS.length]!;
    const days = 2 + (i % 7); // 2..8 — days 를 쓰는 구조도 도달 가능
    if (kind === "insider_cluster") {
      const insiders = 2 + (i % 4);
      const value = 200_000 + i * 137_000;
      out.push({
        kind,
        actors: `내부자 ${insiders}명`,
        scale: value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : `$${Math.round(value / 1_000)}K`,
        days,
      });
    } else if (kind === "multi_cluster") {
      out.push({ kind, actors: "외국인·기관", scale: `${10 + i * 3}만주 매집`, days });
    } else {
      out.push({
        kind,
        actors: kind === "foreign_streak" ? "외국인" : "기관",
        scale: `${7 + i * 2}만주`,
        days,
      });
    }
  }
  return out;
}

/** 표면 특징으로 구조를 코스하게 분류(구조 다양성 검증용). */
function shapeSignature(hook: string): string {
  return [
    hook.includes(" — ") ? "dash" : "",
    hook.includes("매집") ? "accum" : "",
    hook.includes("일째") ? "days" : "",
    /^(뉴스|아무도|조용히|화제|남들|관심)/.test(hook) ? "quietFirst" : "actorFirst",
  ].join("|");
}

const FORBIDDEN = ["매수", "매도", "사세요", "파세요", "사라", "팔아", "목표가", "보장", "오른다", "급등", "폭등"];

describe("buildQuietPickHook — 탈템플릿·결정론·실수치", () => {
  it("결정론: 같은 입력이면 같은 문장", () => {
    const input: QuietPickHookInput = { kind: "insider_cluster", actors: "내부자 3명", scale: "$4.6M", days: 4 };
    expect(buildQuietPickHook(input)).toBe(buildQuietPickHook(input));
  });

  it("[누가][얼마를] 실수치 포함 — 모든 훅에 숫자와 주체가 있다", () => {
    for (const input of thirtyInputs()) {
      const hook = buildQuietPickHook(input);
      expect(/\d/.test(hook)).toBe(true); // 실공시 수치
      expect(hook.includes(input.actors)).toBe(true); // 누가
      expect(hook.includes(input.scale)).toBe(true); // 얼마를
    }
  });

  it("CI 반복도 게이트: 30픽에서 동일 문장 ≤2회 · 유니크 ≥20 · 구조 ≥4종", () => {
    const hooks = thirtyInputs().map(buildQuietPickHook);
    const counts = new Map<string, number>();
    for (const hook of hooks) counts.set(hook, (counts.get(hook) ?? 0) + 1);
    const maxRepeat = Math.max(...counts.values());
    expect(maxRepeat).toBeLessThanOrEqual(2);
    expect(counts.size).toBeGreaterThanOrEqual(20);

    const shapes = new Set(hooks.map(shapeSignature));
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });

  it("투자조언·예측 금칙어 없음", () => {
    for (const input of thirtyInputs()) {
      const hook = buildQuietPickHook(input);
      for (const word of FORBIDDEN) expect(hook.includes(word)).toBe(false);
    }
  });
});
