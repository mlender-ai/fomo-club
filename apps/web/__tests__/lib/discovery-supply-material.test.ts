import { describe, expect, it } from "vitest";
import type { DiscoveryCandidate, DiscoveryEventKind } from "@fomo/core";

import {
  cleanMaterialTitle,
  cleanUsMaterialTitle,
  formatSectorMarketContextLabel,
  formatThemeDiscoveryLabel,
  recoverDiscoveryCandidates,
} from "../../lib/discovery-supply";

const asOf = "2026-06-27";

function candidate(
  ticker: string,
  kind: DiscoveryEventKind,
  strength: number,
  opts: { rank?: number; direction?: "up" | "down" | "flat"; label?: string } = {}
): DiscoveryCandidate {
  return {
    ticker,
    market: "KOSPI",
    asOf,
    ...(typeof opts.rank === "number" ? { marketCapRank: opts.rank } : {}),
    events: [
      {
        kind,
        firstSeen: true,
        strength,
        source: "테스트",
        asOf,
        confidence: "M",
        direction: opts.direction ?? "up",
        label: opts.label ?? `${ticker} 맥락`,
      },
    ],
  };
}

describe("discovery material news filter", () => {
  it("keeps concrete catalyst headlines for card hooks", () => {
    expect(cleanMaterialTitle("아이씨티케이, 120억원 규모 공급계약 공시")).toBe("아이씨티케이, 120억원 규모 공급계약 공시");
    expect(cleanMaterialTitle("코아스템켐온, 신약 임상 2상 승인")).toBe("코아스템켐온, 신약 임상 2상 승인");
    expect(cleanMaterialTitle("삼현, 방산 부품 수주잔고 확대")).toBe("삼현, 방산 부품 수주잔고 확대");
    expect(cleanMaterialTitle("'삼전닉스 호남 반도체 클러스터' 소식에 광주신세계 부각")).toBe(
      "'삼전닉스 호남 반도체 클러스터' 소식에 광주신세계 부각"
    );
    expect(cleanMaterialTitle("호남 반도체 클러스터 관련주로 광주신세계 주목")).toBe(
      "호남 반도체 클러스터 관련주로 광주신세계 주목"
    );
  });

  it("rejects non-material human-interest and market-wrap headlines", () => {
    expect(cleanMaterialTitle("현대차 회장, 어려울 때마다 이순신 장군 찾았다")).toBeUndefined();
    expect(cleanMaterialTitle("로켓헬스케어 CEO 인터뷰, 창업 철학 공개")).toBeUndefined();
    expect(cleanMaterialTitle("오늘의 증시, 코스피 장중 약세")).toBeUndefined();
    expect(cleanMaterialTitle("ESG 캠페인으로 지역사회 봉사 확대")).toBeUndefined();
  });

  it("does not treat generic stock movement as material news", () => {
    expect(cleanMaterialTitle("특징주 모음, 2차전지주 동반 상승")).toBeUndefined();
    expect(cleanMaterialTitle("장중 시황, 반도체주 차익 실현")).toBeUndefined();
  });

  it("turns concrete US catalyst titles into material hooks instead of generic foreign-news labels", () => {
    expect(cleanUsMaterialTitle("SoundHound AI Reports First Quarter Revenue Growth and Raises Guidance")).toBe(
      "SoundHound AI, 실적·가이던스 소식이 나왔어요."
    );
    expect(cleanUsMaterialTitle("D-Wave Quantum Announces New Partnership With Aerospace Customer")).toBe(
      "D-Wave Quantum, 고객·파트너십 소식이 나왔어요."
    );
    expect(cleanUsMaterialTitle("Analyst raises price target on Micron shares")).toBeUndefined();
    expect(cleanUsMaterialTitle("D-Wave Quantum (QBTS) Is Down 11.3% After U.S. Quantum Orders And Funding News")).toBeUndefined();
    expect(cleanUsMaterialTitle("SoundHound AI vs. C3.ai: Which AI Stock Is the Better Buy Now")).toBeUndefined();
    expect(cleanUsMaterialTitle("3 Unprofitable Stocks We Approach with Caution")).toBeUndefined();
    expect(cleanUsMaterialTitle("Upstart Holdings, Inc. (UPST) Gains As Market Dips: What You Should Know")).toBeUndefined();
    expect(cleanUsMaterialTitle("Snowflake (SNOW) Down 5.1% Since Last Earnings Report: Can It Rebound")).toBeUndefined();
    expect(cleanUsMaterialTitle("The Market Rotation Is On. ServiceNow, Workday, and AppLovin Rise")).toBeUndefined();
    expect(cleanUsMaterialTitle("The $7 Trillion AI Boom Is Running Out of Power")).toBeUndefined();
    expect(cleanUsMaterialTitle("OpenAI IPO Fears Hit Oracle and Other Stocks Exposed to the AI Trade")).toBeUndefined();
    expect(cleanUsMaterialTitle("Moderna, Nvidia, Sandisk, Palantir, ON Semi, and More Stocks That Moved Today")).toBeUndefined();
  });
});

describe("discovery specific hook copy", () => {
  const surfacePricePattern = /(?:가격|[+-]\d+(?:\.\d+)?%|\d+(?:\.\d+)?포인트|섹터 평균|평균보다)/;

  it("keeps same-sector leaders specific instead of collapsing to one generic sentence", () => {
    const hpsp = formatThemeDiscoveryLabel({
      sector: "반도체",
      rank: 1,
      peerCount: 14,
      averageChangePct: 1.5,
      relativeChangePct: 1.83,
      changePct: 3.33,
    });
    const wonik = formatThemeDiscoveryLabel({
      sector: "반도체",
      rank: 2,
      peerCount: 14,
      averageChangePct: 1.5,
      relativeChangePct: 4.38,
      changePct: 5.88,
    });
    const outperformer = formatThemeDiscoveryLabel({
      sector: "반도체",
      rank: 6,
      peerCount: 14,
      averageChangePct: 1.5,
      relativeChangePct: 1.68,
      changePct: 3.18,
    });

    expect(hpsp).toBe("오늘 반도체 14개 종목 중 가장 먼저 눈에 띄었어요.");
    expect(wonik).toBe("오늘 반도체 14개 종목 중 두 번째로 눈에 띄었어요.");
    expect(outperformer).toBe("반도체 안에서 주변 종목보다 먼저 눈에 들어왔어요.");
    expect(new Set([hpsp, wonik, outperformer]).size).toBe(3);
    expect([hpsp, wonik, outperformer].some((text) => /신호가|흐름에서 (?:먼저|같이) 확인/.test(text))).toBe(false);
    expect([hpsp, wonik, outperformer].every((text) => !surfacePricePattern.test(text))).toBe(true);
  });

  it("keeps sector-only movers contextual instead of generic or raw price-only copy", () => {
    const spike = formatSectorMarketContextLabel({
      sector: "건설",
      rankText: "시총 461위권",
      changePct: 30,
      change: "+30.00%",
    });
    const ordinary = formatSectorMarketContextLabel({
      sector: "화장품",
      rankText: "시총 210위권",
      changePct: 4.2,
      change: "+4.20%",
    });

    expect(spike).toBe("건설 안에서 시총 461위권 종목이 새로 눈에 들어왔어요.");
    expect(ordinary).toBe("화장품 안에서 시총 210위권 종목도 함께 눈에 들어왔어요.");
    expect([spike, ordinary].some((text) => /흐름에서 (?:먼저|같이|새로) 확인/.test(text))).toBe(false);
    expect([spike, ordinary].some((text) => /신호가/.test(text))).toBe(false);
    expect([spike, ordinary].every((text) => !surfacePricePattern.test(text))).toBe(true);
  });
});

describe("discovery empty-deck recovery", () => {
  it("fills an empty material deck with honest contextual candidates instead of returning zero cards", () => {
    const recovered = recoverDiscoveryCandidates(
      [],
      [
        candidate("대형주", "theme_link", 0.95, { rank: 1, label: "반도체 흐름에서 확인해요." }),
        candidate("가격상승", "price_move", 0.99, { rank: 210, direction: "up", label: "오늘 가격이 +12.00% 움직였어요." }),
        candidate("하락주", "price_move", 0.99, { rank: 220, direction: "down", label: "오늘 가격이 -12.00% 움직였어요." }),
        candidate("발굴A", "theme_link", 0.6, { rank: 180, label: "AI 흐름에서 같이 확인해요." }),
        candidate("발굴B", "market_context", 0.7, { rank: 260, label: "시총 260위권에서 움직였어요." }),
      ],
      3
    );

    expect(recovered.map((row) => row.ticker)).toEqual(["발굴A", "발굴B", "대형주"]);
    expect(recovered.map((row) => row.ticker)).not.toContain("가격상승");
    expect(recovered.map((row) => row.ticker)).not.toContain("하락주");
    expect(recovered.every((row) => row.reason && row.reason.length > 0)).toBe(true);
    expect(recovered.every((row) => !/^오늘 가격이/.test(row.reason ?? ""))).toBe(true);
  });

  it("leaves a healthy material deck unchanged", () => {
    const ranked = Array.from({ length: 12 }, (_, index) =>
      candidate(`재료${index}`, "news_mention", 0.7, { rank: 170 + index, label: `공급계약 ${index}` })
    );

    expect(recoverDiscoveryCandidates(ranked, [candidate("보조", "theme_link", 0.9)], 50)).toEqual(ranked);
  });
});
