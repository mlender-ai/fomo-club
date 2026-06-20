import { scoreArticleFomo } from "../news-feed/score";
import type { RawArticle } from "../news-feed/types";
import type { ExtractedKeyword } from "./extract";

/**
 * 포모 점수 — 키워드의 군중 쏠림 정도(0~100). KEYWORD_ENGINE_SPEC §4.3.
 *
 * 시세가 아니라 "다들 여기 보는 정도". 순수 함수.
 * §4.3 4신호 가중 평균: (a)언급볼륨 0.35 (b)언급가속 0.30 (c)톤강도 0.20 (d)커뮤니티열 0.15.
 * (c)는 news-feed/score.ts(기사 단위 surge/rise/damp 점수기)를 재활용해 키워드 평균으로 집계.
 *
 * ⚠️ 정직성(§4.3 단서): (b)accel 은 인트라데이 시계열이 있어야 산출 가능 → 아직 null.
 *   (a)volume 은 30일 기준선이 없으므로 **당일 키워드 간 상대 mention 량**(mention / 당일 max)으로
 *   채운다. 절대 기준선이 아님을 confidence "low"로 정직하게 노출한다(가짜 기준선 금지).
 *   b(null) 제외하고 {a,c,d} 를 재정규화: wa 0.500 / wc 0.286 / wd 0.214.
 *   제품 정의("다들 뭐에 쏠렸나", PRODUCT_TRUTH §1)에 맞춰 volume 을 주신호로, tone 은 보조로 둔다.
 *   (d)community 는 옵션 F(글 수 단위)로 산출(community.ts). high/medium 은 Phase 4(스냅샷 기준선).
 */

export type KeywordConfidence = "high" | "medium" | "low" | "fallback";

export interface KeywordSignals {
  /** (c) 톤 강도 0~1 — 키워드 기사들의 FOMO 점수 평균(surge 키워드↑). */
  tone: number;
  /** (d) 커뮤니티 열 0~1 — 오늘 키워드들 중 상대 글 수(옵션 F). 커뮤니티 전무한 날 0. */
  community: number;
  /** (a) 언급 볼륨 0~1 — 당일 상대 mention(mention/당일max). 30일 기준선은 Phase 4(그땐 절대값). */
  volume: number;
  /** (b) 언급 가속 0~1 — 최근 6h vs 직전 6h. 인트라데이 시계열 미보유 시 null(Phase 4+). */
  accel: number | null;
  /**
   * (e) 수급 0~1 — 그 테마 종목들의 외인+기관 순매매 **방향**(장마감 확정 직전거래일).
   * SUPPLY DEMAND SCORE HANDOFF §3: 기준선 없는 지금은 방향(매수세/매도세)만 보조로, 가중치 낮게.
   * 데이터 없으면 null → 점수 영향 0(언급량 주신호 유지). 기준선 쌓이면 "이례성"으로 승격(별도).
   */
  supplyDemand: number | null;
}

export interface ScoredKeyword extends ExtractedKeyword {
  /** 0~100 — 군중 쏠림(시세 아님). */
  fomoScore: number;
  confidence: KeywordConfidence;
  signals: KeywordSignals;
  /** 산출 근거(디버그/튜닝). */
  reason: string;
}

// §4.3 가중치(원본). b(accel)=null 이라 산출 시 {a,c,d} 로 재정규화한다.
const W = { volume: 0.35, accel: 0.3, tone: 0.2, community: 0.15 } as const;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** (c) 톤 강도 — 키워드 기사들의 기사단위 FOMO 점수 평균 / 100. news-feed 점수기 재활용. */
function toneSignal(kw: ExtractedKeyword, nowMs: number): number {
  if (kw.articles.length === 0) return 0;
  let sum = 0;
  for (const a of kw.articles) {
    const article: RawArticle = {
      id: "",
      title: a.title,
      url: "",
      source: a.source ?? "",
      publishedAt: a.publishedAt ?? "",
      lang: a.lang ?? "ko",
      ...(a.summary ? { summary: a.summary } : {}),
    };
    sum += scoreArticleFomo(article, nowMs).score;
  }
  return clamp01(sum / kw.articles.length / 100);
}

export interface ScoreOptions {
  /** 현재 시각(ms) — 최신성·테스트 주입용. */
  nowMs: number;
  /**
   * 키워드별 수급 신호(0~1, 장마감 확정 방향). 데이터 없는 키워드는 생략 → null(점수 영향 0).
   * 미주입(현재 기본)이면 모든 키워드 null → 점수는 언급량 기준 그대로(불변).
   */
  supplyByKeyword?: Readonly<Record<string, number>>;
}

/** 수급 보조 가중치 — §3 "가중치 낮게 시작". 데이터 있을 때만 base 점수에 10% 블렌딩. */
const SUPPLY_BLEND = 0.1;

/**
 * 추출된 키워드 → 포모 점수. 점수 내림차순 정렬.
 * (a)volume=당일 상대 mention 주신호, (c)tone 보조, (d)community 옵션 F. (b)accel=null → 가중치 재정규화.
 * confidence "low"(30일 절대 기준선 부재 — 당일 상대값임을 정직하게 노출).
 */
export function scoreKeywords(keywords: ExtractedKeyword[], opts: ScoreOptions): ScoredKeyword[] {
  // 당일 키워드 간 상대화 — 가짜 기준선 없이 자체 정규화.
  const maxMention = Math.max(1, ...keywords.map((k) => k.mentions));
  const maxCommunity = Math.max(0, ...keywords.map((k) => k.engagement)); // 옵션 F: engagement=글 수
  const anyCommunity = maxCommunity > 0;

  // b(accel)=null 제외 후 재정규화. 커뮤니티 전무한 날은 d 도 빼고 {a,c}.
  const w = anyCommunity
    ? {
        volume: W.volume / (W.volume + W.tone + W.community), // 0.500
        tone: W.tone / (W.volume + W.tone + W.community), // 0.286
        community: W.community / (W.volume + W.tone + W.community), // 0.214
      }
    : {
        volume: W.volume / (W.volume + W.tone), // 0.636
        tone: W.tone / (W.volume + W.tone), // 0.364
        community: 0,
      };

  const scored = keywords.map((kw): ScoredKeyword => {
    const tone = toneSignal(kw, opts.nowMs);
    const volume = clamp01(kw.mentions / maxMention);
    const community = anyCommunity ? clamp01(kw.engagement / maxCommunity) : 0;

    const base = clamp100((w.volume * volume + w.tone * tone + w.community * community) * 100);

    // (e) 수급 보조 — 데이터 있을 때만 방향을 base 에 10% 블렌딩(§3 가중치 낮게). 없으면 base 그대로(불변).
    const supplyDemand = opts.supplyByKeyword?.[kw.keyword] ?? null;
    const fomoScore =
      supplyDemand !== null
        ? clamp100(base * (1 - SUPPLY_BLEND) + supplyDemand * 100 * SUPPLY_BLEND)
        : base;

    return {
      ...kw,
      fomoScore,
      confidence: "low",
      signals: { tone, community, volume, accel: null, supplyDemand },
      reason:
        `volume=${volume.toFixed(2)} tone=${tone.toFixed(2)} community=${community.toFixed(2)} ` +
        `(w ${w.volume.toFixed(2)}/${w.tone.toFixed(2)}/${w.community.toFixed(2)}) | ` +
        (supplyDemand !== null
          ? `supply=${supplyDemand.toFixed(2)}(장마감 확정, blend ${SUPPLY_BLEND}) | `
          : "") +
        `(a)volume=당일 상대mention, (b)accel 미산출, 30일 절대기준선 부재 → confidence low`,
    };
  });

  scored.sort((a, b) => b.fomoScore - a.fomoScore);
  return scored;
}
