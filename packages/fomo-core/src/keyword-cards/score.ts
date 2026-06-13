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
 * ⚠️ 정직성(§4.3 단서): (a)(b)는 30일 기준선/시계열이 있어야 산출 가능.
 *   Phase 1엔 누적 스냅샷이 없으므로 (a)(b)는 산출하지 않고(null) confidence "low"로 표기,
 *   (c)(d)만 재정규화해 점수를 낸다. 가짜 기준선은 절대 만들지 않는다.
 *   (a)(b)와 high/medium confidence는 Phase 2+(스냅샷 누적) 도입.
 */

export type KeywordConfidence = "high" | "medium" | "low" | "fallback";

export interface KeywordSignals {
  /** (c) 톤 강도 0~1 — 키워드 기사들의 FOMO 점수 평균(surge 키워드↑). */
  tone: number;
  /** (d) 커뮤니티 열 0~1 — 오늘 키워드들 중 상대 참여도(engagement-weighted). */
  community: number;
  /** (a) 언급 볼륨 0~1 — 30일 기준선 대비. 미보유 시 null(Phase 2+). */
  volume: number | null;
  /** (b) 언급 가속 0~1 — 최근 6h vs 직전 6h. 시계열 미보유 시 null(Phase 2+). */
  accel: number | null;
}

export interface ScoredKeyword extends ExtractedKeyword {
  /** 0~100 — 군중 쏠림(시세 아님). */
  fomoScore: number;
  confidence: KeywordConfidence;
  signals: KeywordSignals;
  /** 산출 근거(디버그/튜닝). */
  reason: string;
}

// §4.3 가중치.
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
}

/**
 * 추출된 키워드 → 포모 점수. 점수 내림차순 정렬.
 * Phase 1: (c)(d)만으로 산출 + confidence "low"(30일 기준선 부재). (a)(b)는 null.
 */
export function scoreKeywords(keywords: ExtractedKeyword[], opts: ScoreOptions): ScoredKeyword[] {
  // (d) 커뮤니티 열은 오늘 키워드들 사이의 상대 참여도 — 가짜 기준선 없이 자체 정규화.
  const maxEngagement = Math.max(1, ...keywords.map((k) => k.engagement));

  const scored = keywords.map((kw): ScoredKeyword => {
    const tone = toneSignal(kw, opts.nowMs);
    const community = clamp01(kw.engagement / maxEngagement);

    // 30일 기준선 없음 → (a)(b) 미산출, (c)(d)만 재정규화.
    const wSum = W.tone + W.community;
    const fomoScore = clamp100(((W.tone * tone + W.community * community) / wSum) * 100);

    return {
      ...kw,
      fomoScore,
      confidence: "low",
      signals: { tone, community, volume: null, accel: null },
      reason: `tone=${tone.toFixed(2)} community=${community.toFixed(2)} | (a)volume·(b)accel 미산출(30일 기준선 부재) → confidence low`,
    };
  });

  scored.sort((a, b) => b.fomoScore - a.fomoScore);
  return scored;
}
