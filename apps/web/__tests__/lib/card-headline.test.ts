import { describe, expect, it } from "vitest";
import { resolveCardHeadline } from "../../lib/card-headline";
import type {
  DiscoveryCandidate,
  DiscoveryEvent,
  DiscoveryInsightSynthesis,
} from "@fomo/core";

const baseEvent: DiscoveryEvent = {
  kind: "news_mention",
  firstSeen: true,
  strength: 0.9,
  source: "news",
  asOf: "2026-06-29",
  confidence: "H",
};

function candidate(events: DiscoveryEvent[]): DiscoveryCandidate {
  return {
    ticker: "롯데손해보험",
    market: "KOSPI",
    country: "KR",
    sector: "금융",
    events,
    asOf: "2026-06-29",
  };
}

function synthesis(overrides: Partial<DiscoveryInsightSynthesis>): DiscoveryInsightSynthesis {
  return {
    headline: "아직 공개된 계기 없음",
    headlineState: "조용",
    tag: "정직 폴백",
    tone: "empty",
    observations: [],
    synthesis: "",
    evidence: [],
    ...overrides,
  };
}

describe("resolveCardHeadline", () => {
  it("does not pass raw article titles through as the surface headline", async () => {
    const title = "롯데손보 8월 매물 나온다…한국투자·신한 인수전 뛰어드나";
    const event: DiscoveryEvent = {
      ...baseEvent,
      label: title,
      sourceTitle: title,
      sourceName: "뉴시스",
      sourceUrl: "https://example.com/news",
    };

    const result = await resolveCardHeadline({
      candidate: candidate([event]),
      synthesis: synthesis({
        headline: title,
        tone: "material",
        primary: event,
      }),
      sourceLabel: `${title} · 뉴시스`,
    });

    expect(result.text).not.toBe(title);
    expect(result.provenance).toBe("rule");
    expect(result.text).toBe("한국투자·신한 인수전 참여");
    expect(result.eventRef).toMatchObject({
      kind: "news_mention",
      source: "뉴시스",
      asOf: "2026-06-29",
      title,
      url: "https://example.com/news",
    });
  });

  it("returns the same headline for the same input", async () => {
    const event: DiscoveryEvent = {
      ...baseEvent,
      label: "공급계약 공시와 거래 증가가 같이 확인됐어요.",
      sourceTitle: "티이엠씨씨엔에스, 180억원 반도체 장비 공급계약 체결",
      sourceName: "DART",
    };
    const input = {
      candidate: candidate([event]),
      synthesis: synthesis({
        headline: "180억원 반도체 장비 공급계약 체결",
        tone: "material",
        primary: event,
      }),
      synthesisMethod: "ai" as const,
      sourceLabel: "티이엠씨씨엔에스, 180억원 반도체 장비 공급계약 체결 · DART",
    };

    const outputs = await Promise.all(Array.from({ length: 10 }, async () => (await resolveCardHeadline(input)).text));

    expect(new Set(outputs).size).toBe(1);
    expect(outputs[0]).toBe("180억원 반도체 장비 공급계약 체결");
  });

  it("marks empty candidates as suppressed instead of inventing a headline", async () => {
    const result = await resolveCardHeadline({
      candidate: candidate([]),
      synthesis: synthesis({}),
    });

    expect(result).toMatchObject({
      text: "",
      provenance: "suppressed",
      method: "none",
    });
  });

  it("does not let English US source titles reach the card surface", async () => {
    const title = "D-Wave Quantum Announces New Partnership With Aerospace Customer";
    const event: DiscoveryEvent = {
      ...baseEvent,
      label: title,
      sourceTitle: title,
      sourceName: "Yahoo Finance",
      sourceUrl: "https://example.com/dwave",
    };
    const usCandidate: DiscoveryCandidate = {
      ticker: "디웨이브퀀텀",
      market: "NYSE",
      country: "US",
      sector: "양자",
      events: [event],
      asOf: "2026-06-29",
    };

    const result = await resolveCardHeadline({
      candidate: usCandidate,
      synthesis: synthesis({
        headline: title,
        tone: "material",
        primary: event,
      }),
      synthesisMethod: "ai",
      sourceLabel: `${title} · Yahoo Finance`,
    });

    expect(result.text).toBe("Aerospace 고객과 제휴 발표");
    expect(result.text).not.toContain("D-Wave");
    expect(result.provenance).toBe("rule");
  });

  it("suppresses strong US non-material moves instead of filling the deck", async () => {
    const event: DiscoveryEvent = {
      kind: "price_move",
      firstSeen: true,
      strength: 0.8,
      source: "market",
      asOf: "2026-06-29",
      confidence: "M",
      changePct: 12.4,
    };
    const usCandidate: DiscoveryCandidate = {
      ticker: "루시드",
      market: "NASDAQ",
      country: "US",
      sector: "전기차",
      events: [event],
      asOf: "2026-06-29",
    };

    const result = await resolveCardHeadline({
      candidate: usCandidate,
      synthesis: synthesis({ primary: event }),
    });

    expect(result).toMatchObject({
      text: "",
      provenance: "suppressed",
      method: "none",
    });
  });

  it("suppresses weak US non-material moves instead of filling the deck", async () => {
    const event: DiscoveryEvent = {
      kind: "price_move",
      firstSeen: false,
      strength: 0.25,
      source: "market",
      asOf: "2026-06-29",
      confidence: "L",
      changePct: 3.2,
    };
    const usCandidate: DiscoveryCandidate = {
      ticker: "몽고DB",
      market: "NASDAQ",
      country: "US",
      sector: "클라우드",
      events: [event],
      asOf: "2026-06-29",
    };

    const result = await resolveCardHeadline({
      candidate: usCandidate,
      synthesis: synthesis({ primary: event }),
    });

    expect(result).toMatchObject({
      text: "",
      provenance: "suppressed",
      method: "none",
    });
  });
});
