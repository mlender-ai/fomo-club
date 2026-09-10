import { describe, expect, it } from "vitest";
import { MOCK_STOCK_CARDS } from "../src";

// §0 절대 규칙 가드 — 전문용어/거래부추김/예측 단정 금지.
const BANNED =
  /가이던스|EPS|어닝|펀더멘탈|시가총액|매수|매도|롱\b|숏\b|사세요|파세요|사라\b|팔아라|오를 거|오를거|급등 예상|확실히 오/;

// 균형추 — 들뜬(상승 큰) 종목엔 조심, 조용/하락엔 안심. 둘 중 하나의 결을 담아야.
const BALANCE = /조심|급하지|안 급|천천히|휩쓸|늦춰|마음 졸이지|한 박자/;

function allText(): string {
  return MOCK_STOCK_CARDS.map(
    (c) => `${c.comment} ${c.depth.why} ${c.depth.learn}`
  ).join("\n");
}

describe("MOCK_STOCK_CARDS", () => {
  it("5~10장, 필수 필드 채워짐", () => {
    expect(MOCK_STOCK_CARDS.length).toBeGreaterThanOrEqual(5);
    expect(MOCK_STOCK_CARDS.length).toBeLessThanOrEqual(10);
    for (const c of MOCK_STOCK_CARDS) {
      expect(c.name).toBeTruthy();
      expect(c.ticker).toBeTruthy();
      expect(c.priceText).toBeTruthy();
      expect(c.comment.length).toBeGreaterThan(10);
      expect(c.depth.why.length).toBeGreaterThan(10);
      expect(c.depth.learn.length).toBeGreaterThan(10);
      expect(c.mono.length).toBeLessThanOrEqual(2);
      expect(c.accent).toMatch(/^#/);
    }
  });

  it("id 중복 없음", () => {
    const ids = MOCK_STOCK_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("전문용어/거래부추김/예측 단정 0건 (§0)", () => {
    expect(allText()).not.toMatch(BANNED);
  });

  it("모든 카드에 포모 균형추가 담겨 있다 (포모 완화)", () => {
    for (const c of MOCK_STOCK_CARDS) {
      const t = `${c.comment} ${c.depth.learn}`;
      expect(t).toMatch(BALANCE);
    }
  });

  it("상승/하락/조용이 섞여 있다 (한쪽으로 안 치우침)", () => {
    const up = MOCK_STOCK_CARDS.filter((c) => c.changePct > 1).length;
    const down = MOCK_STOCK_CARDS.filter((c) => c.changePct < -1).length;
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
  });
});
