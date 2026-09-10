import { describe, expect, it } from "vitest";
import {
  buildDeck,
  fomoCommentFallback,
  parseFomoComments,
  seriesIsUp,
  sparklinePath,
  type ChartCard,
  type ScoredArticle,
} from "../src";

function art(id: string, score = 50): ScoredArticle {
  return {
    id,
    title: `기사 ${id}`,
    url: `https://x.com/${id}`,
    source: "연합뉴스",
    publishedAt: "2026-06-12T12:00:00Z",
    lang: "ko",
    fomoScore: score,
    scoreReason: "",
  };
}

const chart: ChartCard = { key: "kospi", label: "코스피", value: 8000, changePct: 1.2 };

describe("buildDeck", () => {
  it("chartEvery 장마다 차트 1장 삽입(끝 제외)", () => {
    const arts = Array.from({ length: 12 }, (_, i) => art(String(i)));
    const deck = buildDeck(arts, [chart], { chartEvery: 5 });
    const kinds = deck.map((d) => d.kind);
    // 5번째, 10번째 뒤에 차트(끝 직전이 아니면)
    expect(kinds.filter((k) => k === "chart").length).toBe(2);
    expect(deck[5]!.kind).toBe("chart");
  });

  it("차트 없으면 뉴스만", () => {
    const deck = buildDeck([art("a"), art("b")], [], { chartEvery: 1 });
    expect(deck.every((d) => d.kind === "news")).toBe(true);
  });

  it("뉴스 0이면 차트만 뒤에 붙음(빈 화면 방지)", () => {
    const deck = buildDeck([], [chart], {});
    expect(deck).toHaveLength(1);
    expect(deck[0]!.kind).toBe("chart");
  });

  it("마지막 뉴스 뒤에는 차트를 넣지 않는다", () => {
    const arts = Array.from({ length: 5 }, (_, i) => art(String(i)));
    const deck = buildDeck(arts, [chart], { chartEvery: 5 });
    expect(deck[deck.length - 1]!.kind).toBe("news");
  });
});

describe("fomoCommentFallback", () => {
  const BANNED = /매수|매도|사세요|급등 예상|확실|보장/;
  it("구간별 코멘트, 결정적(같은 입력 같은 출력), 금칙어 없음", () => {
    for (const s of [10, 30, 50, 70, 90]) {
      const c1 = fomoCommentFallback({ title: "엔비디아 신고가", fomoScore: s });
      const c2 = fomoCommentFallback({ title: "엔비디아 신고가", fomoScore: s });
      expect(c1).toBe(c2);
      expect(c1.length).toBeGreaterThan(0);
      expect(c1).not.toMatch(BANNED);
    }
  });
});

describe("sparklinePath / seriesIsUp", () => {
  it("2점 이상이면 line/area path 생성", () => {
    const p = sparklinePath([1, 2, 3, 2, 4], 100, 40);
    expect(p).not.toBeNull();
    expect(p!.line.startsWith("M")).toBe(true);
    expect(p!.area.endsWith("Z")).toBe(true);
  });
  it("2점 미만이면 null", () => {
    expect(sparklinePath([5], 100, 40)).toBeNull();
    expect(sparklinePath([], 100, 40)).toBeNull();
  });
  it("추세 방향", () => {
    expect(seriesIsUp([1, 5])).toBe(true);
    expect(seriesIsUp([5, 1])).toBe(false);
  });
});

describe("parseFomoComments", () => {
  it("코드펜스 섞여도 추출", () => {
    const c = parseFomoComments('아\n```json\n[{"id":"a","comment":"다들 난리야"}]\n```');
    expect(c).toEqual([{ id: "a", comment: "다들 난리야" }]);
  });
  it("깨진 응답 → 빈 배열", () => {
    expect(parseFomoComments("없음")).toEqual([]);
  });
});
