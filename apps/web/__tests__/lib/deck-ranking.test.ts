import { describe, expect, it } from "vitest";
import {
  noveltyScore,
  page1CooldownFactor,
  anomalyMultiplier,
  rankScore,
  isFreshSignal,
  isAgedOut,
  deckCaps,
  composeDeck,
  page1StreakFromHistory,
  NOVELTY_HALFLIFE_DAYS,
  NOVELTY_MAX,
  SIGNAL_AGE_MAX_DAYS,
  FRESH_AGE_DAYS,
  DECK_COMPOSITION_VERSION,
  type DeckCandidate,
} from "../../lib/deck-ranking";

/**
 * WO-DECK-01 — 랭킹 철학을 테스트로 봉인한다.
 *
 * 이 파일의 존재 이유는 회귀 방지 하나다: **연속일수가 다시 랭킹 가점으로 새어 들어오면**
 * 고착이 재발한다(WO 실패 모드 1번). 그래서 "오래된 신호가 더 강해지지 않는다" 를 직접 단정한다.
 */

describe("신규성 감쇠 — 오래된 신호는 강한 게 아니라 늦은 것이다", () => {
  it("신호가 처음 나타난 날 만점이다", () => {
    expect(noveltyScore(0)).toBe(NOVELTY_MAX);
  });

  it("반감기에서 정확히 절반이다 (실측 경과일 중앙값 5일)", () => {
    expect(noveltyScore(NOVELTY_HALFLIFE_DAYS)).toBeCloseTo(NOVELTY_MAX / 2, 10);
    expect(noveltyScore(NOVELTY_HALFLIFE_DAYS * 2)).toBeCloseTo(NOVELTY_MAX / 4, 10);
  });

  it("경과일에 대해 단조 감소한다 — 증가 구간이 하나도 없어야 한다", () => {
    for (let age = 0; age < 40; age += 1) {
      expect(noveltyScore(age + 1)).toBeLessThan(noveltyScore(age));
    }
  });

  it("음수·NaN 경과일이 만점을 넘기지 못한다", () => {
    expect(noveltyScore(-5)).toBe(NOVELTY_MAX);
    expect(noveltyScore(Number.NaN)).toBe(NOVELTY_MAX);
  });

  it("빅텍 사례(26일)는 사실상 소멸한다 — 실측 360점 1위였던 신호다", () => {
    expect(noveltyScore(26)).toBeLessThan(3);
  });
});

describe("연속일수는 랭킹 가점이 아니다 (WO 완료조건 3)", () => {
  it("rankScore 는 경과일이 길수록 낮다 — 같은 이례성·같은 쿨다운이면 예외 없다", () => {
    const young = rankScore({ ageDays: 3, anomalyStrength: 2.0 });
    const old = rankScore({ ageDays: 26, anomalyStrength: 2.0 });
    expect(old).toBeLessThan(young);
  });

  it("이례성 가중은 1차 축을 뒤집지 못한다 — 반감기 차이를 이기지 못한다", () => {
    // 이례성 최대(4.3) 인 늙은 신호 vs 이례성 없는 신규 신호.
    const agedButUnusual = rankScore({ ageDays: 5, anomalyStrength: 4.3 });
    const freshAndPlain = rankScore({ ageDays: 0, anomalyStrength: 0 });
    expect(freshAndPlain).toBeGreaterThan(agedButUnusual);
  });

  it("이례성은 인접 경과일의 동점만 가른다", () => {
    const strong = rankScore({ ageDays: 5, anomalyStrength: 4.3 });
    const weak = rankScore({ ageDays: 5, anomalyStrength: 1.0 });
    expect(strong).toBeGreaterThan(weak);
  });
});

describe("재노출 쿨다운 — 강등이지 제외가 아니다", () => {
  it("3일 미만 연속 점유는 감점 없다", () => {
    expect(page1CooldownFactor(0)).toBe(1);
    expect(page1CooldownFactor(2)).toBe(1);
  });

  it("오래 버틸수록 더 강하게 누른다 (누진)", () => {
    expect(page1CooldownFactor(3)).toBe(0.6);
    expect(page1CooldownFactor(4)).toBe(0.6);
    expect(page1CooldownFactor(5)).toBe(0.4);
    expect(page1CooldownFactor(6)).toBe(0.4);
    expect(page1CooldownFactor(7)).toBe(0.25);
    expect(page1CooldownFactor(30)).toBe(0.25);
  });

  it("계수는 0 이 아니다 — 압도적으로 강한 신호는 살아남을 수 있어야 한다", () => {
    for (const days of [3, 5, 7, 14, 60]) expect(page1CooldownFactor(days)).toBeGreaterThan(0);
  });

  it("쿨다운이 걸린 신규 신호가 감점 없는 지속 신호를 아직 이길 수 있다", () => {
    const freshPenalized = rankScore({ ageDays: 1, page1Streak: 7 }); // ×0.25
    const persistentClean = rankScore({ ageDays: 13, page1Streak: 0 });
    expect(freshPenalized).toBeGreaterThan(persistentClean);
  });
});

describe("경과일 상한 — 워치 강등", () => {
  it(`${SIGNAL_AGE_MAX_DAYS}일 이하는 픽 자격을 유지한다`, () => {
    expect(isAgedOut(SIGNAL_AGE_MAX_DAYS)).toBe(false);
    expect(isAgedOut(SIGNAL_AGE_MAX_DAYS + 1)).toBe(true);
  });

  it(`신규 정의는 ${FRESH_AGE_DAYS}일 이내다`, () => {
    expect(isFreshSignal(FRESH_AGE_DAYS)).toBe(true);
    expect(isFreshSignal(FRESH_AGE_DAYS + 1)).toBe(false);
  });
});

describe("덱 구성 — 비율이 정본이고 장수는 파생이다", () => {
  it("10장이면 신규 최소 6 · 동일유형 최대 6 · 지속 최대 4", () => {
    expect(deckCaps(10)).toEqual({ minFresh: 6, maxSameKind: 6, maxPersistent: 4 });
  });

  it("덱 크기를 바꿔도 규칙이 따라간다 (장수를 박지 않았다)", () => {
    expect(deckCaps(5)).toEqual({ minFresh: 3, maxSameKind: 3, maxPersistent: 2 });
    expect(deckCaps(20)).toEqual({ minFresh: 12, maxSameKind: 12, maxPersistent: 8 });
  });

  const fresh = (kind: string, age = 2): DeckCandidate => ({ kind, ageDays: age });
  const persistent = (kind: string, age = 12): DeckCandidate => ({ kind, ageDays: age });

  it("지속 신호가 상한을 넘지 못한다", () => {
    const ranked = [...Array(10)].map(() => persistent("institution_streak"));
    const result = composeDeck(ranked, { deckSize: 10 });
    expect(result.deck.every((d) => !isFreshSignal(d.ageDays))).toBe(true);
    // 신규가 0장이므로 하한을 못 채운다 → 덱을 줄인다(지속으로 채우지 않는다).
    expect(result.deck.length).toBeLessThanOrEqual(4);
    expect(result.shrunkBy).toBeGreaterThan(0);
  });

  it("같은 유형이 덱을 독점하지 못한다", () => {
    const ranked = [...Array(12)].map((_, i) => fresh("insider_cluster", i % FRESH_AGE_DAYS));
    const result = composeDeck(ranked, { deckSize: 10 });
    expect(result.deck.length).toBe(6); // 동일유형 상한 6 에서 멈춘다
    expect(result.skipped.kind_cap).toBeGreaterThan(0);
    // 축소된 덱(6장)에도 **적용된** 상한(10장 기준 6)을 보고한다 — 실제 덱과 어긋나면 안 된다.
    expect(result.caps.maxSameKind).toBe(6);
    expect(result.deck.filter((d) => d.kind === "insider_cluster").length).toBeLessThanOrEqual(result.caps.maxSameKind);
  });

  it("신규가 부족하면 워치에서 승격한다 — 지속으로 채우지 않는다", () => {
    const ranked = [
      fresh("insider_cluster"),
      fresh("insider_cluster"),
      ...[...Array(8)].map(() => persistent("institution_streak")),
    ];
    const watchPool = [...Array(6)].map(() => fresh("foreign_streak"));
    const result = composeDeck(ranked, { deckSize: 10, watchPool });
    expect(result.promoted).toBeGreaterThan(0);
    const freshCount = result.deck.filter((d) => isFreshSignal(d.ageDays)).length;
    expect(freshCount).toBeGreaterThanOrEqual(deckCaps(result.deck.length).minFresh);
    // 보고된 상한은 **요청 덱 크기 기준**이다(최종 장수로 재계산하면 실제 덱과 어긋난다).
    expect(result.caps).toEqual(deckCaps(10));
  });

  it("승격해도 부족하면 덱을 줄인다", () => {
    const ranked = [fresh("insider_cluster"), ...[...Array(9)].map(() => persistent("institution_streak"))];
    const result = composeDeck(ranked, { deckSize: 10, watchPool: [] });
    const freshCount = result.deck.filter((d) => isFreshSignal(d.ageDays)).length;
    expect(freshCount).toBeGreaterThanOrEqual(deckCaps(result.deck.length).minFresh);
    expect(result.deck.length).toBeLessThan(10);
    expect(result.caps).toEqual(deckCaps(10));
  });

  it("공급이 충분하면 상한대로 찬다", () => {
    const ranked = [
      ...[...Array(6)].map(() => fresh("insider_cluster")),
      ...[...Array(4)].map(() => persistent("institution_streak")),
    ];
    const result = composeDeck(ranked, { deckSize: 10 });
    expect(result.deck.length).toBe(10);
    expect(result.shrunkBy).toBe(0);
    expect(result.promoted).toBe(0);
  });

  it("구성 규칙에 버전이 찍힌다 (WO 완료조건 7)", () => {
    expect(composeDeck([], { deckSize: 10 }).version).toBe(DECK_COMPOSITION_VERSION);
  });
});

describe("1페이지 연속 점유 이력", () => {
  it("최신 날부터 이어진 구간만 센다", () => {
    const streak = page1StreakFromHistory([
      { page1: ["빅텍", "A", "B"] },
      { page1: ["빅텍", "A", "C"] },
      { page1: ["빅텍", "D", "E"] },
    ]);
    expect(streak.get("빅텍")).toBe(3);
    expect(streak.get("A")).toBe(2);
    expect(streak.get("B")).toBe(1);
  });

  it("가장 최근 날에 없던 종목은 연속이 0 이다 (하루라도 비면 끊긴다)", () => {
    const streak = page1StreakFromHistory([
      { page1: ["A"] },
      { page1: ["빅텍"] },
      { page1: ["빅텍"] },
    ]);
    expect(streak.get("빅텍")).toBeUndefined();
    expect(streak.get("A")).toBe(1);
  });

  it("이력이 없으면 빈 맵이다", () => {
    expect(page1StreakFromHistory([]).size).toBe(0);
  });
});

describe("이례성 가중", () => {
  it("값이 없으면 가중 없음", () => {
    expect(anomalyMultiplier(undefined)).toBe(1);
    expect(anomalyMultiplier(0)).toBe(1);
  });
  it("상한을 넘지 않는다", () => {
    expect(anomalyMultiplier(100)).toBeCloseTo(1.3, 10);
  });
});
