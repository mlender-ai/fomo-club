import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync(new URL("../components/StockSwipeDeck.tsx", import.meta.url), "utf8");
const depth = readFileSync(new URL("../components/KeywordDepthPage.tsx", import.meta.url), "utf8");

describe("메인 카드 후킹 구조", () => {
  it("실제 30거래일 스파크라인과 신호 칩, 후킹 한 줄을 함께 렌더한다", () => {
    expect(card).toContain("<Sparkline series={sparkline.slice(-30)}");
    expect(card).toContain("hookCopy.chips.map");
    expect(card).toContain("왜 봐야 하나");
  });

  it("점수는 점수대 사후 성과나 축적 상태와 함께만 노출한다", () => {
    expect(card).toContain("이 점수대 역대 30일 승률");
    expect(card).toContain("이 점수대 성과 축적 중");
    expect(card).toContain("가용 분석축이 3개 미만이라 점수를 내지 않았어요");
    expect(card).toContain("scoreTrack={scoreTrackFor(e)}");
  });
});

describe("뎁스 쉬운말 레이어", () => {
  it("실제 분석에 등장한 용어만 설명 칩과 탭 툴팁으로 제공한다", () => {
    expect(depth).toContain("termKeysForAnalysis");
    expect(depth).toContain('aria-label="차트 용어 쉬운 설명"');
    expect(depth).toContain("term.explanation");
    expect(depth).toContain('easyMarketCopy(event.label, "detail")');
  });
});
