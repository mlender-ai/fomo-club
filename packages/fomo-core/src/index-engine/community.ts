/**
 * Community Heat — 다중 소스 프로바이더 프레임워크 (확장형).
 *
 * docs/FOMO_INDEX.md Community Heat = X/Reddit/Stocktwits 등 언급량·감성.
 * 소스를 플러그인(provider)으로 추상화해 Reddit 외 X·Telegram·토스커뮤니티·네이버카페를
 * 쉽게 추가할 수 있게 한다. 각 provider 는 정규화된 CommunitySourceSignal[] 을 반환.
 * 정직한 숫자: 미연동/실패 provider 는 enabled=false 또는 빈 배열 → 집계에서 제외.
 *
 * 새 소스 추가 절차:
 *   1) CommunityProvider 구현({ id, label, enabled:true, fetch })
 *   2) COMMUNITY_PROVIDERS 에 등록
 *   → communityHeat 가 자동으로 가중 평균에 포함(엔진 변경 불필요).
 */

import { fetchRedditSignals } from "./redditFetcher";
import type { CommunitySourceSignal } from "./types";

export type { CommunitySourceSignal };

/**
 * 커뮤니티 소스 프로바이더. enabled=false 면 스캐폴드(미연동) — 집계 제외.
 * fetch 는 실패 시 빈 배열(throw 금지 — 정직한 폴백).
 */
export interface CommunityProvider {
  id: string;
  label: string;
  enabled: boolean;
  fetch: () => Promise<CommunitySourceSignal[]>;
}

// ── Reddit (라이브) — 기존 redditFetcher 재사용 ──────────────────
const redditProvider: CommunityProvider = {
  id: "reddit",
  label: "Reddit",
  enabled: true,
  async fetch() {
    try {
      const signals = await fetchRedditSignals();
      return signals.map((s) => ({
        source: `reddit/${s.subreddit}`,
        postCount: s.postCount,
        totalUpvotes: s.totalUpvotes,
        totalComments: s.totalComments,
        bullishRatio: s.bullishRatio,
        fetchedAt: s.fetchedAt,
      }));
    } catch {
      return [];
    }
  },
};

/**
 * 확장 예정 소스 — 스캐폴드(enabled=false). 실제 연동 시 enabled=true + fetch 구현.
 * 정직한 숫자: 연동 전엔 집계에 들어가지 않으며 providersAvailable 에도 안 잡힌다.
 *
 * - x:        X(트위터) — 검색 API(유료) 또는 nitter 스크래핑. $TICKER 멘션·좋아요·리트윗.
 * - telegram: 공개 채널/그룹 — Bot API getUpdates 또는 공개 채널 웹 스크래핑.
 * - toss:     토스증권 커뮤니티 — 종목 토론방 게시물/공감.
 * - naver:    네이버 증권 종목토론실 / 카페 — 게시물·댓글·공감.
 */
function stubProvider(id: string, label: string): CommunityProvider {
  return {
    id,
    label,
    enabled: false,
    async fetch() {
      return []; // 미연동 — 연동 시 이 함수만 구현하면 됨
    },
  };
}

export const COMMUNITY_PROVIDERS: readonly CommunityProvider[] = [
  redditProvider,
  stubProvider("x", "X (트위터)"),
  stubProvider("telegram", "Telegram"),
  stubProvider("toss", "토스증권 커뮤니티"),
  stubProvider("naver", "네이버 종목토론/카페"),
];

export interface CommunityFetchResult {
  sources: CommunitySourceSignal[];
  /** 등록된 전체 provider 수(스캐폴드 포함). */
  providersTotal: number;
  /** enabled 인 provider 수(연동 시도 대상). */
  providersEnabled: number;
  /** 실제로 1건 이상 시그널을 반환한 provider 수(정직한 가용 소스). */
  providersAvailable: number;
  /** provider 별 수집 건수(관측/디버그). */
  perProvider: { id: string; enabled: boolean; count: number }[];
}

/**
 * 등록된 모든 enabled provider 를 병렬 수집해 정규화 시그널로 합산(순수 X — fetch 주입형).
 * providers 인자로 테스트 시 mock 주입 가능.
 */
export async function fetchCommunity(
  providers: readonly CommunityProvider[] = COMMUNITY_PROVIDERS,
): Promise<CommunityFetchResult> {
  const enabled = providers.filter((p) => p.enabled);
  const settled = await Promise.allSettled(enabled.map((p) => p.fetch()));

  const sources: CommunitySourceSignal[] = [];
  const perProvider: CommunityFetchResult["perProvider"] = providers.map((p) => ({
    id: p.id,
    enabled: p.enabled,
    count: 0,
  }));
  let providersAvailable = 0;

  enabled.forEach((p, i) => {
    const r = settled[i];
    const got = r && r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [];
    if (got.length > 0) providersAvailable += 1;
    sources.push(...got);
    const rec = perProvider.find((x) => x.id === p.id);
    if (rec) rec.count = got.length;
  });

  return {
    sources,
    providersTotal: providers.length,
    providersEnabled: enabled.length,
    providersAvailable,
    perProvider,
  };
}
