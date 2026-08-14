import { describe, expect, it } from "vitest";
import { logStageReport, runWithStageTimer, timeStage, timeStageSync } from "../../lib/stage-timer";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("stage-timer (WO-OPS-504 PHASE 2)", () => {
  it("타이머 밖에서는 그대로 통과한다 — 크론·테스트 경로 무영향", async () => {
    await expect(timeStage("free", async () => "value")).resolves.toBe("value");
    expect(timeStageSync("free-sync", () => 7)).toBe(7);
  });

  it("끝난 단계를 오래 걸린 순으로 낸다", async () => {
    const { result, report } = runWithStageTimer(async () => {
      await timeStage("slow", () => sleep(40));
      await timeStage("fast", () => sleep(1));
    });
    await result;
    const done = report();
    expect(done.measured).toBe(true);
    expect(done.stages.map((row) => row.stage)).toEqual(["slow", "fast"]);
    expect(done.top[0]?.stage).toBe("slow");
    expect(done.pending).toEqual([]);
  });

  it("같은 단계가 여러 번 돌면 합산하고 횟수를 남긴다", async () => {
    const { result, report } = runWithStageTimer(async () => {
      await timeStage("repeat", () => sleep(2));
      await timeStage("repeat", () => sleep(2));
    });
    await result;
    expect(report().stages).toEqual([expect.objectContaining({ stage: "repeat", count: 2 })]);
  });

  it("마감 초과 시점의 미완 단계를 낸다 — 504 로 죽으면 아무것도 안 남는다는 것이 이번 사고의 교훈", async () => {
    const { result, report } = runWithStageTimer(async () => {
      await timeStage("hangs", () => sleep(120));
    });
    await sleep(20);
    const midflight = report();
    expect(midflight.stages).toEqual([]);
    expect(midflight.pending.map((row) => row.stage)).toEqual(["hangs"]);
    expect(midflight.measured).toBe(true);
    await result;
  });

  it("던져도 단계를 기록한다 — 실패한 단계가 병목일 수 있다", async () => {
    const { result, report } = runWithStageTimer(async () => {
      await timeStage("throws", async () => {
        await sleep(2);
        throw new Error("boom");
      }).catch(() => null);
    });
    await result;
    expect(report().stages.map((row) => row.stage)).toEqual(["throws"]);
  });

  it("잎이 안 돌면 measured=false — 캐시 히트를 구분할 수 있어야 한다", async () => {
    const { result, report } = runWithStageTimer(async () => "cached");
    await result;
    const done = report();
    expect(done.measured).toBe(false);
    expect(done.top).toEqual([]);
  });

  it("로그 한 줄은 보고를 그대로 돌려준다 — 응답에도 같은 값을 실을 수 있어야 한다", async () => {
    const { result, report } = runWithStageTimer(async () => {
      await timeStage("only", () => sleep(1));
    });
    await result;
    const done = report();
    expect(logStageReport("test", done)).toBe(done);
  });
});
