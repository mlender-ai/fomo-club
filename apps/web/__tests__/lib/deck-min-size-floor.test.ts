import { describe, it, expect } from "vitest";
import {
  composeDeck,
  composeDeckWithFloor,
  DECK_MIN_SIZE,
  DECK_ALERT_MIN,
  type DeckCandidate,
} from "../../lib/deck-ranking";

/**
 * HOTFIX-DECK §C-1 — **덱 최소 장수 안전장치.**
 *
 * 2026-08-28 사고: 품질 게이트를 통과한 후보 19개 중 18개를 재노출 규칙이 잘라내
 * 덱이 **1장**이 나갔다. 규칙은 의도대로 동작했다 — 규칙이 덱을 비우는 것을 막을 장치가
 * 없었을 뿐이다. 여기서 막는 것은 그 회귀다.
 */

const fresh = (kind: string, age = 2): DeckCandidate => ({ kind, ageDays: age });
const persistent = (kind: string, age = 12): DeckCandidate => ({ kind, ageDays: age });

describe("사고 재현 — 규칙 하나가 덱을 비울 수 있었다", () => {
  it("보류분이 없으면(=종전 동작) 덱이 1장으로 나간다", () => {
    // 그날 그대로: 규칙을 통과한 후보 1개, 규칙에 걸린 후보 18개.
    const survived = [fresh("insider_cluster")];
    const result = composeDeck(survived, { deckSize: 15 });
    expect(result.deck.length).toBe(1);
  });

  it("안전장치가 보류분에서 채워 최소 장수를 회복한다", () => {
    const survived = [fresh("insider_cluster")];
    const held = [...Array(18)].map((_, i) => fresh("insider_cluster", i % 6));
    const result = composeDeckWithFloor(survived, { deckSize: 15, held, minDeckSize: DECK_MIN_SIZE });
    expect(result.deck.length).toBeGreaterThanOrEqual(DECK_MIN_SIZE);
    expect(result.relaxations).toContain("recent_exposure");
    expect(result.readmitted).toBeGreaterThan(0);
  });
});

describe("해제 순서 — 잃는 것이 적은 것부터", () => {
  it("최소 장수를 이미 넘으면 아무 규칙도 풀지 않는다", () => {
    const ranked = [
      ...[...Array(5)].map(() => fresh("insider_cluster")),
      ...[...Array(5)].map(() => fresh("market_divergence")),
    ];
    const held = [...Array(5)].map(() => fresh("insider_cluster"));
    const result = composeDeckWithFloor(ranked, { deckSize: 10, held, minDeckSize: DECK_MIN_SIZE });
    expect(result.deck.length).toBe(10);
    expect(result.relaxations).toEqual([]);
    expect(result.readmitted).toBe(0);
  });

  it("보류분을 먼저 쓴다 — 신규 하한·유형 상한은 그것으로 부족할 때만 푼다", () => {
    const ranked = [fresh("insider_cluster"), fresh("market_divergence")];
    const held = [...Array(10)].map(() => fresh("foreign_streak"));
    const result = composeDeckWithFloor(ranked, { deckSize: 15, held, minDeckSize: DECK_MIN_SIZE });
    expect(result.relaxations).toContain("recent_exposure");
    expect(result.relaxations).not.toContain("fresh_floor");
  });

  it("처음 나오는 카드가 항상 먼저 자리를 잡는다 — 보류분은 남는 자리만 채운다", () => {
    const first = fresh("insider_cluster");
    const held = [...Array(10)].map(() => fresh("foreign_streak"));
    const result = composeDeckWithFloor([first], { deckSize: 15, held, minDeckSize: DECK_MIN_SIZE });
    expect(result.deck[0]).toBe(first);
  });

  it("신규가 없어 덱이 짧으면 신규 하한을 푼다", () => {
    // 지속 신호만 있는 날 — 종전에는 신규 하한(60%) 때문에 덱이 4장으로 깎였다.
    const ranked = [...Array(12)].map((_, i) => persistent(i % 2 === 0 ? "institution_streak" : "foreign_streak"));
    const result = composeDeckWithFloor(ranked, { deckSize: 10, minDeckSize: DECK_MIN_SIZE });
    expect(result.deck.length).toBeGreaterThanOrEqual(DECK_MIN_SIZE);
    expect(result.relaxations).toContain("fresh_floor");
  });

  it("유형 상한이 마지막 자물쇠면 그것도 푼다", () => {
    // 두 유형이지만 한쪽이 압도적 — 상한(5)에 걸려 6장에서 멈춘다.
    const ranked = [
      ...[...Array(11)].map(() => fresh("insider_cluster")),
      fresh("market_divergence"),
    ];
    const result = composeDeckWithFloor(ranked, { deckSize: 10, minDeckSize: DECK_MIN_SIZE });
    expect(result.deck.length).toBeGreaterThanOrEqual(DECK_MIN_SIZE);
    expect(result.relaxations).toContain("kind_cap");
  });

  it("효과가 없는 해제는 기록하지 않는다 — 로그가 원인을 잘못 가리키면 안 된다", () => {
    // 후보가 정말 3개뿐인 날. 무엇을 풀어도 3장이다.
    const ranked = [fresh("insider_cluster"), fresh("market_divergence"), fresh("foreign_streak")];
    const result = composeDeckWithFloor(ranked, { deckSize: 10, held: [], minDeckSize: DECK_MIN_SIZE });
    expect(result.deck.length).toBe(3);
    expect(result.relaxations).toEqual([]);
  });
});

describe("풀지 않는 것 — 품질 게이트는 사다리에 없다", () => {
  it("후보가 없으면 그대로 둔다(④) — 채우려고 없는 것을 만들지 않는다", () => {
    const result = composeDeckWithFloor([], { deckSize: 10, held: [], minDeckSize: DECK_MIN_SIZE });
    expect(result.deck).toEqual([]);
    expect(result.relaxations).toEqual([]);
  });

  it("사다리는 세 칸뿐이다 — 대형주·이미 오른 종목을 푸는 칸은 없다", () => {
    const ranked = [fresh("insider_cluster")];
    const result = composeDeckWithFloor(ranked, { deckSize: 10, held: [], minDeckSize: DECK_MIN_SIZE });
    for (const relaxation of result.relaxations) {
      expect(["recent_exposure", "fresh_floor", "kind_cap"]).toContain(relaxation);
    }
  });
});

describe("신규 하한 때문에 덱을 최소 장수 아래로 깎지 않는다 (§B-2)", () => {
  it("깎던 루프가 하한에서 멈춘다", () => {
    // 신규 1 + 지속 9 — 종전에는 하한(60%)을 맞추려고 2장까지 깎았다.
    const ranked = [fresh("insider_cluster"), ...[...Array(9)].map(() => persistent("institution_streak"))];
    const withoutFloor = composeDeck(ranked, { deckSize: 10 });
    const withFloor = composeDeck(ranked, { deckSize: 10, minDeckSize: DECK_MIN_SIZE });
    expect(withoutFloor.deck.length).toBeLessThan(DECK_MIN_SIZE);
    expect(withFloor.deck.length).toBeGreaterThanOrEqual(
      Math.min(DECK_MIN_SIZE, withoutFloor.deck.length + withFloor.shrunkBy + 1)
    );
    expect(withFloor.deck.length).toBeGreaterThan(withoutFloor.deck.length);
  });
});

describe("경계 상수 (§C-1·§C-2)", () => {
  it("최소 장수는 8장 — 스와이프가 한 세션으로 성립하는 선", () => {
    expect(DECK_MIN_SIZE).toBe(8);
  });

  it("알림 기준은 최소 장수보다 낮다 — 하한을 스친 날마다 울리면 알림이 무뎌진다", () => {
    expect(DECK_ALERT_MIN).toBe(5);
    expect(DECK_ALERT_MIN).toBeLessThan(DECK_MIN_SIZE);
  });
});
