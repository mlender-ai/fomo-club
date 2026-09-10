import { describe, expect, it } from "vitest";
import {
  FEED_CONFIDENCE_THRESHOLD,
  FEED_EMOTIONS,
  FEED_EMOTION_COLORS,
  FEED_EMOTION_LABELS,
  MOCK_FEED_CARDS,
} from "../src";

// 투자 조언·단정 금칙어 — regulation 검사. 카드 1장이 제품 신뢰를 깬다.
const BANNED = /매수|매도|사세요|파세요|사라|팔아라|오른다|내린다|급등 예상|확실|보장/;

describe("MOCK_FEED_CARDS", () => {
  it("모든 감정 탭에 5장 이상", () => {
    for (const e of FEED_EMOTIONS) {
      expect(MOCK_FEED_CARDS[e].length).toBeGreaterThanOrEqual(5);
      expect(FEED_EMOTION_LABELS[e]).toBeTruthy();
      expect(FEED_EMOTION_COLORS[e]).toMatch(/^#/);
    }
  });

  it("카드의 emotion 필드가 자기 탭과 일치", () => {
    for (const e of FEED_EMOTIONS) {
      for (const c of MOCK_FEED_CARDS[e]) {
        expect(c.emotion).toBe(e);
        expect(c.confidence).toBeGreaterThanOrEqual(FEED_CONFIDENCE_THRESHOLD);
      }
    }
  });

  it("금칙어(투자 조언·단정) 0건", () => {
    for (const e of FEED_EMOTIONS) {
      for (const c of MOCK_FEED_CARDS[e]) {
        expect(c.headline).not.toMatch(BANNED);
      }
    }
  });

  it("가짜 수치 금지 — mock 근거는 '샘플'로 정직하게 표기", () => {
    for (const e of FEED_EMOTIONS) {
      for (const c of MOCK_FEED_CARDS[e]) {
        if (c.evidence?.value) expect(c.evidence.value).toBe("샘플");
      }
    }
  });
});
