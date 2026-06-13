import { describe, expect, it } from "vitest";
import {
  extractKeywords,
  scoreKeywords,
  THEME_DICTIONARY,
  type KeywordSourceItem,
} from "../src";

const NOW = Date.parse("2026-06-13T12:00:00Z");
const recent = "2026-06-13T11:00:00Z";

// 샘플 mock 글 묶음 — 뉴스 + 커뮤니티(engagement).
const SAMPLE: KeywordSourceItem[] = [
  { title: "엔비디아 신고가 급등, HBM 수요 폭발", publishedAt: recent, source: "한국경제" },
  { title: "삼성전자 반도체 랠리 지속", publishedAt: recent, source: "매일경제" },
  { title: "SK하이닉스 사상 최고가 돌파", publishedAt: recent, source: "연합뉴스" },
  { title: "반도체 커뮤니티: 다들 엔비디아 얘기뿐", publishedAt: recent, engagement: 320, source: "reddit" },
  { title: "비트코인 다시 상승, 코인판 들썩", publishedAt: recent, engagement: 90, source: "reddit" },
  { title: "이더리움 ETF 기대감", publishedAt: recent, source: "블록미디어" },
  { title: "연준 FOMC 앞두고 금리 관망", publishedAt: recent, source: "연합뉴스" },
  { title: "오늘 날씨가 맑습니다", publishedAt: recent, source: "기상청" }, // 매칭 0
];

describe("extractKeywords (사전 기반)", () => {
  it("테마 버킷 추출 + mention 0 테마 제외 + 복수 테마 매칭", () => {
    const ex = extractKeywords(SAMPLE);
    const keys = ex.map((e) => e.keyword);
    expect(keys).toContain("반도체");
    expect(keys).toContain("코인");
    expect(keys).toContain("금리");
    // 2차전지는 SAMPLE에 없음 → 제외(정직)
    expect(keys).not.toContain("2차전지");
    // 반도체가 가장 많이 언급(4건) → 첫 번째
    expect(ex[0]!.keyword).toBe("반도체");
    expect(ex[0]!.mentions).toBe(4);
    // 엔비디아 글은 반도체+AI 둘 다 매칭(복수 테마)
    expect(keys).toContain("AI");
  });

  it("engagement 합산 + emoji 고정 매핑", () => {
    const ex = extractKeywords(SAMPLE);
    const semi = ex.find((e) => e.keyword === "반도체")!;
    expect(semi.engagement).toBe(320);
    expect(semi.emoji).toBe(THEME_DICTIONARY["반도체"]!.emoji);
  });

  it("빈 입력 → 빈 배열(에러 없음)", () => {
    expect(extractKeywords([])).toEqual([]);
  });

  it("출력 타입에 미래 시점 필드 자리(firstDetectedAt/consecutiveDays)는 비어 있다", () => {
    const ex = extractKeywords(SAMPLE);
    expect(ex[0]!.firstDetectedAt).toBeUndefined();
    expect(ex[0]!.consecutiveDays).toBeUndefined();
  });
});

describe("scoreKeywords (군중 쏠림 0~100)", () => {
  it("실제 점수가 산출되고 0~100 범위·내림차순", () => {
    const scored = scoreKeywords(extractKeywords(SAMPLE), { nowMs: NOW });
    expect(scored.length).toBeGreaterThan(0);
    for (const s of scored) {
      expect(s.fomoScore).toBeGreaterThanOrEqual(0);
      expect(s.fomoScore).toBeLessThanOrEqual(100);
    }
    // 점수 내림차순
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1]!.fomoScore).toBeGreaterThanOrEqual(scored[i]!.fomoScore);
    }
  });

  it("surge 키워드(신고가·급등)가 많은 반도체가 잔잔한 금리보다 높다", () => {
    const scored = scoreKeywords(extractKeywords(SAMPLE), { nowMs: NOW });
    const semi = scored.find((s) => s.keyword === "반도체")!;
    const rate = scored.find((s) => s.keyword === "금리")!;
    expect(semi.fomoScore).toBeGreaterThan(rate.fomoScore);
  });

  it("30일 기준선 없으면 confidence 'low' + (a)volume·(b)accel은 null (가짜 기준선 금지)", () => {
    const scored = scoreKeywords(extractKeywords(SAMPLE), { nowMs: NOW });
    for (const s of scored) {
      expect(s.confidence).toBe("low");
      expect(s.signals.volume).toBeNull();
      expect(s.signals.accel).toBeNull();
      // 산출에 쓰인 신호는 실제 집계 기반(tone·community)
      expect(s.signals.tone).toBeGreaterThanOrEqual(0);
      expect(s.signals.tone).toBeLessThanOrEqual(1);
    }
  });

  it("빈 입력 → 빈 배열(에러 없음, 폴백)", () => {
    expect(scoreKeywords([], { nowMs: NOW })).toEqual([]);
  });
});
