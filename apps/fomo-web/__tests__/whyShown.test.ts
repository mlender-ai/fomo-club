import { describe, expect, it } from "vitest";
import { computeFomoScore } from "@fomo/core";
import type { DeckStock } from "../lib/discoveryDeck";
import { whyShown } from "../lib/whyShown";

const baseStock: DeckStock = {
  canonical: "대주전자재료",
  market: "KOSDAQ",
  country: "KR",
  naverCode: "078600",
  marquee: false,
  sector: "2차전지",
};

const FORBIDDEN = /(매수|매도|사도 되는|타이밍|오를 가능성|추천)/;

describe("whyShown", () => {
  it("uses grounded discovery reason as the highest-priority display reason", () => {
    const text = whyShown({
      stock: { ...baseStock, reason: "실리콘 음극재 원문 근거" },
      fomoLabel: "incoming",
      signals: { mentionScore: 90, mentionCount: 6 },
    });

    expect(text).toBe("대장주 말고 ‘2차전지’ 흐름에서 같이 움직인 종목이에요.");
    expect(text).not.toMatch(FORBIDDEN);
  });

  it("explains incoming stocks without sounding like investment advice", () => {
    const incoming = computeFomoScore({ foreignNetStreak: 4, changePct: 0.3 });
    const text = whyShown({ stock: baseStock, fomoLabel: incoming.label });

    expect(incoming.label).toBe("incoming");
    expect(text).toBe("아직 조용한데 수급이 먼저 들어오는 중이에요.");
    expect(text).not.toMatch(FORBIDDEN);
  });

  it("uses mention signals only as an attention explanation", () => {
    const text = whyShown({ stock: baseStock, signals: { mentionScore: 80, mentionCount: 4 } });

    expect(text).toBe("오늘 이 종목을 언급한 뉴스·글이 늘었어요.");
    expect(text).not.toMatch(FORBIDDEN);
  });

  it("always returns a deterministic fallback", () => {
    const first = whyShown({ stock: baseStock });
    const second = whyShown({ stock: baseStock });

    expect(first).toBe("오늘 발견 풀에서 보여주는 종목이에요.");
    expect(second).toBe(first);
    expect(first).not.toMatch(FORBIDDEN);
  });
});
