import { scoreArticleFomo } from "./score";
import type { RawArticle, ScoredArticle } from "./types";

/**
 * 뉴스 피드 빌더 — 여러 소스에서 모은 기사를 dedupe → 점수 → 점수순 정렬한다.
 * docs/PIVOT_FEED_FIRST.md. 순수 함수(테스트 보장). fetch 는 라우트가 담당.
 */

export interface NewsFeedOptions {
  /** 현재 시각(ms) — 최신성 점수 + 테스트 주입용. */
  nowMs: number;
  /** 최대 노출 수. */
  limit?: number;
  /** 이 점수 미만은 버린다(선택). 기본 0(전부 노출 — 정직). */
  minScore?: number;
}

/** url 정규화 — 쿼리스트링/해시 제거로 같은 기사 중복 제거 정확도↑. */
function normalizeUrl(url: string): string {
  return url.split("#")[0]!.split("?")[0]!.replace(/\/$/, "").toLowerCase();
}

/**
 * 기사 배열 → 점수순 피드.
 * - url 정규화 기준 dedupe (소스 간 같은 기사 중복 제거).
 * - 동점이면 최신 기사 우선.
 */
export function buildNewsFeed(articles: RawArticle[], opts: NewsFeedOptions): ScoredArticle[] {
  const { nowMs, limit = 40, minScore = 0 } = opts;

  const byUrl = new Map<string, RawArticle>();
  for (const a of articles) {
    if (!a.title?.trim() || !a.url?.trim()) continue; // 깨진 카드 노출 금지
    const key = normalizeUrl(a.url);
    if (!byUrl.has(key)) byUrl.set(key, a);
  }

  const scored: ScoredArticle[] = [];
  for (const a of byUrl.values()) {
    const { score, reason } = scoreArticleFomo(a, nowMs);
    if (score < minScore) continue;
    scored.push({ ...a, fomoScore: score, scoreReason: reason });
  }

  scored.sort((x, y) => {
    if (y.fomoScore !== x.fomoScore) return y.fomoScore - x.fomoScore;
    return Date.parse(y.publishedAt) - Date.parse(x.publishedAt);
  });

  return scored.slice(0, limit);
}
