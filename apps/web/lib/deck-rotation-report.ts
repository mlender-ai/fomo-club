/**
 * WO-DECK-01 PHASE 5 — 회전율 지표 조립(대시보드·알림 공용).
 *
 * 저장된 일별 스냅샷(`quiet-pick:<date>`)만 읽는다. 외부 소스 없음 — 몇 번을 열어도 쿼터를 안 쓴다.
 * 발행 시점에 굳힌 `rotation` 이 있으면 그것이 정본이고, 없는 구 스냅샷은 `picks` 상위에서 파생한다.
 */

import { readFeedContentHistoryByPrefix } from "./feed-content-store";
import { PAGE1_SIZE, isFreshSignal } from "./deck-ranking";
import type { QuietPickResponse } from "./quiet-pick";

/** 1위가 이 일수 이상 같으면 고착으로 본다(WO PHASE 5-1 목표: 3일 이하). */
export const TOP1_STAGNATION_ALERT_DAYS = 3;

export interface DeckRotationDay {
  date: string;
  deckSize: number;
  page1: string[];
  /** 전일 1페이지에서 교체된 수. 첫날은 null. */
  page1Swapped: number | null;
  /** 덱 전체의 신규 진입 수. 첫날은 null. */
  newEntries: number | null;
  freshCount: number;
  persistentCount: number;
  cooldownApplied: number;
  agedOut: number;
  reentryCount: number;
  shrunkBy: number;
  compositionVersion: string | null;
  ageDaysMedian: number | null;
}

export interface DeckRotationReport {
  generatedAt: string;
  days: DeckRotationDay[];
  /** 현재 1위가 며칠 연속 같은가. */
  top1ConsecutiveDays: number;
  top1: string | null;
  /** 고착 알림 — 1위가 목표를 넘겨 같은 종목이다. */
  stagnationAlert: boolean;
  /** 종목별 1페이지 누적 점유일(상위). 1위 연속일만 보면 놓치는 고착이 여기 보인다. */
  page1Occupancy: Array<{ canonical: string; days: number }>;
  /** 관측 창에서 1페이지가 전일과 달라진 날 / 비교 가능한 날. */
  page1ChangedDays: number;
  comparableDays: number;
}

/** 스냅샷 하나 → 그날의 1페이지. 발행 시점 기록이 있으면 그것을 쓴다. */
function page1Of(snap: QuietPickResponse): string[] {
  return snap.rotation?.page1 ?? snap.picks.slice(0, PAGE1_SIZE).map((pick) => pick.subject.canonical);
}

export async function buildDeckRotationReport(windowDays = 30): Promise<DeckRotationReport> {
  const records = await readFeedContentHistoryByPrefix<QuietPickResponse>("quiet-pick:2", 400);
  const asc = records
    .map((record) => ({ date: record.id.replace("quiet-pick:", ""), snap: record.row }))
    .filter((row) => Array.isArray(row.snap?.picks))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-windowDays);

  const days: DeckRotationDay[] = asc.map(({ date, snap }, index) => {
    const page1 = page1Of(snap);
    const prev = asc[index - 1];
    const prevPage1 = prev ? page1Of(prev.snap) : null;
    const prevDeck = prev ? new Set(prev.snap.picks.map((pick) => pick.subject.canonical)) : null;
    const rot = snap.rotation;
    return {
      date,
      deckSize: snap.picks.length,
      page1,
      page1Swapped: prevPage1 ? page1.filter((name) => !prevPage1.includes(name)).length : null,
      newEntries: prevDeck ? snap.picks.filter((pick) => !prevDeck.has(pick.subject.canonical)).length : null,
      // 구 스냅샷은 ageDays 가 없다 — days 로 대신하지 않는다(다른 값이다). 그때는 0 으로 두고
      // compositionVersion 이 null 인 것으로 "구 페이로드" 임을 읽는다.
      freshCount: rot?.freshCount ?? snap.picks.filter((pick) => isFreshSignal(pick.signal.ageDays ?? Number.POSITIVE_INFINITY)).length,
      persistentCount: rot?.persistentCount ?? 0,
      cooldownApplied: rot?.cooldownApplied ?? 0,
      agedOut: rot?.agedOut ?? 0,
      reentryCount: rot?.reentryCount ?? 0,
      shrunkBy: rot?.shrunkBy ?? 0,
      compositionVersion: rot?.compositionVersion ?? null,
      ageDaysMedian: rot?.ageDaysMedian ?? null,
    };
  });

  // 1위 연속일 — 최신일부터 거꾸로 센다.
  const desc = [...days].reverse();
  const top1 = desc[0]?.page1[0] ?? null;
  let top1ConsecutiveDays = 0;
  for (const day of desc) {
    if (!top1 || day.page1[0] !== top1) break;
    top1ConsecutiveDays += 1;
  }

  const occupancy = new Map<string, number>();
  for (const day of days) for (const name of day.page1) occupancy.set(name, (occupancy.get(name) ?? 0) + 1);

  const comparable = days.filter((day) => day.page1Swapped !== null).length;
  const changed = days.filter((day) => (day.page1Swapped ?? 0) > 0).length;

  return {
    generatedAt: new Date().toISOString(),
    days,
    top1ConsecutiveDays,
    top1,
    stagnationAlert: top1ConsecutiveDays >= TOP1_STAGNATION_ALERT_DAYS,
    page1Occupancy: [...occupancy.entries()]
      .map(([canonical, d]) => ({ canonical, days: d }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 10),
    page1ChangedDays: changed,
    comparableDays: comparable,
  };
}
