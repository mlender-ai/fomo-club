import { describe, expect, it } from "vitest";
import type { CardVerdict, RawArticle } from "@fomo/core";
import {
  buildCoinCause,
  buildCoinMaterialCache,
  classifyCoinDirection,
  classifyCoinIssue,
  composeCoinVerdict,
  issuesForSymbol,
  matchCoinSymbols,
} from "../../lib/coin-materials";

const NOW = new Date("2026-07-18T00:00:00.000Z");

function article(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    id: "issue-1",
    title: "비트코인 현물 ETF 5일 연속 순유입",
    summary: "기관 자금 흐름이 집계됐다.",
    url: "https://example.com/issue-1",
    source: "토큰포스트",
    publishedAt: "2026-07-17T12:00:00.000Z",
    lang: "ko",
    ...overrides,
  };
}

describe("coin material matching", () => {
  it("상위 코인 alias를 경계 기준으로 매칭하고 짧은 영문 부분문자는 제외", () => {
    expect(matchCoinSymbols("비트코인과 ETH, 솔라나 수급")).toEqual(["BTC", "ETH", "SOL"]);
    expect(matchCoinSymbols("solution protocol update")).not.toContain("SOL");
    expect(matchCoinSymbols("비트코인캐시 BCH 네트워크 업그레이드")).toEqual(["BCH"]);
    expect(matchCoinSymbols("이더리움클래식 하드포크")).toEqual(["ETC"]);
  });

  it("코인 전용 문법으로 이슈 유형과 명시 방향만 분류", () => {
    expect(classifyCoinIssue("CLARITY 법안 하원 통과")).toBe("regulation");
    expect(classifyCoinIssue("이더리움 펙트라 업그레이드 완료")).toBe("network");
    expect(classifyCoinIssue("비트코인 6만3000달러대 회복")).toBeNull();
    expect(classifyCoinDirection("비트코인 ETF 순유출")).toBe("negative");
    expect(classifyCoinDirection("CLARITY 법안 통과 기대")).toBe("neutral");
  });

  it("코인별 이슈와 시장 공통 규제 이슈를 캐시하되 일반 가격 기사는 제외", () => {
    const cache = buildCoinMaterialCache([
      article(),
      article({
        id: "issue-2",
        title: "가상자산 CLARITY 법안 상원 논의",
        url: "https://example.com/issue-2",
        publishedAt: "2026-07-17T10:00:00.000Z",
      }),
      article({
        id: "noise",
        title: "비트코인 하루 2% 상승",
        summary: "가격 변동을 전했다.",
        url: "https://example.com/noise",
      }),
      article({
        id: "digest",
        title: "[자정 뉴스브리핑] 오늘 주요 소식 外",
        summary: "비트코인 ETF와 SEC 소식을 종합했다.",
        url: "https://example.com/digest",
      }),
      article({
        id: "summary-alias",
        title: "로빈후드 체인 거래량 증가",
        summary: "이더리움과 금리도 함께 언급됐다.",
        url: "https://example.com/summary-alias",
      }),
    ], NOW);

    const btc = issuesForSymbol(cache, "BTC");
    expect(btc).toHaveLength(2);
    expect(btc[0]?.scope).toBe("coin");
    expect(btc[1]?.scope).toBe("market");
    expect(btc.some((issue) => issue.id === "noise")).toBe(false);
    expect(btc.some((issue) => issue.id === "digest")).toBe(false);
    expect(cache.bySymbol.ETH?.some((issue) => issue.id === "summary-alias") ?? false).toBe(false);
  });

  it("가격과 기사 시각은 48시간 동시성으로만 연결하고 인과를 단정하지 않음", () => {
    const issue = buildCoinMaterialCache([article()], NOW).bySymbol.BTC!;
    const cause = buildCoinCause({ changePct: 4.2, fetchedAt: "2026-07-18T00:00:00.000Z" }, issue);
    expect(cause?.relation).toBe("same-window");
    expect(cause?.text).toContain("같은 48시간에 보도");
    expect(cause?.text).not.toMatch(/때문|영향으로|덕분/);
  });

  it("verdict는 실제 이슈와 기존 차트 판단을 함께 남겨 코인별 문구가 달라짐", () => {
    const base: CardVerdict = {
      stance: "watch",
      stanceText: "20일선 회복 확인이 더 필요해요.",
      evidence: ["종가가 20일선 아래"],
      confidence: "medium",
    };
    const issues = buildCoinMaterialCache([article()], NOW).bySymbol.BTC!;
    const verdict = composeCoinVerdict(base, issues);
    expect(verdict.stance).toBe("watch");
    expect(verdict.stanceText).toContain("현물 ETF 5일 연속 순유입");
    expect(verdict.stanceText).toContain(base.stanceText);
  });
});
