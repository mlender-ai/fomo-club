import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { KeywordCard, KeywordConfidence } from "@fomo/core";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { computeKeywordCards } from "../../../../lib/keyword-pipeline";
import { readKeywordSnapshot, readLatestKeywordSnapshot } from "../../../../lib/keyword-snapshot";

/**
 * 키워드 카드 API — "오늘 사람들 시선이 가장 쏠린 키워드" 실데이터 산출. KEYWORD_ENGINE_SPEC §4.6.
 *
 * 응답 경로(Performance Spine Phase 3 — 유저 요청에서 무거운 엔진 금지):
 *   1) 오늘 KeywordCardSnapshot 있으면 그대로 반환(live:false, stale:false)
 *   2) 오늘 스냅샷이 없으면 가장 최근 스냅샷 반환(live:false, stale:true)
 *   3) 최근 스냅샷도 없으면 mock 명시적 폴백(confidence:"fallback", live:false)
 *   4) 라이브 산출은 /api/fomo/keywords?live=1 로 명시했을 때만 허용(개발/운영 확인용).
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
  stale: boolean;
  snapshotDate: string | null;
}

// ── 영속 캐시(Vercel Data Cache) + in-flight dedup ──────────────────────────
// 성능(PERF LOADING HANDOFF §1·§2): 메인 카드는 뉴스 RSS·커뮤니티 HTML fetch + LLM 코멘트라 수~10초.
// 기존 인스턴스 메모리 캐시는 Vercel 서버리스 콜드/다중 인스턴스에서 미스 잦아 자주 재산출됐다.
// → computeKeywordCards 를 Data Cache(unstable_cache)로 영속화: (KST날짜)당 한 번만 산출,
//   이후 모든 인스턴스가 즉시 읽기. DDL/외부 KV 불필요. revalidate 30분(시장 변동 반영) + 익일 자동 새 키.
// snapshot-first(§4.6)는 그대로 — cron 스냅샷이 있으면 그게 1순위. 이 캐시는 라이브 폴백 경로의 영속화.
// mock 폴백은 캐시 밖(실패를 굳히지 않게). inflight 로 인스턴스 내 동시 요청 dedup.
// 날짜로 키잉 — 자정 넘김 시점에 이전 날짜의 산출 Promise 를 새 날짜 요청이 공유하지 않게.
let inflight: { date: string; p: Promise<KeywordsPayload> } | null = null;

/** 라이브 산출(공유 파이프라인). 성공분만 Data Cache 에 영속. 실패해도 throw 없이 mock 폴백. */
async function computeLive(date: string): Promise<KeywordsPayload> {
  try {
    const load = unstable_cache(
      async () => await computeKeywordCards(),
      ["fomo-keywords-live", cacheVersion(), date],
      { revalidate: 1800 }
    );
    const { cards, confidence } = await load();
    return { date, cards, confidence, live: true, stale: false, snapshotDate: null };
  } catch (err) {
    console.warn("[fomo/keywords] live compute failed — mock fallback", err);
    const { MOCK_KEYWORD_CARDS } = await import("@fomo/core");
    return {
      date,
      cards: MOCK_KEYWORD_CARDS,
      confidence: "fallback",
      live: false,
      stale: true,
      snapshotDate: null,
    };
  }
}

/** 스냅샷-우선 → 최근 스냅샷 → lightweight fallback. 라이브는 일반 앱 요청에서 돌리지 않는다. */
async function getSnapshotPayload(date: string): Promise<KeywordsPayload> {
  // 1) 오늘 스냅샷(테이블 없으면 null) — cron 이 채운 안정 데이터를 외부 호출 없이 즉시 반환.
  const snap = await readKeywordSnapshot(date);
  if (snap) {
    return {
      date,
      cards: snap.cards,
      confidence: snap.confidence,
      live: false,
      stale: false,
      snapshotDate: snap.date,
    };
  }

  // 2) 오늘 스냅샷이 아직 없으면 최근 스냅샷을 즉시 반환한다. 사용자 요청에서 LLM/뉴스 수집을 돌리지 않기 위함.
  const latest = await readLatestKeywordSnapshot(date);
  if (latest) {
    return {
      date,
      cards: latest.cards,
      confidence: latest.confidence,
      live: false,
      stale: latest.date !== date,
      snapshotDate: latest.date,
    };
  }

  // 3) 최근 스냅샷도 없으면 lightweight fallback. 빈 배열/무한 로딩 금지, confidence 는 fallback.
  const { MOCK_KEYWORD_CARDS } = await import("@fomo/core");
  return {
    date,
    cards: MOCK_KEYWORD_CARDS,
    confidence: "fallback",
    live: false,
    stale: true,
    snapshotDate: null,
  };
}

/** 명시적 live=1 확인용 경로 — Data Cache 가 영속 캐시, inflight 가 인스턴스 내 동시 dedup. */
async function getLivePayload(date: string): Promise<KeywordsPayload> {
  if (inflight && inflight.date === date) return inflight.p;
  const p = computeLive(date).finally(() => {
    if (inflight?.p === p) inflight = null;
  });
  inflight = { date, p };
  return p;
}

export async function GET(request: Request) {
  const date = kstDate();
  const live = new URL(request.url).searchParams.get("live") === "1";
  const payload = live ? await getLivePayload(date) : await getSnapshotPayload(date);
  return withCors(
    NextResponse.json(payload, {
      // 엣지 캐시 — 외부 소스 레이트리밋 보호(피드/배너와 동일 정책).
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" },
    })
  );
}
