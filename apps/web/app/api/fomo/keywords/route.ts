import { NextResponse } from "next/server";
import {
  extractKeywords,
  mergeCommunityEngagement,
  scoreKeywords,
  buildKeywordCards,
  overallConfidence,
  fetchCommunity,
  MOCK_KEYWORD_CARDS,
  type KeywordCard,
  type KeywordConfidence,
  type KeywordSourceItem,
} from "@fomo/core";
import { withCors, kstDate } from "../../../../lib/fomo";
import { fetchAllNews } from "../../../../lib/fomo-news-sources";

/**
 * 키워드 카드 API — "오늘 사람들 시선이 가장 쏠린 키워드" 실데이터 산출. KEYWORD_ENGINE_SPEC §4.6 / Phase 2.
 *
 * 파이프라인: 뉴스 RSS + 커뮤니티(Promise.allSettled 병렬) → extract → community 가산 → score → 룰 폴백 코멘트.
 * 코멘트는 Phase 2 라 LLM 없이 룰 폴백 템플릿만(LLM 은 Phase 3).
 *
 * 응답 정직성(§5): confidence 를 반드시 동봉. 30일 기준선이 아직 없어 라이브는 'low'(가짜 high 금지).
 * 라이브 산출이 키워드 0건이면 mock 을 *명시적 폴백*(confidence:"fallback")으로 반환 — 진짜처럼 위장하지 않는다.
 *
 * 스냅샷-우선(§4.6 1단계: 오늘 스냅샷 있으면 그대로)은 Phase 4(cron + DDL 승인)에서 이 앞에 붙는다.
 * 지금은 스냅샷 테이블에 의존하지 않고 라이브 산출을 메인 경로로 둔다(prisma db push 미실행).
 */
export const dynamic = "force-dynamic";
// 외부 소스(뉴스 RSS·커뮤니티 HTML) 수집이 수초 걸릴 수 있어 데드라인 넉넉히.
export const maxDuration = 30;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

interface KeywordsPayload {
  date: string;
  cards: readonly KeywordCard[];
  confidence: KeywordConfidence;
  live: boolean;
}

// ── 라이브 결과 메모리 캐시(TTL) + in-flight dedup ──────────────────────────
// snapshot-first 정신(§4.6): 한 사용자의 새로고침/동시 접속이 외부 소스를 반복 폭격하지 않게,
// 라이브 산출 결과를 서버 인스턴스 단위로 짧게 캐시하고 동시 요청은 진행 중 Promise 를 공유한다.
// (Phase 4 의 일일 DB 스냅샷이 들어오면 이 메모리 캐시는 백업 역할로 내려간다.)
const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; payload: KeywordsPayload } | null = null;
let inflight: Promise<KeywordsPayload> | null = null;

/** 뉴스/커뮤니티 실수집 → 키워드 카드 산출. 실패해도 throw 없이 mock 폴백을 돌려준다. */
async function computeLive(date: string): Promise<KeywordsPayload> {
  const [newsResult, communityResult] = await Promise.allSettled([fetchAllNews(), fetchCommunity()]);

  const items: KeywordSourceItem[] = [];
  if (newsResult.status === "fulfilled") {
    for (const a of newsResult.value) {
      items.push({
        title: a.title,
        ...(a.summary ? { summary: a.summary } : {}),
        publishedAt: a.publishedAt,
        source: a.source,
        lang: a.lang,
      });
    }
  } else {
    console.warn("[fomo/keywords] news error", newsResult.reason);
  }

  const communitySignals =
    communityResult.status === "fulfilled" ? communityResult.value.sources : [];
  if (communityResult.status === "rejected") {
    console.warn("[fomo/keywords] community error", communityResult.reason);
  }

  // 뉴스 추출 → 커뮤니티 참여도 가산(뉴스로 확인된 테마에만, §4.3 보수적) → 점수.
  const extracted = mergeCommunityEngagement(extractKeywords(items), communitySignals);
  const scored = scoreKeywords(extracted, { nowMs: Date.now() });
  const cards = buildKeywordCards(scored);

  // 키워드 0건 = 보여줄 게 없음 → mock 명시적 폴백(가짜 점수 강제 생성 금지, §5).
  if (cards.length === 0) {
    return { date, cards: MOCK_KEYWORD_CARDS, confidence: "fallback", live: true };
  }
  return { date, cards, confidence: overallConfidence(scored), live: true };
}

/** TTL 캐시 + dedup 래퍼. */
async function getPayload(date: string): Promise<KeywordsPayload> {
  if (cache && Date.now() - cache.at < TTL_MS && cache.payload.date === date) {
    return cache.payload;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await computeLive(date);
      cache = { at: Date.now(), payload };
      return payload;
    } catch (err) {
      // 라이브 경로 자체가 깨져도 빈 화면 금지 — mock 명시적 폴백.
      console.warn("[fomo/keywords] live compute failed — mock fallback", err);
      return { date, cards: MOCK_KEYWORD_CARDS, confidence: "fallback" as const, live: false };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function GET() {
  const date = kstDate();
  const payload = await getPayload(date);
  return withCors(
    NextResponse.json(payload, {
      // 엣지 캐시 — 외부 소스 레이트리밋 보호(피드/배너와 동일 정책).
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" },
    })
  );
}
