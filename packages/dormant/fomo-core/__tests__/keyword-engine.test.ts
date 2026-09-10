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

  it("30일 절대 기준선 없으면 confidence 'low' + (a)volume은 당일 상대값·(b)accel은 null", () => {
    const scored = scoreKeywords(extractKeywords(SAMPLE), { nowMs: NOW });
    for (const s of scored) {
      expect(s.confidence).toBe("low");
      // (a)volume 은 더 이상 null 이 아니라 당일 상대 mention(0~1). (b)accel 만 null.
      expect(s.signals.volume).toBeGreaterThanOrEqual(0);
      expect(s.signals.volume).toBeLessThanOrEqual(1);
      expect(s.signals.accel).toBeNull();
      expect(s.signals.tone).toBeGreaterThanOrEqual(0);
      expect(s.signals.tone).toBeLessThanOrEqual(1);
    }
  });

  it("volume(당일 상대 mention)이 주신호 — mention 최다 키워드의 volume=1.0", () => {
    const ex = extractKeywords(SAMPLE);
    const scored = scoreKeywords(ex, { nowMs: NOW });
    const maxMention = Math.max(...ex.map((e) => e.mentions));
    const top = scored.find((s) => s.mentions === maxMention)!;
    expect(top.signals.volume).toBeCloseTo(1.0, 5);
  });

  it("빈 입력 → 빈 배열(에러 없음, 폴백)", () => {
    expect(scoreKeywords([], { nowMs: NOW })).toEqual([]);
  });

  // SUPPLY DEMAND SCORE HANDOFF §3 — 수급 보조 신호(불변/결정성)
  it("수급 미주입(현재 기본) — 점수가 기존과 동일하고 supplyDemand=null (불변)", () => {
    const ex = extractKeywords(SAMPLE);
    const a = scoreKeywords(ex, { nowMs: NOW });
    const b = scoreKeywords(ex, { nowMs: NOW, supplyByKeyword: {} });
    expect(b.map((s) => s.fomoScore)).toEqual(a.map((s) => s.fomoScore));
    for (const s of b) expect(s.signals.supplyDemand).toBeNull();
  });

  it("수급 주입 시 방향이 점수에 약하게 블렌딩되고 결정적", () => {
    const ex = extractKeywords(SAMPLE);
    const kw = ex[0]!.keyword;
    const base = scoreKeywords(ex, { nowMs: NOW }).find((s) => s.keyword === kw)!.fomoScore;
    const buy = scoreKeywords(ex, { nowMs: NOW, supplyByKeyword: { [kw]: 0.65 } }).find((s) => s.keyword === kw)!;
    const sell = scoreKeywords(ex, { nowMs: NOW, supplyByKeyword: { [kw]: 0.35 } }).find((s) => s.keyword === kw)!;
    expect(buy.signals.supplyDemand).toBe(0.65);
    expect(buy.fomoScore).toBeGreaterThanOrEqual(sell.fomoScore); // 매수세가 매도세보다 높거나 같게
    // 블렌딩은 10%라 base 근처 — 결정적
    expect(scoreKeywords(ex, { nowMs: NOW, supplyByKeyword: { [kw]: 0.65 } }).find((s) => s.keyword === kw)!.fomoScore).toBe(buy.fomoScore);
    expect(Math.abs(buy.fomoScore - base)).toBeLessThanOrEqual(15); // 보조라 큰 변동 없음
  });
});

describe("extractKeywords — 오추출 방지(단어경계·일반어 제거, 2026-06-14)", () => {
  const themesOf = (item: KeywordSourceItem) => extractKeywords([item]).map((e) => e.keyword);

  it("'Shanghai'의 'ai' 부분일치 → AI 오추출 안 됨", () => {
    const item: KeywordSourceItem = {
      title: "상하이 국제공항 여객 처리량 감소",
      summary: "Shanghai Pudong airport passenger volume fell 1.0%",
      source: "로이터",
    };
    expect(themesOf(item)).not.toContain("AI");
  });

  it("'federal'의 'fed' 부분일치 → 금리 오추출 안 됨", () => {
    expect(themesOf({ title: "US federal holiday calendar updated" })).not.toContain("금리");
  });

  it("반도체 ETF 기사 → 코인 오추출 안 됨('ETF' 사전어 제거)", () => {
    const item: KeywordSourceItem = { title: "'조정이 기회' 반도체株 3배 ETF에 뭉칫돈", source: "매일경제" };
    const themes = themesOf(item);
    expect(themes).toContain("반도체");
    expect(themes).not.toContain("코인");
  });

  it("영문 약어는 독립 단어일 때만 매칭 — 'AI 반도체 수요'는 AI+반도체", () => {
    const themes = themesOf({ title: "AI 반도체 수요 폭발, Fed 금리 동결" });
    expect(themes).toEqual(expect.arrayContaining(["AI", "반도체", "금리"]));
  });

  it("정상 키워드는 여전히 매칭 — 한글/약어", () => {
    expect(themesOf({ title: "비트코인 급등, ethereum도 강세" })).toContain("코인");
    expect(themesOf({ title: "엔비디아 GPT 칩 수요" })).toEqual(expect.arrayContaining(["반도체", "AI"]));
  });
});
