import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (factory: () => unknown) => factory,
}));

import { selectDaily30Candidates } from "../../lib/daily-30";
import { volumeRatioFromHistory } from "../../lib/us-market-cache";

type Candidate = Parameters<typeof selectDaily30Candidates>[0][number];

const cand = (id: string, assetClass: "kr-stock" | "us-stock" | "coin" | "macro", quietScore: number) =>
  ({ kind: "stock", id, assetClass, quietScore, signalScore: quietScore, hypePenalty: 0 }) as unknown as Candidate;

/**
 * US-02 D-1 — 국가 상한 70%.
 *
 * 상한은 **순서를 미루는 규칙이지 덱을 줄이는 규칙이 아니다.** 세 가지를 함께 지켜야 한다:
 * ① 다른 국가 후보가 있으면 넘치는 쪽을 뒤로 보낸다
 * ② 다른 국가 후보가 없으면 그냥 채운다(WO D-1 예외)
 * ③ 어느 경우에도 30장은 유지한다(이 저장소가 반복해서 다친 실패 모드)
 */
describe("daily-30 국가 상한 (US-02 D-1)", () => {
  it("국내가 독식해도 종목 카드의 70%를 넘지 않는다 — 다른 국가 후보가 있을 때", () => {
    const kr = Array.from({ length: 40 }, (_, i) => cand(`kr${i}`, "kr-stock", 100 - i));
    const us = Array.from({ length: 20 }, (_, i) => cand(`us${i}`, "us-stock", 10 - i * 0.1));
    const deck = selectDaily30Candidates([...kr, ...us], 30);
    const krCount = deck.filter((c) => c.assetClass === "kr-stock").length;
    expect(deck).toHaveLength(30);
    expect(krCount).toBeLessThanOrEqual(Math.floor(30 * 0.7));
  });

  it("다른 국가 후보가 없으면 상한을 넘겨서라도 30장을 채운다(억지로 비우지 않는다)", () => {
    const kr = Array.from({ length: 40 }, (_, i) => cand(`kr${i}`, "kr-stock", 100 - i));
    const deck = selectDaily30Candidates(kr, 30);
    expect(deck).toHaveLength(30);
    expect(deck.every((c) => c.assetClass === "kr-stock")).toBe(true);
  });

  it("코인·거시는 무국적이라 국가 상한의 분모가 아니다", () => {
    const kr = Array.from({ length: 21 }, (_, i) => cand(`kr${i}`, "kr-stock", 100 - i));
    const macro = Array.from({ length: 9 }, (_, i) => cand(`macro${i}`, "macro", 50 - i));
    const deck = selectDaily30Candidates([...kr, ...macro], 30);
    // 상한은 floor(30 × 0.7) = 21. KR 21장은 그 안이므로 전부 들어가고 거시가 나머지를 채운다.
    // 거시를 국가 분모에 넣었다면 KR 은 21보다 적게 잘렸을 것이다.
    expect(deck.filter((c) => c.assetClass === "kr-stock")).toHaveLength(21);
    expect(deck.filter((c) => c.assetClass === "macro")).toHaveLength(9);
    expect(deck).toHaveLength(30);
  });

  it("미장 바닥(8)은 국가 상한을 넣은 뒤에도 지켜진다(2026-07-12 미장 1장 사고 회귀)", () => {
    const kr = Array.from({ length: 40 }, (_, i) => cand(`kr${i}`, "kr-stock", 100 - i));
    const us = Array.from({ length: 10 }, (_, i) => cand(`us${i}`, "us-stock", 10 - i * 0.1));
    const deck = selectDaily30Candidates([...kr, ...us], 30);
    expect(deck.filter((c) => c.assetClass === "us-stock").length).toBeGreaterThanOrEqual(8);
  });
});

/**
 * US-02 B-2 — 거래량 이력에서 각성 배수 계산.
 *
 * 오늘을 분모에 넣으면 급증분이 스스로를 희석해 각성을 못 잡는다. 표본이 모자라면
 * 비율을 내지 않는다 — 거짓 각성은 없는 것보다 나쁘다.
 */
describe("volumeRatioFromHistory (US-02 B-2)", () => {
  const history = (values: Record<string, number>) => values;

  it("오늘을 뺀 과거 평균 대비 배수를 낸다", () => {
    const result = volumeRatioFromHistory(
      history({
        "2026-08-20": 100,
        "2026-08-21": 100,
        "2026-08-22": 100,
        "2026-08-25": 100,
        "2026-08-26": 100,
        "2026-08-27": 100,
        "2026-08-28": 300,
      }),
      "2026-08-28"
    );
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeCloseTo(3, 5);
    expect(result!.avg).toBeCloseTo(100, 5);
  });

  it("오늘 거래량이 평균을 희석하지 않는다(오늘은 분모에서 뺀다)", () => {
    const result = volumeRatioFromHistory(
      history({
        "2026-08-20": 100,
        "2026-08-21": 100,
        "2026-08-22": 100,
        "2026-08-25": 100,
        "2026-08-26": 100,
        "2026-08-27": 100,
        "2026-08-28": 1000,
      }),
      "2026-08-28"
    );
    // 오늘을 포함했다면 평균 228.6 → 배수 4.4 로 축소된다. 뺐으므로 10배 그대로다.
    expect(result!.ratio).toBeCloseTo(10, 5);
  });

  it("과거 표본이 모자라면 비율을 내지 않는다(거짓 각성 금지)", () => {
    expect(
      volumeRatioFromHistory(history({ "2026-08-27": 100, "2026-08-28": 500 }), "2026-08-28")
    ).toBeNull();
  });

  it("오늘 거래량이 없으면 null(휴장·미갱신 종목)", () => {
    expect(
      volumeRatioFromHistory(
        history({
          "2026-08-20": 100,
          "2026-08-21": 100,
          "2026-08-22": 100,
          "2026-08-25": 100,
          "2026-08-26": 100,
          "2026-08-27": 100,
        }),
        "2026-08-28"
      )
    ).toBeNull();
  });

  it("미래 날짜는 분모에 넣지 않는다(세션일 기준 과거만)", () => {
    const result = volumeRatioFromHistory(
      history({
        "2026-08-20": 100,
        "2026-08-21": 100,
        "2026-08-22": 100,
        "2026-08-25": 100,
        "2026-08-26": 100,
        "2026-08-27": 100,
        "2026-08-28": 200,
        "2026-08-31": 999_999,
      }),
      "2026-08-28"
    );
    expect(result!.avg).toBeCloseTo(100, 5);
  });

  it("이력이 없으면 null", () => {
    expect(volumeRatioFromHistory(undefined, "2026-08-28")).toBeNull();
  });
});
