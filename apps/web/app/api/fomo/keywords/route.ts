import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { KeywordCard, KeywordConfidence } from "@fomo/core";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { computeKeywordCards } from "../../../../lib/keyword-pipeline";
import { readKeywordSnapshot } from "../../../../lib/keyword-snapshot";

/**
 * 키워드 카드 API — "오늘 사람들 시선이 가장 쏠린 키워드" 실데이터 산출. KEYWORD_ENGINE_SPEC §4.6.
 *
 * 응답 경로(§4.6 — 절대 빈값 없음):
 *   1) 오늘 KeywordCardSnapshot 있으면 그대로 반환(live:false) — Phase 4 cron 이 미리 채운 것.
 *   2) 없으면(스냅샷 전/테이블 미생성) 라이브 산출(live:true). 산출·검증·코멘트는 computeKeywordCards 공유.
 *   3) 라이브도 실패하면 mock 명시적 폴백(confidence:"fallback").
 *
 * 응답 정직성(§5): confidence 를 반드시 동봉. 30일 기준선이 아직 없어 라이브는 'low'(가짜 high 금지).
 *
 * db push 게이트: KeywordCardSnapshot 테이블이 아직 prod 에 없을 수 있어, 스냅샷 조회는 실패해도
 *   조용히 라이브로 폴백한다(readKeywordSnapshot 내부 try/catch). 테이블이 생기면 1)이 자동 활성화.
 */
export const dynamic = "force-dynamic";
// 외부 소스(뉴스 RSS·커뮤니티 HTML) + LLM 코멘트가 수초 걸릴 수 있어 데드라인 넉넉히.
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

// ── 영속 캐시(Vercel Data Cache) + in-flight dedup ──────────────────────────
// 성능(PERF LOADING HANDOFF §1·§2): 메인 카드는 뉴스 RSS·커뮤니티 HTML fetch + LLM 코멘트라 수~10초.
// 기존 인스턴스 메모리 캐시는 Vercel 서버리스 콜드/다중 인스턴스에서 미스 잦아 자주 재산출됐다.
// → computeKeywordCards 를 Data Cache(unstable_cache)로 영속화: (KST날짜)당 한 번만 산출,
//   이후 모든 인스턴스가 즉시 읽기. DDL/외부 KV 불필요. revalidate 30분(시장 변동 반영) + 익일 자동 새 키.
// snapshot-first(§4.6)는 그대로 — cron 스냅샷이 있으면 그게 1순위. 이 캐시는 라이브 폴백 경로의 영속화.
// mock 폴백은 캐시 밖(실패를 굳히지 않게). inflight 로 인스턴스 내 동시 요청 dedup.
let inflight: Promise<KeywordsPayload> | null = null;

/** 라이브 산출(공유 파이프라인). 성공분만 Data Cache 에 영속. 실패해도 throw 없이 mock 폴백. */
async function computeLive(date: string): Promise<KeywordsPayload> {
  try {
    const load = unstable_cache(
      async () => await computeKeywordCards(),
      ["fomo-keywords-live", cacheVersion(), date],
      { revalidate: 1800 }
    );
    const { cards, confidence } = await load();
    return { date, cards, confidence, live: true };
  } catch (err) {
    console.warn("[fomo/keywords] live compute failed — mock fallback", err);
    const { MOCK_KEYWORD_CARDS } = await import("@fomo/core");
    return { date, cards: MOCK_KEYWORD_CARDS, confidence: "fallback", live: false };
  }
}

/** 스냅샷-우선 → 라이브(Data Cache, dedup). */
async function getPayload(date: string): Promise<KeywordsPayload> {
  // 1) 오늘 스냅샷(테이블 없으면 null) — cron 이 채운 안정 데이터를 외부 호출 없이 즉시 반환.
  const snap = await readKeywordSnapshot(date);
  if (snap) return { date, cards: snap.cards, confidence: snap.confidence, live: false };

  // 2) 라이브 산출 — Data Cache 가 영속 캐시, inflight 가 인스턴스 내 동시 dedup.
  if (inflight) return inflight;
  inflight = computeLive(date).finally(() => {
    inflight = null;
  });
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
