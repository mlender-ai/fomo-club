import { describe, expect, it } from "vitest";
import {
  buildKeywordCard,
  buildKeywordCards,
  overallConfidence,
  CALM_MARKERS,
  communityEngagementByTheme,
  mergeCommunityEngagement,
  extractKeywords,
  scoreKeywords,
  josa,
  hasBatchim,
  applyLlmComment,
  validateLlmComment,
  parseKeywordComments,
  buildKeywordCommentPrompt,
  isCommentSafe,
  type KeywordSourceItem,
  type ScoredKeyword,
  type CommunitySourceSignal,
  type LlmKeywordComment,
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

  it("정중한 반말 — 카드 텍스트에 '너' 2인칭 지목이 없다(상황 주어)", () => {
    const cards = buildKeywordCards(scoreSample());
    for (const c of cards) {
      const blob = `${c.comment} ${c.depth.why} ${c.depth.remember}`;
      expect(blob, `카드 ${c.keyword} 2인칭 지목`).not.toMatch(/너(는|가|도|만|를|한테|희)/);
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

describe("josa (조사 받침 처리)", () => {
  it("받침 유무로 은/는 선택", () => {
    expect(josa("코인", "은는")).toBe("은"); // ㄴ 받침
    expect(josa("반도체", "은는")).toBe("는"); // 모음
    expect(josa("금리", "은는")).toBe("는");
    expect(josa("2차전지", "은는")).toBe("는");
  });
  it("영문 약어 예외맵 — AI는 받침 없음", () => {
    expect(hasBatchim("AI")).toBe(false);
    expect(josa("AI", "은는")).toBe("는");
  });
  it("이/가·을/를도 받침 따라", () => {
    expect(josa("코인", "이가")).toBe("이");
    expect(josa("반도체", "이가")).toBe("가");
    expect(josa("코인", "을를")).toBe("을");
  });
  it("카드 코멘트에 '코인는' 같은 오류가 없다", () => {
    const cards = buildKeywordCards(scoreSample());
    for (const c of cards) {
      expect(c.comment.includes("코인는")).toBe(false);
      // 일반화: 받침 있는 키워드 뒤 '는', 없는 키워드 뒤 '은'이 붙는 오류 차단
      expect(c.comment.includes(`${c.keyword}는`) && hasBatchim(c.keyword)).toBe(false);
    }
  });
});

describe("코멘트 변주 (밴드 중복 해소)", () => {
  it("결정적 — 같은 입력은 항상 같은 코멘트(캐시 정합)", () => {
    const k = scoreSample()[0]!;
    expect(buildKeywordCard(k).comment).toBe(buildKeywordCard(k).comment);
  });
  it("같은 밴드라도 키워드가 다르면 코멘트가 동일하지 않다", () => {
    const base = scoreSample()[0]!;
    // 같은 점수(밴드)지만 다른 키워드 → 변주 풀 + 키워드명으로 달라진다
    const a = buildKeywordCard({ ...base, keyword: "코인", emoji: "₿", fomoScore: 30, mentions: 11 });
    const b = buildKeywordCard({ ...base, keyword: "금리", emoji: "💵", fomoScore: 30, mentions: 7 });
    expect(a.comment).not.toBe(b.comment);
  });
  it("언급 횟수(N번/N건)는 유저 텍스트에 노출하지 않는다 (운영자 피드백)", () => {
    const base = scoreSample()[0]!;
    // mention 수가 커도 코멘트/why 에 숫자+번/건 패턴이 안 나와야 한다.
    for (const score of [5, 35, 55, 75, 95]) {
      const card = buildKeywordCard({ ...base, keyword: "AI", emoji: "🤖", fomoScore: score, mentions: 23 });
      const blob = `${card.comment} ${card.depth.why} ${card.depth.remember}`;
      expect(blob, `밴드 ${score} 언급수 노출`).not.toMatch(/\d+\s*(번|건)/);
    }
  });
});

describe("핵심 뉴스 소스 (실제 근거 노출, 추상 브리핑 대체)", () => {
  const withArticles: ScoredKeyword = {
    ...scoreSample().find((k) => k.keyword === "반도체")!,
    articles: [
      { title: "엔비디아 신고가 급등", source: "한국경제", url: "https://x/1", publishedAt: "2026-06-13T11:00:00Z" },
      { title: "삼성전자 반도체 랠리", source: "매일경제", url: "https://x/2", publishedAt: "2026-06-13T12:00:00Z" },
      { title: "삼성전자 반도체 랠리", source: "중복", publishedAt: "2026-06-13T09:00:00Z" }, // 제목 중복 → 제외
      { title: "HBM 수요 폭발", source: "전자신문", publishedAt: "2026-06-13T08:00:00Z" },
      { title: "네번째", source: "x", publishedAt: "2026-06-13T07:00:00Z" }, // MAX_SOURCES 초과 → 제외
    ],
  };

  it("카드에 실제 기사 제목/출처/링크가 상위 N건(최신순, 중복 제거) 담긴다", () => {
    const card = buildKeywordCard(withArticles);
    expect(card.sources.length).toBe(3);
    expect(card.sources[0]).toEqual({ title: "삼성전자 반도체 랠리", source: "매일경제", url: "https://x/2" }); // 최신
    expect(card.sources.map((s) => s.title)).not.toContain("네번째"); // N 초과 제외
    // 같은 제목 중복은 한 번만.
    expect(card.sources.filter((s) => s.title === "삼성전자 반도체 랠리").length).toBe(1);
  });

  it("기사가 없으면 sources 빈 배열(에러 없음)", () => {
    const card = buildKeywordCard({ ...withArticles, articles: [] });
    expect(card.sources).toEqual([]);
  });

  it("LLM 프롬프트는 횟수 언급을 금지한다", () => {
    const p = buildKeywordCommentPrompt([{ keyword: "반도체", score: 88, titles: ["엔비디아 급등"], related: ["삼성전자"] }]);
    expect(p).toMatch(/횟수/);
  });
});

describe("Phase 3 — LLM 코멘트 가드레일 (§4.4)", () => {
  const good: LlmKeywordComment = {
    keyword: "반도체",
    comment: "너 지금 반도체 관심 왔구나. 너만 그런 거 아니야 — 시장도 과열됐어. 잠깐 뒤로 빠져서 지켜보는 건 어때?",
    why: "오늘 엔비디아·삼성전자 얘기가 여기저기서 돌면서 다들 시선이 쏠렸어.",
    remember: "제일 뜨거울 때 들어가면 늦는 경우가 많아. 안 급해도 돼.",
  };

  it("정상 LLM 코멘트는 통과하고 카드에 얹힌다", () => {
    expect(validateLlmComment(good)).toBe(true);
    const card = buildKeywordCard(scoreSample()[0]!);
    const merged = applyLlmComment(card, good);
    expect(merged.comment).toBe(good.comment);
    expect(merged.depth.why).toBe(good.why);
    expect(merged.depth.remember).toBe(good.remember);
    // 점수·관련종목 등 사실 부분은 LLM 이 못 건드린다.
    expect(merged.fomoScore).toBe(card.fomoScore);
    expect(merged.related).toEqual(card.related);
  });

  it("투자조언 주입 → 폐기 → 룰 폴백으로 강등", () => {
    const card = buildKeywordCard(scoreSample()[0]!);
    const bad: LlmKeywordComment = { ...good, comment: "지금 반도체 매수해. 안 사면 후회해." };
    expect(validateLlmComment(bad)).toBe(false);
    // applyLlmComment 가 룰 카드 그대로 돌려준다(코멘트 교체 안 됨).
    expect(applyLlmComment(card, bad)).toEqual(card);
  });

  it("미래 예측 주입 → 폐기", () => {
    const bad: LlmKeywordComment = { ...good, comment: "이거 곧 오른다. 천천히 봐도 돼." };
    expect(validateLlmComment(bad)).toBe(false);
  });

  it("전문용어 주입 → 폐기", () => {
    const bad: LlmKeywordComment = { ...good, why: "골든크로스가 떠서 다들 들떴어. 안 급해도 돼." };
    expect(validateLlmComment(bad)).toBe(false);
  });

  it("균형추(진정 결) 누락 → 폐기", () => {
    const bad: LlmKeywordComment = {
      ...good,
      comment: "너 지금 반도체 관심 왔구나. 다들 여기 몰렸어.",
      remember: "오늘 제일 뜨거운 키워드였어.",
    };
    expect(validateLlmComment(bad)).toBe(false);
  });

  it("빈 필드(LLM 누락) → 폐기 + applyLlmComment 룰 폴백", () => {
    const card = buildKeywordCard(scoreSample()[0]!);
    expect(validateLlmComment({ ...good, why: "" })).toBe(false);
    expect(validateLlmComment(undefined)).toBe(false);
    // undefined(LLM 미동작) → 룰 카드 그대로.
    expect(applyLlmComment(card, undefined)).toEqual(card);
  });

  it("룰 폴백 템플릿 자체는 금칙어 가드를 통과한다(강등 카드도 안전)", () => {
    for (const c of buildKeywordCards(scoreSample())) {
      expect(isCommentSafe(`${c.comment} ${c.depth.why} ${c.depth.remember}`)).toBe(true);
    }
  });

  it("parseKeywordComments — JSON 배열 + 코드펜스/잡텍스트 허용", () => {
    const raw = '설명 텍스트\n```json\n[{"keyword":"코인","comment":"c","why":"w","remember":"r"}]\n``` 끝';
    const out = parseKeywordComments(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ keyword: "코인", comment: "c", why: "w", remember: "r" });
    expect(parseKeywordComments("not json")).toEqual([]);
  });

  it("buildKeywordCommentPrompt — 정중한 반말(너 지목 금지)/균형추/JSON 지시 + 키워드 포함", () => {
    const p = buildKeywordCommentPrompt([
      { keyword: "반도체", score: 88, titles: ["엔비디아 급등"], related: ["삼성전자"] },
    ]);
    expect(p).toContain("반도체");
    expect(p).toContain("정중한 반말");
    expect(p).toContain("지목 금지");
    expect(p).toContain("균형추");
    expect(p).toMatch(/JSON 배열/);
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

  it("소스 라벨 → 테마 매핑(옵션 F: 글 수 기준), 매핑 없는 소스는 제외", () => {
    const map = communityEngagementByTheme(signals);
    // 옵션 F: engagement = postCount(글 수). reddit upvote(200+80) 안 씀 → 단위 통일.
    expect(map.get("반도체")?.engagement).toBe(40); // postCount 40
    expect(map.get("코인")?.engagement).toBe(25); // postCount 25 (업보트 무시)
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
    expect(semi.engagement).toBe(40); // 뉴스 0 + 커뮤니티 글수 40
    expect(coin.engagement).toBe(25); // 옵션 F: 글수 25 (업보트 아님)
    // 커뮤니티 시그널이 새 테마를 만들지 않는다(키 수 동일)
    expect(merged.length).toBe(extracted.length);
  });

  it("빈 시그널 → 추출 그대로(에러 없음)", () => {
    const extracted = extractKeywords(SAMPLE);
    expect(mergeCommunityEngagement(extracted, [])).toEqual(extracted);
  });
});
