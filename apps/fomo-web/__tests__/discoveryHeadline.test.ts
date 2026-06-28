import { describe, expect, it } from "vitest";
import { compactDiscoveryCardHeadline, splitDiscoveryReason } from "../lib/discoveryHeadline";

describe("compactDiscoveryCardHeadline", () => {
  const bannedSurfaceCopy =
    /혼자\s*튄|무명주|흐름\s+흐름|흐름\s*안에서|먼저\s*반응|눈에\s*띄|원문\s*근거|보는\s*종목|움직였어요|강하게\s*움직|상위권으로\s*움직|더\s*강하게\s*움직/;

  it("turns material detail into one card-front sentence instead of a label plus prose", () => {
    const headline = compactDiscoveryCardHeadline({
      reason: "뉴스 재료 붙은 종목 — 최근 '해외 수주 2배' 마키나락스...장중 20% 가까이 급등 · 뉴시스. 동종 흐름도 같이 확인돼요.",
      sector: "AI",
      ticker: "마키나락스",
      marketCapRank: 236,
    });

    expect(headline).toContain("해외 수주 2배");
    expect(headline).toContain("마키나락스");
    expect(headline).not.toMatch(bannedSurfaceCopy);
  });

  it("keeps obscure theme leaders honest in one sentence", () => {
    const headline =
      compactDiscoveryCardHeadline({
        reason: "혼자 튄 무명주 — 시총 411위권인데 같은 화장품 종목들 중 오늘 제일 셌어요. 뒤를 받칠 수급·거래·뉴스는 아직 안 보여요.",
        sector: "화장품",
        ticker: "한국화장품제조",
      }) ?? "";

    expect(headline).toBe("같은 화장품 종목들 중 오늘 변동성이 가장 컸어요");
    expect(headline).not.toMatch(bannedSurfaceCopy);
  });

  it("does not expose market-cap rank or peer-rank shorthand on the card front", () => {
    const headline = compactDiscoveryCardHeadline({
      reason: "혼자 튄 무명주 — 시총 420위권인데 같은 전기차 종목들 중 오늘 제일 셌어요. 뒤를 받칠 수급·거래·뉴스는 아직 안 보여요.",
      sector: "전기차",
      ticker: "루시드",
      marketCapRank: 420,
    });

    expect(headline).toBe("같은 전기차 종목들 중 오늘 변동성이 가장 컸어요");
    expect(headline).not.toMatch(/시총|\d+\/\d+|[+-]\d/);
    expect(headline).not.toMatch(bannedSurfaceCopy);
  });

  it("does not expose the split reason as a second line contract", () => {
    const parts = splitDiscoveryReason("뉴스 재료 붙은 종목 — 오늘 공급계약 공시 · 한국경제.");

    expect(parts.state).toBe("뉴스 재료 붙은 종목");
    expect(compactDiscoveryCardHeadline({ reason: `${parts.state} — ${parts.detail}` })).toContain("공급계약");
  });
});
