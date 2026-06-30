import { describe, expect, it } from "vitest";
import type { DiscoveryCandidate } from "@fomo/core";
import {
  blockOverlapRatio,
  synthesizeWhyDrivenInsight,
  validateWhyInsightOutput,
} from "../../lib/insight-synthesis";

const asOf = "2026-06-24";

function baseCandidate(): DiscoveryCandidate {
  return {
    ticker: "금호타이어",
    market: "KOSPI",
    sector: "자동차",
    marketCapRank: 236,
    asOf,
    events: [
      {
        kind: "news_mention",
        firstSeen: true,
        strength: 0.9,
        source: "뉴스",
        asOf,
        confidence: "H",
        label: "정부 호남 투자 예고",
        sourceTitle: "정부 대형투자 발표 예고에 금호타이어 등 호남 관련주 부각",
        sourceName: "한경비즈니스",
        headlineHook: "정부 호남 투자 예고에 관련주로 묶임",
        changePct: 11.9,
        direction: "up",
      },
      {
        kind: "theme_link",
        firstSeen: true,
        strength: 0.7,
        source: "FOMO 섹터맵",
        asOf,
        confidence: "M",
        label: "오늘 자동차 4개 종목 중 제일 셌어요.",
        changePct: 11.9,
        themeRank: 1,
        themePeerCount: 4,
        direction: "up",
      },
    ],
  };
}

describe("why-driven insight synthesis guard", () => {
  it("accepts concrete stock-perspective output and keeps source out of the headline", () => {
    const candidate = baseCandidate();
    const insight = validateWhyInsightOutput(
      {
        headline: "금호타이어 +11.9%, 정부 호남 투자 예고",
        observations: ["금호타이어 +11.9% / 자동차 1/4", "정부 호남 투자 예고에 관련주로 묶임"],
        synthesis: "기사 제목보다 정부 호남 투자 예고와 당일 +11.9% 반응을 분리해서 봅니다.",
        evidence: ["정부 대형투자 발표 예고에 금호타이어 등 호남 관련주 부각 · 한경비즈니스 · 2026-06-24"],
      },
      candidate
    );

    expect(insight?.headline).toBe("금호타이어 +11.9%, 정부 호남 투자 예고");
    expect(insight?.headline).not.toContain("한경비즈니스");
  });

  it("rejects abstract filler, advice, added numbers, and added proper nouns", () => {
    const candidate = baseCandidate();
    expect(validateWhyInsightOutput({ headline: "금호타이어에 동종 흐" + "름이 붙었어요" }, candidate)).toBeUndefined();
    expect(validateWhyInsightOutput({ headline: "금호타이어 지금 사" + "야 하는 자리" }, candidate)).toBeUndefined();
    expect(validateWhyInsightOutput({ headline: "금호타이어 +28%, 정부 호남 투자 예고" }, candidate)).toBeUndefined();
    expect(validateWhyInsightOutput({ headline: "엔비디아와 금호타이어가 정부 투자에 묶임" }, candidate)).toBeUndefined();
  });

  it("rejects English US headlines and accepts Korean concrete synthesis from English quarter text", () => {
    const candidate: DiscoveryCandidate = {
      ticker: "사운드하운드AI",
      market: "NASDAQ",
      country: "US",
      sector: "AI",
      asOf,
      events: [
        {
          kind: "news_mention",
          firstSeen: true,
          strength: 0.9,
          source: "news",
          asOf,
          confidence: "H",
          label: "SoundHound AI Reports First Quarter Revenue Growth and Raises Guidance",
          sourceTitle: "SoundHound AI Reports First Quarter Revenue Growth and Raises Guidance",
          sourceName: "Yahoo Finance",
          changePct: 3.2,
        },
      ],
    };

    expect(
      validateWhyInsightOutput(
        {
          headline: "SoundHound AI Reports First Quarter Revenue Growth and Raises Guidance",
          observations: ["SoundHound AI first quarter revenue growth"],
          synthesis: "First quarter revenue and guidance are both mentioned in the same article.",
          evidence: ["SoundHound AI Reports First Quarter Revenue Growth and Raises Guidance · Yahoo Finance · 2026-06-24"],
        },
        candidate
      )
    ).toBeUndefined();

    const insight = validateWhyInsightOutput(
      {
        headline: "1분기 매출 성장·가이던스 상향에 +3.2%",
        observations: ["1분기 매출 성장과 가이던스 상향", "+3.2%"],
        synthesis: "실적 재료와 당일 가격 반응을 나눠 확인하는 카드예요",
        evidence: ["SoundHound AI Reports First Quarter Revenue Growth and Raises Guidance · Yahoo Finance · 2026-06-24"],
      },
      candidate
    );

    expect(insight?.headline).toBe("1분기 매출 성장·가이던스 상향에 +3.2%");
  });

  it("keeps observations, synthesis, and evidence as separate blocks", () => {
    expect(blockOverlapRatio("금호타이어 +11.9% / 자동차 1/4", "금호타이어 +11.9% / 자동차 1/4")).toBe(1);
    expect(blockOverlapRatio("금호타이어 +11.9% / 자동차 1/4", "기사 제목보다 정부 호남 투자 예고를 먼저 봅니다")).toBeLessThan(0.7);
  });

  it("is deterministic without configured AI", async () => {
    const oldUrl = process.env["AI_API_URL"];
    const oldKey = process.env["AI_API_KEY"];
    delete process.env["AI_API_URL"];
    delete process.env["AI_API_KEY"];
    try {
      const candidate = baseCandidate();
      const first = await synthesizeWhyDrivenInsight(candidate);
      const second = await synthesizeWhyDrivenInsight(candidate);
      expect(first).toEqual(second);
      expect(first.method).toBe("fallback");
      expect(first.insight.headline).toContain("대규모 투자");
      expect(first.insight.headline).toContain("+12%");
      expect(first.insight.headline).not.toContain("한경비즈니스");
    } finally {
      if (oldUrl !== undefined) process.env["AI_API_URL"] = oldUrl;
      if (oldKey !== undefined) process.env["AI_API_KEY"] = oldKey;
    }
  });
});
