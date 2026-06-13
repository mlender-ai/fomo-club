import type { KeywordCard } from "@fomo/core";

/**
 * 키워드 히스토리 + 덱 커서. KEYWORD_CARD_FEED_DEV_SPEC v3.
 *
 * - 히스토리: 사용자가 "본" 키워드 카드(스와이프/뎁스 열람)를 적재 → 히스토리 탭에서 다시 봄.
 *   localStorage 영속(백엔드 없음). 출시 후 서버 동기화로 교체할 단일 지점.
 * - 커서: 덱에서 다음에 보여줄 카드 위치. 모듈 메모리(탭 전환엔 유지, 새로고침이면 0부터 = 데일리 리셋).
 *   "한번 보고 다시 돌아오면 다음 카드"를 위해 위치를 기억한다.
 */
const KEY = "fomo_keyword_history";
const CAP = 100;

export interface ViewedKeyword {
  id: string;
  keyword: string;
  emoji: string;
  fomoScore: number;
  ts: number;
}

/** 본 카드 기록 — 같은 id면 최신 시각으로 갱신(중복 없음). */
export function recordViewed(card: KeywordCard, nowMs: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: ViewedKeyword[] = raw ? (JSON.parse(raw) as ViewedKeyword[]) : [];
    const next = list.filter((v) => v.id !== card.id);
    next.push({
      id: card.id,
      keyword: card.keyword,
      emoji: card.emoji,
      fomoScore: card.fomoScore,
      ts: nowMs,
    });
    window.localStorage.setItem(KEY, JSON.stringify(next.slice(-CAP)));
  } catch {
    /* 저장 실패 무시 */
  }
}

/** 최근 본 순(내림차순). */
export function getHistory(): ViewedKeyword[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: ViewedKeyword[] = raw ? (JSON.parse(raw) as ViewedKeyword[]) : [];
    return [...list].sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

// ── 덱 커서(모듈 메모리) ──
let cursor = 0;
export function getCursor(): number {
  return cursor;
}
export function setCursor(n: number): void {
  cursor = Math.max(0, n);
}
