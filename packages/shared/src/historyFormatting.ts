// 종목 카드 히스토리 표시용 순수 포매터.
// 컴포넌트 분리되어 vitest로 회귀 봉쇄.

export interface HistoryItemCardLite {
  position: number;
  card: { nameKo: string };
}

export function formatTimeAgo(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = now - t;
  if (diff < 60_000) return "방금";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  return `${months}달 전`;
}

export function formatCardLabel(cards: HistoryItemCardLite[]): string {
  const names = [...cards]
    .sort((a, b) => a.position - b.position)
    .map((c) => c.card.nameKo)
    .filter((n) => n.length > 0);
  if (names.length === 0) return "";
  return names.join(" · ");
}
