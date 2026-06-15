/**
 * Reddit Public JSON 페처 — Community Heat 데이터 소스.
 *
 * @author 안티그래비티 — 1-A Community Heat 데이터 소스 확장
 *
 * Reddit의 Public JSON API(무료, API 키 불필요)를 사용하여
 * 서브레딧별 최근 게시물의 참여도(upvotes, comments)와 감성(bullish 키워드)을 수집한다.
 *
 * last30days 패턴: engagement-weighted scoring.
 * TradingAgents 패턴: 감성 분류(bullish/bearish).
 *
 * ⚠️ Reddit Public JSON은 Rate Limit이 있으므로(~60 req/min)
 *    서버사이드에서만 호출하고, 결과는 캐싱하여 사용한다.
 *    이 모듈은 순수 페칭 로직만 담당한다 (캐싱은 호출측 책임).
 */

import type { RedditSignal } from "./types";

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

/** 기본 수집 대상 서브레딧 목록 (투자·주식 관련). */
export const DEFAULT_SUBREDDITS: readonly string[] = [
  "wallstreetbets",
  "stocks",
  "investing",
  "options",
  "cryptocurrency",
] as const;

/**
 * Bullish 감성 키워드 (대소문자 무시).
 * TradingAgents Sentiment Analyst 패턴 참고.
 * 금칙어(매수/매도/수익보장) 아님 — 커뮤니티 감성 *분류*용 내부 키워드.
 */
const BULLISH_KEYWORDS = [
  "moon", "to the moon", "bullish", "buy the dip", "diamond hands",
  "rocket", "all in", "undervalued", "calls", "long",
  "breaking out", "squeeze", "gamma", "tendies",
] as const;

const BULLISH_REGEX = new RegExp(
  BULLISH_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i"
);

// ---------------------------------------------------------------------------
// Reddit Public JSON 타입 (최소 필요 필드)
// ---------------------------------------------------------------------------

interface RedditListing {
  data: {
    children: Array<{
      data: {
        title: string;
        selftext: string;
        ups: number;
        num_comments: number;
        created_utc: number;
      };
    }>;
  };
}

// ---------------------------------------------------------------------------
// 페칭 로직
// ---------------------------------------------------------------------------

/**
 * 단일 서브레딧에서 최근 게시물(hot, limit 25)의 감성·참여도를 수집한다.
 *
 * @param subreddit - 서브레딧 이름 (예: "wallstreetbets")
 * @param timeoutMs - 네트워크 타임아웃 (기본 5초)
 * @returns RedditSignal 또는 실패 시 null (에러는 삼킨다 — 폴백 우선)
 */
export async function fetchSubredditSignal(
  subreddit: string,
  timeoutMs = 5000,
): Promise<RedditSignal | null> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=25&raw_json=1`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      headers: {
        // Reddit Public JSON은 User-Agent 필수
        "User-Agent": "fomo-club:community-heat:v1.0 (by /u/fomo-club-bot)",
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) return null;

    const listing = (await res.json()) as RedditListing;
    const posts = listing.data.children;

    if (posts.length === 0) return null;

    let totalUpvotes = 0;
    let totalComments = 0;
    let bullishCount = 0;

    for (const post of posts) {
      const d = post.data;
      totalUpvotes += Math.max(0, d.ups);
      totalComments += Math.max(0, d.num_comments);

      const text = `${d.title} ${d.selftext}`;
      if (BULLISH_REGEX.test(text)) {
        bullishCount++;
      }
    }

    const bullishRatio = posts.length > 0 ? bullishCount / posts.length : 0;

    return {
      subreddit,
      postCount: posts.length,
      totalUpvotes,
      totalComments,
      bullishRatio,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    // 네트워크 오류, 타임아웃 등 → null (폴백 우선, 에러 삼킴)
    return null;
  }
}

/** 레딧 글 1건(제목 원문) — 미국주 grounding 용(B 트랙 §1). 집계가 아니라 *원문 제목*. */
export interface RedditPost {
  title: string;
  ups: number;
  numComments: number;
  /** 작성 시각 ms(UTC). */
  tsMs: number;
}

/**
 * 단일 서브레딧 hot 글의 *제목 원문*을 반환(집계 아님). 실패 시 빈 배열(폴백 우선).
 * 미국 종목(엔비디아 등)을 레딧 원문에 substring-grounding 하려면 제목 텍스트가 필요하다.
 */
export async function fetchSubredditPosts(
  subreddit: string,
  timeoutMs = 5000,
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=25&raw_json=1`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { "User-Agent": "fomo-club:community-heat:v1.0 (by /u/fomo-club-bot)" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const listing = (await res.json()) as RedditListing;
    return listing.data.children.map((c) => ({
      title: c.data.title,
      ups: Math.max(0, c.data.ups),
      numComments: Math.max(0, c.data.num_comments),
      tsMs: Math.max(0, c.data.created_utc) * 1000,
    }));
  } catch {
    return [];
  }
}

/**
 * 여러 서브레딧을 병렬 수집하여 RedditSignal[]을 반환한다.
 * 실패한 서브레딧은 결과에서 제외된다 (부분 실패 허용).
 *
 * @param subreddits - 수집 대상 목록 (기본: DEFAULT_SUBREDDITS)
 * @param timeoutMs  - 개별 서브레딧 타임아웃
 */
export async function fetchRedditSignals(
  subreddits: readonly string[] = DEFAULT_SUBREDDITS,
  timeoutMs = 5000,
): Promise<RedditSignal[]> {
  const results = await Promise.allSettled(
    subreddits.map((sub) => fetchSubredditSignal(sub, timeoutMs)),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<RedditSignal | null> => r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((v): v is RedditSignal => v != null);
}
