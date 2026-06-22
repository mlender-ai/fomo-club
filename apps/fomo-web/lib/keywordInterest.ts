/**
 * 키워드 관심 신호 seam — KEYWORD_CARD_FEED_DEV_SPEC v3 §4.
 *
 * 좌우 스와이프(오른쪽=관심/왼쪽=덜관심)를 localStorage에 쌓고, 오늘 덱 정렬에 1차 반영한다.
 * 서버 동기화/ML 이전의 즉시 체감 개인화 seam.
 */
const KEY = "fomo_keyword_interest";
const CAP = 200;

export type Interest = "more" | "less";
interface InterestRecord {
  keywordId: string;
  signal: Interest;
  ts: number;
}

function read(): InterestRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InterestRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordInterest(keywordId: string, signal: Interest, nowMs: number): void {
  if (typeof window === "undefined") return;
  try {
    const list = read();
    list.push({ keywordId, signal, ts: nowMs });
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-CAP)));
  } catch {
    /* 저장 실패는 무시 — 흐름을 막지 않는다 */
  }
}

/** 최근 신호일수록 크게 반영하는 결정적 취향 점수. more=+, less=-. */
export function keywordInterestScore(keywordId: string, nowMs = Date.now()): number {
  const dayMs = 86_400_000;
  return read()
    .filter((r) => r.keywordId === keywordId)
    .reduce((sum, r) => {
      const ageDays = Math.max(0, (nowMs - r.ts) / dayMs);
      const decay = Math.max(0.25, 1 - ageDays / 14);
      return sum + (r.signal === "more" ? 12 : -10) * decay;
    }, 0);
}
