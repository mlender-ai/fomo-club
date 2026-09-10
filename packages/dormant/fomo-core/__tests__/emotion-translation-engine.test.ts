import { describe, expect, it } from "vitest";
import {
  buildFeedCards,
  classifySignal,
  feedCardsToMoodSignals,
  passesRegulation,
  translateSignal,
  FEED_EMOTIONS,
  type RawSignal,
} from "../src";

const macroUp: RawSignal = {
  id: "macro-sox",
  source: "macro",
  label: "필라델피아 반도체",
  changePct: 3.4,
  value: "+3.4%",
};

const macroDown: RawSignal = {
  id: "macro-kospi",
  source: "macro",
  label: "코스피",
  changePct: -3.2,
  value: "-3.2%",
};

describe("classifySignal", () => {
  it("급등 → 환희, 급락 → 공포", () => {
    expect(classifySignal(macroUp)?.emotion).toBe("joy");
    expect(classifySignal(macroDown)?.emotion).toBe("fear");
  });

  it("완만한 상승 → 포모(낮은 신뢰)", () => {
    const c = classifySignal({ ...macroUp, changePct: 2 });
    expect(c?.emotion).toBe("fomo");
    expect(c!.confidence).toBeLessThan(0.8);
  });

  it("깊은 물림(전고점 대비) → 후회", () => {
    const c = classifySignal({ id: "btc-ath", source: "whale", label: "비트코인", athChangePct: -45 });
    expect(c?.emotion).toBe("regret");
  });

  it("커뮤니티 bullish 과열 → 탐욕, 표본 부족이면 분류 안 함", () => {
    const hot = classifySignal({ id: "c1", source: "community", bullishRatio: 0.8, mentions: 20 });
    expect(hot?.emotion).toBe("greed");
    const thin = classifySignal({ id: "c2", source: "community", bullishRatio: 0.9, mentions: 2 });
    expect(thin).toBeNull();
  });

  it("제목 키워드가 감정 간 충돌하면 애매 → null (보수적)", () => {
    const c = classifySignal({ id: "n1", source: "news", title: "폭락 후 신고가 랠리" });
    expect(c).toBeNull();
  });

  it("보합·근거 없음 → null (빈 화면보다 무분류가 낫다... 는 아니고 mock이 채운다)", () => {
    expect(classifySignal({ id: "flat", source: "macro", label: "코스닥", changePct: 0.1 })).toBeNull();
  });
});

describe("translateSignal", () => {
  it("정보가 아니라 분위기 문장 + 수치는 근거로", () => {
    const cls = classifySignal(macroUp)!;
    const card = translateSignal(macroUp, cls)!;
    expect(card.headline).toContain("다들 신났어");
    expect(card.headline).not.toContain("3.4"); // 수치는 헤드라인에 없다
    expect(card.evidence?.value).toBe("+3.4%"); // 근거로 작게
  });

  it("금칙어 게이트", () => {
    expect(passesRegulation("지금 매수하세요")).toBe(false);
    expect(passesRegulation("내일 오른다")).toBe(false);
    expect(passesRegulation("다들 들떠 있어. 너만 그런 거 아니야.")).toBe(true);
  });
});

describe("buildFeedCards", () => {
  it("분류→번역→그룹, 부족한 탭은 mock으로 채움(빈 화면 금지)", () => {
    const cards = buildFeedCards([macroUp, macroDown]);
    for (const e of FEED_EMOTIONS) {
      expect(cards[e].length).toBeGreaterThanOrEqual(5);
    }
    // 실데이터 카드가 mock보다 앞
    expect(cards.joy[0]!.id).toBe("feed-macro-sox");
    expect(cards.fear[0]!.id).toBe("feed-macro-kospi");
  });

  it("모든 카드가 금칙어 0건 + emotion 일치", () => {
    const cards = buildFeedCards([macroUp, macroDown]);
    for (const e of FEED_EMOTIONS) {
      for (const c of cards[e]) {
        expect(passesRegulation(c.headline)).toBe(true);
        expect(c.emotion).toBe(e);
      }
    }
  });

  it("중복 id 신호는 한 번만", () => {
    const cards = buildFeedCards([macroUp, macroUp]);
    expect(cards.joy.filter((c) => c.id === "feed-macro-sox")).toHaveLength(1);
  });
});

describe("feedCardsToMoodSignals", () => {
  it("실데이터 카드만 오늘 탭에 흘린다 (mock 제외)", () => {
    const cards = buildFeedCards([macroUp, macroDown]);
    const moods = feedCardsToMoodSignals(cards);
    expect(moods.length).toBe(2); // joy + fear 실데이터만
    for (const m of moods) {
      expect(m.id.startsWith("mood-feed-")).toBe(true);
    }
  });
});
