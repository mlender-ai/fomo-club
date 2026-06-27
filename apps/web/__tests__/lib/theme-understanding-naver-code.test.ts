import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchNaverStockNews: vi.fn(),
  fetchNaverCompanyResearch: vi.fn(),
  fetchAllNews: vi.fn(),
  fetchDcStockTitles: vi.fn(),
  fetchNaverBoardPosts: vi.fn(),
  fetchSubredditPosts: vi.fn(),
  fetchDartDisclosuresForCode: vi.fn(),
}));

vi.mock("../../lib/fomo-news-sources", () => ({
  fetchNaverStockNews: mocks.fetchNaverStockNews,
  fetchNaverCompanyResearch: mocks.fetchNaverCompanyResearch,
  fetchAllNews: mocks.fetchAllNews,
}));

vi.mock("../../lib/dcinside", () => ({
  fetchDcStockTitles: mocks.fetchDcStockTitles,
}));

vi.mock("../../lib/dart-disclosures", () => ({
  fetchDartDisclosuresForCode: mocks.fetchDartDisclosuresForCode,
}));

vi.mock("@fomo/core", async (importActual) => {
  const actual = await importActual<typeof import("@fomo/core")>();
  return {
    ...actual,
    fetchNaverBoardPosts: mocks.fetchNaverBoardPosts,
    fetchSubredditPosts: mocks.fetchSubredditPosts,
  };
});

describe("collectStockDocs naverCode threading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchNaverStockNews.mockResolvedValue([
      {
        title: "테스트무명 공급계약 공시가 나왔어요",
        summary: "테스트무명 관련 계약 소식",
        source: "테스트뉴스",
        publishedAt: "2026-06-27T00:00:00.000Z",
        tier: "news-mid",
      },
    ]);
    mocks.fetchNaverCompanyResearch.mockResolvedValue([
      {
        title: "테스트무명 리서치 코멘트",
        summary: "테스트무명 종목 리포트",
        source: "테스트증권 리서치",
        publishedAt: "2026-06-27T00:00:00.000Z",
        tier: "news-mid",
      },
    ]);
    mocks.fetchDartDisclosuresForCode.mockResolvedValue([
      {
        ticker: "테스트무명",
        label: "단일판매ㆍ공급계약체결",
        source: "DART 공시",
        asOf: "2026-06-27",
      },
    ]);
    mocks.fetchNaverBoardPosts.mockResolvedValue([{ title: "테스트무명 오늘 거래량 보네", tsMs: 1_782_486_000_000 }]);
    mocks.fetchAllNews.mockResolvedValue([]);
    mocks.fetchDcStockTitles.mockResolvedValue([]);
    mocks.fetchSubredditPosts.mockResolvedValue([]);
  });

  it("uses supplied naverCode for per-ticker sources even when the stock is not in STOCK_VOCAB", async () => {
    const { collectStockDocs } = await import("../../lib/theme-understanding");

    const docs = await collectStockDocs("테스트무명", { naverCode: "123456", country: "KR" });

    expect(mocks.fetchNaverStockNews).toHaveBeenCalledWith("123456", expect.any(Number));
    expect(mocks.fetchNaverCompanyResearch).toHaveBeenCalledWith("123456", "테스트무명", 6);
    expect(mocks.fetchNaverBoardPosts).toHaveBeenCalledWith("123456");
    expect(mocks.fetchDartDisclosuresForCode).toHaveBeenCalledWith("123456", "테스트무명", expect.any(String));
    expect(docs.some((doc) => doc.kind === "news" && doc.title.includes("공급계약"))).toBe(true);
    expect(docs.some((doc) => doc.kind === "community" && doc.source === "네이버 종토방 테스트무명")).toBe(true);
    expect(docs.some((doc) => doc.kind === "official" && doc.source === "DART 공시")).toBe(true);
  });
});

