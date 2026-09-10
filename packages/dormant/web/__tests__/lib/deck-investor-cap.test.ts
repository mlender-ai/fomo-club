import { describe, it, expect } from "vitest";
import {
  composeDeck, is13fSeason,
  MAX_INVESTOR_RATIO, MAX_INVESTOR_RATIO_13F_SEASON, MAX_SAME_INVESTOR,
} from "../../lib/deck-ranking";

/** 신규 신호로 둬야 신규 하한·지속 상한에 안 걸린다 — 여기서 재는 건 인물 상한이다. */
const item = (kind: string, investorId?: string) => ({ kind, ageDays: 0, ...(investorId ? { investorId } : {}) });

describe("인물 카드 상한 — WO-RESET-07 §E-2 (완료 확인 9)", () => {
  it("전체의 40%를 넘지 않는다", () => {
    const ranked = Array.from({ length: 15 }, (_, i) => item(`k${i}`, `inv${i}`));
    const deck = composeDeck(ranked, { deckSize: 15, today: "2026-08-27" }).deck;
    expect(deck.length).toBe(Math.floor(15 * MAX_INVESTOR_RATIO));
  });

  it("13F 시즌엔 60%까지 허용한다 — 가장 재미있는 날에 가장 많이 버리면 안 된다", () => {
    const ranked = Array.from({ length: 15 }, (_, i) => item(`k${i}`, `inv${i}`));
    const deck = composeDeck(ranked, { deckSize: 15, today: "2026-08-14" }).deck;
    expect(deck.length).toBe(Math.floor(15 * MAX_INVESTOR_RATIO_13F_SEASON));
  });

  it("같은 인물은 2장을 넘지 않는다", () => {
    const ranked = Array.from({ length: 6 }, (_, i) => item(`k${i}`, "cathie-wood"));
    const deck = composeDeck(ranked, { deckSize: 15, today: "2026-08-27" }).deck;
    expect(deck.length).toBe(MAX_SAME_INVESTOR);
  });

  it("인물 아닌 카드는 이 상한과 무관하다 — 같은 덱에 섞는다(§E-1)", () => {
    const ranked = [
      ...Array.from({ length: 4 }, (_, i) => item(`a${i}`, "cathie-wood")),
      ...Array.from({ length: 8 }, (_, i) => item(`b${i}`)),
    ];
    const deck = composeDeck(ranked, { deckSize: 15, today: "2026-08-27" }).deck;
    expect(deck.filter((d) => d.investorId).length).toBe(MAX_SAME_INVESTOR);
    expect(deck.filter((d) => !d.investorId).length).toBe(8);
  });

  it("밀린 이유를 사유로 남긴다 — 선반이 그대로 번역한다", () => {
    const ranked = Array.from({ length: 6 }, (_, i) => item(`k${i}`, "cathie-wood"));
    const res = composeDeck(ranked, { deckSize: 15, today: "2026-08-27" });
    expect(res.skipped["same_investor_cap"]).toBe(4);
  });

  it("날짜를 안 주면 평소 상한을 쓴다 — 넓히는 쪽이 아니라 좁히는 쪽으로 틀린다", () => {
    const ranked = Array.from({ length: 15 }, (_, i) => item(`k${i}`, `inv${i}`));
    expect(composeDeck(ranked, { deckSize: 15 }).deck.length).toBe(Math.floor(15 * MAX_INVESTOR_RATIO));
  });
});

describe("13F 시즌 판정", () => {
  it("2·5·8·11월 중순이 시즌이다 — 분기 종료 45일 뒤가 마감", () => {
    for (const d of ["2026-02-14", "2026-05-15", "2026-08-14", "2026-11-14"]) expect(is13fSeason(d), d).toBe(true);
  });
  it("그 밖은 시즌이 아니다", () => {
    for (const d of ["2026-08-27", "2026-08-05", "2026-07-14", "2026-01-14"]) expect(is13fSeason(d), d).toBe(false);
  });
  it("날짜 형식이 아니면 시즌이 아니다", () => {
    expect(is13fSeason("오늘")).toBe(false);
  });
});
