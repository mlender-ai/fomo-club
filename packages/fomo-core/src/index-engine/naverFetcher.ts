/**
 * 네이버 종목토론실 커뮤니티 시그널 페처 (국내 소스).
 *
 * 공식 공개 API가 없어 finance.naver.com 종목토론실 HTML을 파싱한다(무료·무인증).
 * docs/FOMO_INDEX.md Community Heat. 정직한 숫자: 파싱 실패/도달 불가 시 빈 배열(폴백).
 *
 * 파싱은 순수 함수(parseNaverBoard)로 분리해 vitest로 검증(네트워크 불필요).
 * 마크업 변경에 견고하도록 실패는 조용히 [] 로 degrade(빈 화면/에러 노출 금지).
 */

import type { CommunitySourceSignal } from "./types";

/** 한국 개인투자자 커뮤니티 강세(bullish) 키워드. */
export const KR_BULLISH = [
  "가즈아", "가즈", "매수", "풀매수", "존버", "익절", "오른다", "오를", "상승", "떡상",
  "불기둥", "고고", "기대", "반등", "신고가", "추매가즈아", "가보자", "줍줍", "홀딩",
];
/** 약세(bearish) 키워드. */
export const KR_BEARISH = [
  "손절", "물렸", "물림", "폭락", "하락", "떡락", "공매도", "추매", "물타기", "흑우",
  "패닉", "탈출", "도망", "악재", "신저가", "나락", "한강",
];

/** 제목 한 줄 분류: bull | bear | neutral. */
export function classifyKoreanTitle(title: string): "bull" | "bear" | "neutral" {
  const t = title.replace(/\s+/g, "");
  const bull = KR_BULLISH.some((k) => t.includes(k));
  const bear = KR_BEARISH.some((k) => t.includes(k));
  if (bull && !bear) return "bull";
  if (bear && !bull) return "bear";
  return "neutral";
}

/** "YYYY.MM.DD HH:MM" → epoch ms (KST 가정). 실패 시 null. */
function parseNaverDate(s: string): number | null {
  const m = s.match(/(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return null;
  // KST(+09:00) 기준으로 해석
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * 네이버 종목토론실 HTML → CommunitySourceSignal (순수).
 * @param html  board.naver 응답 HTML
 * @param code  종목코드 (source 라벨용)
 * @param nowMs 현재 시각(ms) — 24h 필터 기준 (테스트 주입용)
 * 게시물 0건이거나 파싱 실패 시 null.
 */
export function parseNaverBoard(html: string, code: string, nowMs: number): CommunitySourceSignal | null {
  try {
    // 게시물 제목: board_read 앵커의 title 속성
    const titles = [...html.matchAll(/board_read\.naver\?[^"]*"[^>]*title="([^"]*)"/g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((t) => t.length > 0);
    if (titles.length === 0) return null;

    // 날짜 셀(게시물과 병렬). 개수가 맞으면 24h 필터, 아니면 전체 사용(보수적).
    const dates = [...html.matchAll(/(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2})/g)].map((m) => m[1] ?? "");
    const cutoff = nowMs - 24 * 3600 * 1000;

    const considered: string[] =
      dates.length === titles.length
        ? titles.filter((_, i) => {
            const t = parseNaverDate(dates[i]!);
            return t == null ? true : t >= cutoff;
          })
        : titles;

    if (considered.length === 0) return null;

    let bull = 0;
    let bear = 0;
    for (const title of considered) {
      const c = classifyKoreanTitle(title);
      if (c === "bull") bull += 1;
      else if (c === "bear") bear += 1;
    }
    const decided = bull + bear;
    // 감성 표명 글이 없으면 중립(0.5). 있으면 bull 비율.
    const bullishRatio = decided === 0 ? 0.5 : bull / decided;

    return {
      source: `naver/${code}`,
      postCount: considered.length,
      // 네이버 종토는 글당 좋아요/댓글 파싱이 불안정 → 글 수를 engagement 가중으로(정직: 실측 글 수만)
      totalUpvotes: considered.length,
      totalComments: 0,
      bullishRatio,
      fetchedAt: new Date(nowMs).toISOString(),
    };
  } catch {
    return null;
  }
}

/** 추적 대상 대표 종목 (개인투자자 관심 상위). */
export const DEFAULT_NAVER_CODES: readonly string[] = [
  "005930", // 삼성전자
  "000660", // SK하이닉스
  "035720", // 카카오
  "035420", // NAVER
  "247540", // 에코프로비엠
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** 단일 종목 종토 시그널 fetch (실패 시 null). */
export async function fetchNaverBoardSignal(
  code: string,
  timeoutMs = 5000,
  nowMs: number = Date.now(),
): Promise<CommunitySourceSignal | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`https://finance.naver.com/item/board.naver?code=${encodeURIComponent(code)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    return parseNaverBoard(html, code, nowMs);
  } catch {
    return null;
  }
}

/** 여러 종목 병렬 수집 → CommunitySourceSignal[] (실패분 제외). */
export async function fetchNaverSignals(
  codes: readonly string[] = DEFAULT_NAVER_CODES,
  timeoutMs = 5000,
): Promise<CommunitySourceSignal[]> {
  const now = Date.now();
  const settled = await Promise.allSettled(codes.map((c) => fetchNaverBoardSignal(c, timeoutMs, now)));
  return settled
    .filter((r): r is PromiseFulfilledResult<CommunitySourceSignal | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is CommunitySourceSignal => v != null);
}

// ── 원문 보존 게시물 (DATA_ENGINE_STRATEGY Track A — 제목을 버리지 않는다) ──────────
// 기존 parseNaverBoard 는 집계(개수)만 반환한다. 이해 레이어는 글 제목 원문이 필요해
// *추가* 함수로 제목을 보존해 돌려준다(기존 집계 경로는 그대로).

export interface NaverBoardPost {
  /** 게시물 제목 원문. */
  title: string;
  /** 작성 시각(ms, KST). 파싱 실패 시 null. */
  tsMs: number | null;
  /** 제목 감성 분류(강세/약세 균형 참고용). */
  tone: "bull" | "bear" | "neutral";
}

/**
 * 네이버 종토 HTML → 게시물 제목 배열(순수). 최근 24h 우선, 최신순, limit 개.
 * parseNaverBoard 와 같은 추출 로직을 쓰되 *집계하지 않고 제목을 보존*한다.
 */
export function parseNaverBoardPosts(html: string, nowMs: number, limit = 15): NaverBoardPost[] {
  try {
    const titles = [...html.matchAll(/board_read\.naver\?[^"]*"[^>]*title="([^"]*)"/g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((t) => t.length > 0);
    if (titles.length === 0) return [];

    const dates = [...html.matchAll(/(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2})/g)].map((m) => m[1] ?? "");
    const cutoff = nowMs - 24 * 3600 * 1000;
    const aligned = dates.length === titles.length;

    const posts: NaverBoardPost[] = titles.map((title, i) => ({
      title,
      tsMs: aligned ? parseNaverDate(dates[i]!) : null,
      tone: classifyKoreanTitle(title),
    }));

    const recent = aligned
      ? posts.filter((p) => p.tsMs == null || p.tsMs >= cutoff)
      : posts;
    // 최신순(시각 없는 건 뒤로).
    recent.sort((a, b) => (b.tsMs ?? 0) - (a.tsMs ?? 0));
    return recent.slice(0, limit);
  } catch {
    return [];
  }
}

/** 단일 종목 종토 게시물 제목 fetch (실패 시 빈 배열 — 정직한 폴백). */
export async function fetchNaverBoardPosts(
  code: string,
  timeoutMs = 5000,
  nowMs: number = Date.now(),
  limit = 15,
): Promise<NaverBoardPost[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`https://finance.naver.com/item/board.naver?code=${encodeURIComponent(code)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    return parseNaverBoardPosts(html, nowMs, limit);
  } catch {
    return [];
  }
}
