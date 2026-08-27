import { describe, it, expect } from "vitest";
import {
  buildExposureHistory, recentExposure, exposureSummary,
  RECENT_EXPOSURE_DAYS, EXPOSURE_HISTORY_MAX,
} from "../src/keyword-cards/exposure-history";

const snap = (date: string, picks: Array<Record<string, unknown>>) => ({ date, picks: picks as never });
const pick = (canonical: string, o: Record<string, unknown> = {}) => ({
  subject: { canonical }, hook: "기관이 조용히 3일째 매수 중", price: { current: 36_000 },
  signal: { code: "institution_streak" }, ...o,
});

describe("노출 이력 — 스냅샷에서 뽑는다(새로 저장할 것 없음)", () => {
  it("종목별로 최신이 먼저 오도록 모은다", () => {
    const h = buildExposureHistory([
      snap("2026-08-26", [pick("천보")]),
      snap("2026-08-24", [pick("천보"), pick("빅텍")]),
      snap("2026-08-25", [pick("천보")]),
    ]);
    expect(h.get("천보")!.map((e) => e.date)).toEqual(["2026-08-26", "2026-08-25", "2026-08-24"]);
    expect(h.get("빅텍")).toHaveLength(1);
  });

  it("그날 무엇 때문에 나왔는지를 남긴다 — 재등장 사유가 있으면 그게 이유다", () => {
    const h = buildExposureHistory([
      snap("2026-08-26", [pick("천보", { signal: { code: "x", reentry: { text: "외국인도 사기 시작했어요" } } })]),
    ]);
    expect(h.get("천보")![0]!.reason).toBe("외국인도 사기 시작했어요");
  });

  it("카드 형이 있으면 그 결론을 쓴다 — 카드와 이력이 다른 말을 하지 않게", () => {
    const h = buildExposureHistory([
      snap("2026-08-26", [pick("천보", { cardType: { hook: "시장은 빠지는데\n이것만 버티고 있어요" } })]),
    ]);
    expect(h.get("천보")![0]!.reason).toBe("시장은 빠지는데 이것만 버티고 있어요");
  });

  it("이유를 못 만들면 줄을 안 만든다 — 빈 줄은 답하는 시늉이다", () => {
    const h = buildExposureHistory([snap("2026-08-26", [{ subject: { canonical: "천보" } } as never])]);
    expect(h.get("천보")).toBeUndefined();
  });

  it("날짜 없는 스냅샷은 무시한다", () => {
    expect(buildExposureHistory([{ picks: [pick("천보")] as never }, null, undefined]).size).toBe(0);
  });
});

describe("3일 규칙 — 강등이 아니라 제외 (§A-1)", () => {
  const h = [{ date: "2026-08-25", reason: "기관 매수" }];

  it("어제 나왔으면 오늘 제외 대상이다", () => {
    expect(recentExposure(h, "2026-08-26")).not.toBeNull();
  });

  it("3일째 되는 날에도 아직 제외 대상이다", () => {
    expect(recentExposure(h, "2026-08-27")).not.toBeNull();
  });

  it("3일이 지나면 다시 후보가 된다", () => {
    expect(recentExposure(h, "2026-08-28")).toBeNull();
  });

  it("경계는 상수로 고정한다 — 감으로 바꾸지 않게", () => {
    expect(RECENT_EXPOSURE_DAYS).toBe(3);
  });

  it("이력이 없으면 제외하지 않는다", () => {
    expect(recentExposure(undefined, "2026-08-26")).toBeNull();
    expect(recentExposure([], "2026-08-26")).toBeNull();
  });

  it("날짜 형식이 아니면 판정하지 않는다 — 지어내지 않는다", () => {
    expect(recentExposure([{ date: "어제", reason: "x" }], "2026-08-26")).toBeNull();
  });
});

describe("노출 요약 — 처음 가격과 회차 (§B-4 · §C-1)", () => {
  const h = [
    { date: "2026-08-26", reason: "외국인도 사기 시작했어요", price: 36_300 },
    { date: "2026-08-25", reason: "기관이 계속 사고 있어요", price: 36_100 },
    { date: "2026-08-24", reason: "기관이 사기 시작했어요", price: 36_000 },
  ];

  it("처음 나온 날과 그때 가격을 준다", () => {
    const s = exposureSummary(h, "2026-08-27")!;
    expect(s.firstDate).toBe("2026-08-24");
    expect(s.firstPrice).toBe(36_000);
  });

  it("오늘을 포함해 몇 번째인지 센다", () => {
    expect(exposureSummary(h, "2026-08-27")!.count).toBe(4);
  });

  it("오늘자 항목은 과거로 세지 않는다 — 자기 자신 때문에 회차가 늘면 안 된다", () => {
    expect(exposureSummary(h, "2026-08-26")!.count).toBe(3);
  });

  it("처음 나온 종목이면 null — 그때는 아무것도 안 붙인다 (§C-2)", () => {
    expect(exposureSummary([], "2026-08-27")).toBeNull();
    expect(exposureSummary(undefined, "2026-08-27")).toBeNull();
  });

  it("최근 5회까지만 (§C-1)", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ date: `2026-08-${10 + i}`, reason: "x" }));
    expect(exposureSummary(many, "2026-08-27")!.recent).toHaveLength(EXPOSURE_HISTORY_MAX);
  });

  it("가격을 못 잰 날은 가격 칸이 없다 — 0 으로 채우지 않는다", () => {
    const s = exposureSummary([{ date: "2026-08-24", reason: "x" }], "2026-08-27")!;
    expect(s.firstPrice).toBeUndefined();
  });
});

describe("날짜 표기는 코어가 만든다 — 화면이 조립하지 않는다", () => {
  it("이력 줄과 요약이 `8월 24일` 을 들고 온다", () => {
    const h = buildExposureHistory([snap("2026-08-24", [pick("천보")])]);
    expect(h.get("천보")![0]!.when).toBe("8월 24일");
    expect(exposureSummary(h.get("천보"), "2026-08-27")!.firstWhen).toBe("8월 24일");
  });

  it("날짜를 못 읽으면 이력 줄을 만들지 않는다", () => {
    expect(buildExposureHistory([snap("어제", [pick("천보")])]).size).toBe(0);
  });
});

describe("연속일수 증가는 예외가 아니다 — 이 모듈이 그 판정을 하지 않는다 (완료 확인 3)", () => {
  it("제외 판정은 오직 **언제 나왔나**만 본다", () => {
    // 연속일수·강도·규모 어느 것도 인자로 받지 않는다 — 받으면 그게 예외 통로가 된다.
    expect(recentExposure.length).toBe(2);
  });
});
