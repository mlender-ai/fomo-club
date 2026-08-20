import type { WatchItem } from "./watchlist";
import type { JudgmentHistoryItem } from "./judgmentLedgerClient";

/**
 * 내 기록 탭의 계산부 (DS-04 §2). 순수 함수.
 *
 * 두 가지만 본다: **관심 종목**(누른 뒤 얼마나 움직였나)과 **본 카드**(며칠에 몇 장).
 * 그 밖의 레거시 블록(요청함·후회 영수증·점수대 분해)은 이 탭에서 뺐다 — DS-04 §2-1 이
 * 이 탭의 정본이다.
 */

export interface WatchRow {
  stock: string;
  /** 종목코드/티커. 없으면 표시하지 않는다. */
  code: string | undefined;
  /** 관심 누른 시각(ms). */
  addedAt: number;
  /** 누른 뒤 변동(%). 기준가나 현재가가 없으면 undefined — 지어내지 않는다. */
  returnPct: number | undefined;
  /** 이 화면에서 accent 를 받을 행인가 — **가장 높은 수익 하나만**(DS-04 §2-2). */
  best: boolean;
}

/**
 * 관심 종목 행 — 최근 등록 순. 변동은 **등록 시점 가격 대비 현재가**다.
 *
 * `priceAt` 이 없는 항목(이 필드 도입 이전에 담은 것)은 변동을 비운다. 등록일만 보여주는 것이
 * 없는 기준가를 추측해 성적을 만드는 것보다 정직하다.
 */
export function watchRows(
  items: readonly WatchItem[],
  currentPriceOf: (stock: string) => number | undefined
): WatchRow[] {
  const rows = items
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map((item): WatchRow => {
      const current = currentPriceOf(item.stock);
      const base = item.priceAt;
      const returnPct =
        typeof base === "number" && base > 0 && typeof current === "number" && current > 0
          ? Math.round(((current - base) / base) * 100 * 10) / 10
          : undefined;
      return {
        stock: item.stock,
        code: item.naverCode ?? item.symbol,
        addedAt: item.ts,
        returnPct,
        best: false,
      };
    });

  // accent 는 한 곳 — 수익이 가장 높은 행. 전부 음수면 accent 를 주지 않는다(자랑할 게 없다).
  let bestIndex = -1;
  let bestValue = 0;
  rows.forEach((row, index) => {
    if (typeof row.returnPct === "number" && row.returnPct > bestValue) {
      bestValue = row.returnPct;
      bestIndex = index;
    }
  });
  if (bestIndex >= 0) rows[bestIndex]!.best = true;
  return rows;
}

export interface SeenDay {
  /** `YYYY-MM-DD` (KST). */
  date: string;
  count: number;
}

/** `Date` → KST `YYYY-MM-DD`. 서버 없이 화면에서 날짜를 가르는 유일한 지점이다. */
function kstDate(ms: number): string {
  const at = new Date(ms + 9 * 3_600_000);
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

/** 본 카드 — 날짜별 장수(최신순). 며칠에 몇 장 봤는지만 센다. */
export function seenByDate(items: readonly JudgmentHistoryItem[]): SeenDay[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!Number.isFinite(item.firstSeenAt)) continue;
    const date = kstDate(item.firstSeenAt);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** `1755000000000` → `8/14`. 등록일 표기(연도는 생략 — 같은 해가 대부분이다). */
export function shortDate(ms: number): string {
  const at = new Date(ms + 9 * 3_600_000);
  return `${at.getUTCMonth() + 1}/${at.getUTCDate()}`;
}
