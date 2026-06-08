/**
 * Community Heat (0~30): 소셜 언급량·감성 집계.
 *
 * @author 안티그래비티
 * - 1-A: Reddit Public JSON 기반 멀티소스 확장 (last30days + TradingAgents 패턴)
 * - 1-B: HeatMeta(신뢰도 레벨) 반환으로 정직한 숫자 보장
 *
 * 스코어링 공식:
 *   1) 기존 mentionChangePct → 0~1 intensity
 *   2) 기존 bullishRatio (0~1)
 *   3) Reddit engagement-weighted score (upvote+댓글 가중 bullish 비율)
 *   → 가용한 소스의 가중 평균 × COMMUNITY_HEAT_MAX
 */

import type { HeatComponent } from "../types";
import type { CommunitySignals, RedditSignal, HeatMeta, HeatConfidence } from "./types";

export const COMMUNITY_HEAT_MAX = 30;
const NEUTRAL = COMMUNITY_HEAT_MAX / 2;

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/**
 * 변화율(%)을 0~1 강도로 변환.
 * -50% → 0, 0% → 0.33, +100% → 1.
 */
function mentionIntensity(pct: number | undefined): number | null {
  if (pct == null || Number.isNaN(pct)) return null;
  return Math.max(0, Math.min(1, (pct + 50) / 150));
}

/**
 * Reddit 시그널 배열 → engagement-weighted bullish score (0~1).
 *
 * @author 안티그래비티
 * last30days 패턴: 단순 게시물 수가 아니라 upvotes+comments로 가중.
 * 참여도가 높은 게시물의 감성이 더 큰 영향을 미친다.
 */
function redditEngagementScore(signals: RedditSignal[]): number | null {
  if (signals.length === 0) return null;

  let weightedBullish = 0;
  let totalWeight = 0;

  for (const s of signals) {
    // engagement = upvotes + comments (참여도 가중치)
    const engagement = Math.max(1, s.totalUpvotes + s.totalComments);
    weightedBullish += s.bullishRatio * engagement;
    totalWeight += engagement;
  }

  if (totalWeight === 0) return null;
  return Math.max(0, Math.min(1, weightedBullish / totalWeight));
}

/**
 * 가용 소스 수 기반 신뢰도 결정.
 *
 * @author 안티그래비티 — 1-B 폴백 견고화
 */
function determineConfidence(available: number, total: number): HeatConfidence {
  if (available === 0) return "fallback";
  const ratio = available / total;
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// 메인 함수
// ---------------------------------------------------------------------------

/**
 * Community Heat 산출.
 *
 * 데이터 소스 3종:
 *   1. mentionChangePct (소셜 언급량 변화율)
 *   2. bullishRatio (직접 입력된 bullish 비율)
 *   3. reddit[] (Reddit engagement-weighted score) — 1-A 확장
 *
 * 소스가 하나도 없으면 중립값(15) + confidence="fallback".
 */
export function communityHeat(signals: CommunitySignals = {}): HeatComponent {
  // ── 각 소스 추출 ──
  const mention = mentionIntensity(signals.mentionChangePct);

  const bullish =
    signals.bullishRatio == null || Number.isNaN(signals.bullishRatio)
      ? null
      : Math.max(0, Math.min(1, signals.bullishRatio));

  // reddit(레거시) + sources(다중 프로바이더: X/Telegram/Toss/Naver…)를 하나의 engagement 풀로 합산.
  const reddit = redditEngagementScore([
    ...(signals.reddit ?? []),
    ...(signals.sources ?? []).map((s) => ({
      subreddit: s.source,
      postCount: s.postCount,
      totalUpvotes: s.totalUpvotes,
      totalComments: s.totalComments,
      bullishRatio: s.bullishRatio,
      fetchedAt: s.fetchedAt,
    })),
  ]);

  // ── 가중 평균 산출 ──
  const parts = [mention, bullish, reddit].filter((v): v is number => v != null);

  const SOURCES_TOTAL = 3; // mentionChangePct, bullishRatio, 커뮤니티집계(reddit+sources)
  const sourcesAvailable = parts.length;

  const score =
    parts.length === 0
      ? NEUTRAL
      : Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * COMMUNITY_HEAT_MAX);

  // ── 신뢰도 메타 (1-B) ──
  const meta: HeatMeta = {
    confidence: determineConfidence(sourcesAvailable, SOURCES_TOTAL),
    sourcesTotal: SOURCES_TOTAL,
    sourcesAvailable,
  };

  return { key: "community", score: clamp(score), max: COMMUNITY_HEAT_MAX, meta };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(COMMUNITY_HEAT_MAX, n));
}
