/** 거시 지표 저장·조회. 행 하나 — 굽는 크론이 한 번에 전부 필요하다(§12). */
import { readFeedContent, writeFeedContent } from "./feed-content-store";
import type { MacroCollection } from "./macro-collect";

const ACTIVE_ID = "macro:active";
const HEALTH_ID = "macro:health";

export async function readMacroCollection(): Promise<MacroCollection | null> {
  return readFeedContent<MacroCollection>(ACTIVE_ID);
}

export async function writeMacroCollection(collection: MacroCollection): Promise<void> {
  await writeFeedContent(ACTIVE_ID, collection);
}

/**
 * MACRO-01 §B-4 — **수집 건강 기록.**
 *
 * 「2일 연속 실패하면 알림」을 하려면 어제 결과를 알아야 한다. 워크플로는 매 실행이
 * 독립이라 기억이 없으므로, 실행 결과를 우리가 남긴다.
 *
 * 성공/실패를 지표 단위가 아니라 **날짜 단위**로 남긴다. 하루에 지표 하나가 빠지는 것과
 * 수집 자체가 죽는 것은 다른 사건이고, 알림이 필요한 건 후자다.
 */
export interface MacroHealth {
  /** 최근 실행들 — 최신이 뒤. 길이는 `MACRO_HEALTH_KEEP` 로 자른다. */
  runs: Array<{
    date: string;
    /** 그날 받은 지표 수. 0이면 실패다. */
    indicators: number;
    /** 실패 사유 요약(있으면). */
    errors: string[];
  }>;
}

/** 며칠치를 들고 있나. 2일 연속을 보는 데 필요한 최소보다 넉넉히 둔다. */
const MACRO_HEALTH_KEEP = 14;

/** 이만큼 연속 실패하면 알린다(§B-4). */
export const MACRO_FAIL_STREAK_ALERT = 2;

export async function readMacroHealth(): Promise<MacroHealth | null> {
  return readFeedContent<MacroHealth>(HEALTH_ID);
}

/**
 * 이번 실행 결과를 기록하고 **지금 몇 일 연속 실패인지** 돌려준다.
 *
 * 같은 날짜로 두 번 돌면 덮어쓴다 — 수동 재실행이 연속 실패로 세지면 안 된다.
 */
export async function recordMacroRun(
  run: MacroHealth["runs"][number]
): Promise<{ failStreak: number; shouldAlert: boolean }> {
  const prior = (await readMacroHealth())?.runs ?? [];
  const runs = [...prior.filter((r) => r.date !== run.date), run]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MACRO_HEALTH_KEEP);

  let failStreak = 0;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    if (runs[i]!.indicators > 0) break;
    failStreak += 1;
  }

  await writeFeedContent(HEALTH_ID, { runs } satisfies MacroHealth);
  return { failStreak, shouldAlert: failStreak >= MACRO_FAIL_STREAK_ALERT };
}
