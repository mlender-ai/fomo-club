import { describe, expect, it } from "vitest";
import { computeShakeScore, type ShakeInteraction } from "../src";

// 고정 기준 시각(KST 정오). 86_400_000 ms = 1일.
const NOW = Date.parse("2026-06-14T03:00:00Z"); // 12:00 KST
const DAY = 86_400_000;
const ago = (h: number) => NOW - h * 3_600_000;

function mk(
  keyword: string,
  fomoScore: number,
  reaction: ShakeInteraction["reaction"],
  tsMs = ago(1)
): ShakeInteraction {
  return { keyword, fomoScore, ...(reaction ? { reaction } : {}), tsMs };
}

describe("computeShakeScore — 혼합형(시장 열기 × 내 반응)", () => {
  it("뜨거운 테마를 따라가면(more) 점수가 높다", () => {
    const r = computeShakeScore(
      [mk("반도체", 90, "more"), mk("AI", 85, "more"), mk("코인", 80, "more")],
      { nowMs: NOW }
    );
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeGreaterThan(60);
    expect(r.confidence).toBe("low"); // 3~6 engagement
    expect(r.components!.marketPull).toBeGreaterThan(0.7);
  });

  it("시장이 뜨거워도 패스하면(less) 점수가 낮다 — '안 흔들렸어'", () => {
    const hot = computeShakeScore(
      [mk("반도체", 90, "more"), mk("AI", 88, "more"), mk("코인", 85, "more")],
      { nowMs: NOW }
    );
    const calm = computeShakeScore(
      [mk("반도체", 90, "less"), mk("AI", 88, "less"), mk("코인", 85, "less")],
      { nowMs: NOW }
    );
    expect(calm.score!).toBeLessThan(hot.score!);
    // 같은 시장 열기 → marketHeat 동일, shake 는 반응 따라 갈림.
    expect(calm.marketHeat).toBe(hot.marketHeat);
    expect(calm.score!).toBeLessThan(calm.marketHeat!);
  });

  it("차가운 테마를 따라가도 점수는 낮다(혼합 — 시장 열기 반영)", () => {
    const cold = computeShakeScore(
      [mk("금리", 15, "more"), mk("2차전지", 20, "more"), mk("코인", 18, "more")],
      { nowMs: NOW }
    );
    expect(cold.score!).toBeLessThan(35);
  });

  it("시장 대조(marketHeat)는 반응 무관 — 본 카드 전체 평균", () => {
    const r = computeShakeScore(
      [mk("반도체", 80, "more"), mk("AI", 60, "less"), mk("금리", 40, undefined)],
      { nowMs: NOW }
    );
    expect(r.marketHeat).toBe(60); // (80+60+40)/3
    expect(r.viewedCount).toBe(3);
    expect(r.engagementCount).toBe(2); // 반응 있는 것만
  });

  it("시선 분산(scatter) — 여러 테마 추격이 점수를 올린다", () => {
    const focused = computeShakeScore(
      [mk("반도체", 70, "more"), mk("반도체", 70, "more"), mk("반도체", 70, "more")],
      { nowMs: NOW }
    );
    const scattered = computeShakeScore(
      [mk("반도체", 70, "more"), mk("AI", 70, "more"), mk("코인", 70, "more")],
      { nowMs: NOW }
    );
    expect(scattered.components!.scatter).toBeGreaterThan(focused.components!.scatter);
    expect(scattered.score!).toBeGreaterThanOrEqual(focused.score!);
  });
});

describe("콜드스타트 / 정직성 (§8.2)", () => {
  it("첫날 + engagement 부족 → onboarding, 숫자 숨김", () => {
    const r = computeShakeScore([mk("반도체", 90, "more"), mk("AI", 80, "more")], { nowMs: NOW });
    expect(r.score).toBeNull();
    expect(r.confidence).toBe("onboarding");
    expect(r.components).toBeNull();
    expect(r.reason).toContain("첫날");
  });

  it("과거 기록은 있으나 오늘 반응 < 3 → insufficient, 숫자 숨김", () => {
    const r = computeShakeScore(
      [
        mk("반도체", 90, "more", ago(30)), // 어제 이전(과거 버킷 존재)
        mk("AI", 80, "more"), // 오늘 1개뿐
      ],
      { nowMs: NOW }
    );
    expect(r.score).toBeNull();
    expect(r.confidence).toBe("insufficient");
  });

  it("engagement >= 7 → confidence ok", () => {
    const many = Array.from({ length: 7 }, (_, i) => mk(`t${i}`, 70, "more"));
    expect(computeShakeScore(many, { nowMs: NOW }).confidence).toBe("ok");
  });

  it("입력 전무 → 안전(null + insufficient, 에러 없음)", () => {
    const r = computeShakeScore([], { nowMs: NOW });
    expect(r.score).toBeNull();
    expect(r.marketHeat).toBeNull();
    expect(r.deltaVsYesterday).toBeNull();
  });
});

describe("어제 대비 Δ (로컬 버킷 기반, 가짜 금지)", () => {
  const yest = (kw: string, s: number, rx: ShakeInteraction["reaction"]) =>
    mk(kw, s, rx, NOW - DAY);

  it("어제도 충분하면 today.score - yesterday.score", () => {
    const r = computeShakeScore(
      [
        // 어제: 차분(less 위주) → 낮음
        yest("반도체", 80, "less"), yest("AI", 80, "less"), yest("코인", 80, "less"),
        // 오늘: 추격(more) → 높음
        mk("반도체", 80, "more"), mk("AI", 80, "more"), mk("코인", 80, "more"),
      ],
      { nowMs: NOW }
    );
    expect(r.deltaVsYesterday).not.toBeNull();
    expect(r.deltaVsYesterday!).toBeGreaterThan(0);
  });

  it("어제 데이터 부족하면 Δ = null (단정 안 함)", () => {
    const r = computeShakeScore(
      [mk("반도체", 80, "more"), mk("AI", 80, "more"), mk("코인", 80, "more")],
      { nowMs: NOW }
    );
    expect(r.deltaVsYesterday).toBeNull();
    expect(r.reason).toContain("어제 데이터 없음");
  });
});
