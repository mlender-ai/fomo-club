import { describe, expect, it } from "vitest";
import {
  buildKeywordCards,
  overallConfidence,
  CALM_MARKERS,
  communityEngagementByTheme,
  mergeCommunityEngagement,
  extractKeywords,
  scoreKeywords,
  type KeywordSourceItem,
  type ScoredKeyword,
  type CommunitySourceSignal,
} from "../src";

const NOW = Date.parse("2026-06-13T12:00:00Z");

const SAMPLE: KeywordSourceItem[] = [
  { title: "엔비디아 신고가 급등, HBM 수요 폭발", publishedAt: "2026-06-13T11:00:00Z", source: "한국경제" },
  { title: "삼성전자 반도체 랠리 지속", publishedAt: "2026-06-13T11:00:00Z", source: "매일경제" },
  { title: "비트코인 다시 상승, 코인판 들썩", publishedAt: "2026-06-13T11:00:00Z", source: "블록미디어" },
  { title: "연준 FOMC 앞두고 금리 관망", publishedAt: "2026-06-13T11:00:00Z", source: "연합뉴스" },
];

function scoreSample(): ScoredKeyword[] {
  return scoreKeywords(extractKeywords(SAMPLE), { nowMs: NOW });
}

/** 코멘트 가드(§2): 예측·투자조언·전문용어·거래부추김 금칙어. */
const FORBIDDEN = /사라|팔아라|매수|매도|목표가|오를 것|내릴 것|상승할|하락할|지금 안 사면|PER|밸류에이션|추천/;

describe("buildKeywordCards (룰 폴백 코멘트)", () => {
  it("모든 카드 코멘트에 균형추(진정) 마커가 최소 1개", () => {
    const cards = buildKeywordCards(scoreSample());
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      const hasCalm = CALM_MARKERS.some((m) => c.comment.includes(m) || c.depth.remember.includes(m));
      expect(hasCalm, `카드 ${c.keyword} 균형추 누락`).toBe(true);
    }
  });

  it("모든 카드(코멘트+depth)에 금칙어가 없다", () => {
    const cards = buildKeywordCards(scoreSample());
    for (const c of cards) {
      const blob = `${c.comment} ${c.depth.why} ${c.depth.remember}`;
      expect(FORBIDDEN.test(blob), `카드 ${c.keyword} 금칙어`).toBe(false);
    }
  });

  it("점수 전 구간(0~100)에서도 균형추 유지 + 금칙어 0", () => {
    const base = scoreSample()[0]!;
    for (const score of [5, 30, 50, 70, 95]) {
      const card = buildKeywordCards([{ ...base, fomoScore: score }])[0]!;
      const blob = `${card.comment} ${card.depth.remember}`;
      expect(CALM_MARKERS.some((m) => blob.includes(m))).toBe(true);
      expect(FORBIDDEN.test(`${card.comment} ${card.depth.why} ${card.depth.remember}`)).toBe(false);
    }
  });

  it("관련 종목/이모지가 카드로 전달된다", () => {
    const cards = buildKeywordCards(scoreSample());
    const semi = cards.find((c) => c.keyword === "반도체")!;
    expect(semi.related).toContain("삼성전자");
    expect(semi.emoji).toBe("🔥");
  });
});

describe("overallConfidence (정직성)", () => {
  it("키워드 0건 → fallback", () => {
    expect(overallConfidence([])).toBe("fallback");
  });
  it("Phase 2 라이브(전부 low) → low", () => {
    expect(overallConfidence(scoreSample())).toBe("low");
  });
});

describe("communityEngagementByTheme / merge (§4.3 커뮤니티 귀속)", () => {
  const signals: CommunitySourceSignal[] = [
    { source: "naver/005930", postCount: 40, totalUpvotes: 40, totalComments: 0, bullishRatio: 0.6, fetchedAt: "" }, // 삼성전자 → 반도체
    { source: "reddit/cryptocurrency", postCount: 25, totalUpvotes: 200, totalComments: 80, bullishRatio: 0.7, fetchedAt: "" }, // → 코인
    { source: "naver/035720", postCount: 30, totalUpvotes: 30, totalComments: 0, bullishRatio: 0.5, fetchedAt: "" }, // 카카오 → 매핑 없음
  ];

  it("소스 라벨 → 테마 매핑, 매핑 없는 소스는 제외", () => {
    const map = communityEngagementByTheme(signals);
    expect(map.get("반도체")?.engagement).toBe(40);
    expect(map.get("코인")?.engagement).toBe(280); // 200+80
    expect(map.has("2차전지")).toBe(false);
    // 카카오(매핑 없음)는 어떤 테마에도 안 들어간다
    expect([...map.keys()]).toEqual(expect.arrayContaining(["반도체", "코인"]));
    expect(map.size).toBe(2);
  });

  it("뉴스로 확인된 테마에만 참여도 가산(커뮤니티-단독 테마 신설 안 함)", () => {
    const extracted = extractKeywords(SAMPLE); // 반도체·코인·금리·AI (뉴스 근거)
    const merged = mergeCommunityEngagement(extracted, signals);
    const semi = merged.find((k) => k.keyword === "반도체")!;
    const coin = merged.find((k) => k.keyword === "코인")!;
    expect(semi.engagement).toBe(40); // 뉴스 0 + 커뮤니티 40
    expect(coin.engagement).toBe(280);
    // 커뮤니티 시그널이 새 테마를 만들지 않는다(키 수 동일)
    expect(merged.length).toBe(extracted.length);
  });

  it("빈 시그널 → 추출 그대로(에러 없음)", () => {
    const extracted = extractKeywords(SAMPLE);
    expect(mergeCommunityEngagement(extracted, [])).toEqual(extracted);
  });
});
