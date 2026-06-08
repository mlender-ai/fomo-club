import { describe, it, expect } from "vitest";
import {
  parseNaverBoard,
  classifyKoreanTitle,
  KR_BULLISH,
  KR_BEARISH,
} from "../src/index-engine/naverFetcher";

describe("classifyKoreanTitle", () => {
  it("강세 키워드 → bull", () => {
    expect(classifyKoreanTitle("내일 삼전 가즈아 풀매수")).toBe("bull");
    expect(classifyKoreanTitle("존버 간다")).toBe("bull");
  });
  it("약세 키워드 → bear", () => {
    expect(classifyKoreanTitle("손절했다 폭락 한강간다")).toBe("bear");
  });
  it("둘 다/없음 → neutral", () => {
    expect(classifyKoreanTitle("오늘 거래량 어떤가요")).toBe("neutral");
    expect(classifyKoreanTitle("매수했는데 손절각")).toBe("neutral"); // bull+bear
  });
  it("키워드 세트 비어있지 않음", () => {
    expect(KR_BULLISH.length).toBeGreaterThan(5);
    expect(KR_BEARISH.length).toBeGreaterThan(5);
  });
});

// 네이버 종토 마크업 모사 픽스처 (board_read 앵커 title + 날짜 셀)
function fixture(posts: { title: string; date: string }[]): string {
  const rows = posts
    .map(
      (p) =>
        `<td class="title"><a href="/item/board_read.naver?code=005930&nid=1&page=1" title="${p.title}">${p.title}</a></td>` +
        `<td class="tah p10 gray03">${p.date}</td>`,
    )
    .join("\n");
  return `<html><body><table>${rows}</table></body></html>`;
}

describe("parseNaverBoard", () => {
  const NOW = Date.parse("2026-06-08T18:00:00+09:00");

  it("24h 내 게시물만 집계 + bullishRatio 산출", () => {
    const html = fixture([
      { title: "삼전 가즈아 풀매수", date: "2026.06.08 17:50" }, // bull, 24h내
      { title: "손절 폭락 한강", date: "2026.06.08 17:40" }, // bear, 24h내
      { title: "가즈아 떡상 기대", date: "2026.06.08 17:30" }, // bull, 24h내
      { title: "어제 글 가즈아", date: "2026.06.06 10:00" }, // 24h 밖 → 제외
    ]);
    const sig = parseNaverBoard(html, "005930", NOW);
    expect(sig).not.toBeNull();
    expect(sig!.source).toBe("naver/005930");
    expect(sig!.postCount).toBe(3); // 어제 글 제외
    // bull 2, bear 1 → 2/3
    expect(sig!.bullishRatio).toBeCloseTo(2 / 3, 5);
  });

  it("감성 표명 글 없으면 중립 0.5", () => {
    const html = fixture([{ title: "오늘 거래량 질문", date: "2026.06.08 17:00" }]);
    expect(parseNaverBoard(html, "005930", NOW)!.bullishRatio).toBe(0.5);
  });

  it("게시물 없으면 null", () => {
    expect(parseNaverBoard("<html>no posts</html>", "005930", NOW)).toBeNull();
  });

  it("날짜 개수 불일치 시 전체 사용(보수적, 크래시 없음)", () => {
    const html =
      `<a href="board_read.naver?code=005930&nid=1" title="가즈아">가즈아</a>` +
      `<a href="board_read.naver?code=005930&nid=2" title="손절">손절</a>`; // 날짜 셀 없음
    const sig = parseNaverBoard(html, "005930", NOW);
    expect(sig!.postCount).toBe(2);
  });
});
