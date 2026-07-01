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
    const priceEvent: DiscoveryEvent = {
      kind: "price_move",
      firstSeen: true,
      strength: 0.5,
      source: "market",
      asOf: "2026-06-29",
      confidence: "M",
      changePct: 3.3,
    };

    const result = await resolveCardHeadline({
      candidate: {
        ...candidate([event, priceEvent]),
        dominantAxis: "price",
      },
      synthesis: synthesis({
        headline: title,
        tone: "material",
        primary: event,
      }),
      sourceLabel: `${title} · 뉴시스`,
    });

    expect(result.text).not.toBe(title);
    expect(result.provenance).toBe("rule");
    expect(result.text).toBe("대규모 투자에 +3.3%");
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
      changePct: 8.4,
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

    expect(result.text).toBe("항공우주 고객과 제휴 발표에 +8.4%");
    expect(result.text).not.toContain("D-Wave");
    expect(result.text).not.toContain("Aerospace");
    expect(result.provenance).toBe("rule");
  });

  it("allows concrete material-axis US headlines instead of suppressing them", async () => {
    const title = "ScanSource Announces Expansion of HPE Networking Partnership to Include HPE Juniper Networking";
    const event: DiscoveryEvent = {
      ...baseEvent,
      label: title,
      sourceTitle: title,
      sourceName: "Yahoo Finance",
      sourceUrl: "https://example.com/hpe",
      changePct: 1.57,
      strength: 0.88,
    };
    const usCandidate: DiscoveryCandidate = {
      ticker: "HPE",
      market: "NYSE",
      country: "US",
      sector: "클라우드",
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

    expect(result.text).toBe("스캔소스 주니퍼 네트워킹 파트너십 확대에 +1.6%");
    expect(result.axis).toBe("material");
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
