import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **덱을 매일 굽는 크론이 없었다** (2026-08-31 실측).
 *
 * 배포하거나 사람이 손으로 돌릴 때만 구워졌다:
 * `8/18 · 8/23 · 8/25 · 8/26 · 8/27(실패)` — 8/28~8/30 은 아예 없다.
 *
 * 그래서 셋이 한꺼번에 망가져 있었다:
 * ① 같은 덱이 며칠씩 그대로(「종근당이 계속 나온다」)
 * ② 3일 규칙이 볼 스냅샷에 구멍 — 규칙은 맞는데 **볼 과거가 없었다**
 * ③ 인물 카드의 ARK 5일 비교 창이 영영 안 참
 *
 * 순서도 규칙의 일부다 — 수집이 끝난 **뒤에** 구워야 그날 모은 것이 그날 덱에 실린다.
 */
const wf = (name: string) =>
  readFileSync(new URL(`../../../../.github/workflows/${name}`, import.meta.url), "utf8");

/** `cron: "M H * * *"` → 그날의 분 단위 시각(UTC). */
function cronMinutes(src: string): number {
  const m = /cron:\s*"(\d+)\s+(\d+)\s/.exec(src);
  if (!m) throw new Error("cron 없음");
  return Number(m[2]) * 60 + Number(m[1]);
}

describe("덱을 매일 굽는다", () => {
  it("스케줄이 있다 — 손으로 돌릴 때만 구워지면 안 된다", () => {
    const bake = wf("daily-bake.yml");
    expect(bake).toContain("schedule:");
    expect(bake).toContain("/api/fomo/cron/quiet-pick");
  });

  it("굽기가 **수집 전부보다 뒤**다 — 그날 모은 것이 그날 덱에 실려야 한다", () => {
    /** UTC 자정을 넘기므로 KST 하루 안에서의 순서로 본다(수집 22:40~23:40 → 굽기 00:10). */
    const collectors = ["macro-collect.yml", "sector-map.yml", "investor-collect.yml", "disclosure-collect.yml"];
    const bakeAt = cronMinutes(wf("daily-bake.yml")) + 24 * 60; // 다음 날 00:10
    for (const name of collectors) {
      expect(cronMinutes(wf(name)), name).toBeLessThan(bakeAt);
    }
  });

  it("수집 순서가 서로 겹치지 않는다 — 같은 시각에 몰리면 커넥션을 함께 잡는다", () => {
    const times = ["macro-collect.yml", "sector-map.yml", "investor-collect.yml", "disclosure-collect.yml"]
      .map((n) => cronMinutes(wf(n)));
    expect(new Set(times).size).toBe(times.length);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("굽기가 막히면 **성공으로 넘기지 않는다** — 조용히 어제 덱이 남는다", () => {
    const bake = wf("daily-bake.yml");
    expect(bake).toContain("덱 굽기 실패");
    expect(bake).toContain("발행 가드가 막았다");
  });
});
