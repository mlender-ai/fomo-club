import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * 국가별 덱 커버리지 집계 (US-02 D-2·D-3).
 *
 * ## 왜 이 파일이 필요했나
 *
 * US-02 의 현상은 "며칠째 국내 종목만 나온다"였다. 진단할 때 **며칠째인지 셀 수단이 없었다** —
 * `daily-30` 응답은 오늘 것뿐이고, `ledger/history` 는 비어 있었다. 그래서 사고를 며칠 지나
 * 화면을 보고서야 알았다(WO D-2 의 문제의식 그대로).
 *
 * 판단 원장(`JudgmentLedger`)에는 이미 답이 있다 — `kind='selection'` 행은 날짜와
 * `asset`(kr-stock | us-stock | coin | macro)을 갖고, `kind='signal'` 행은
 * `payload.signalTypes` 를 갖는다. **새 테이블을 만들 필요가 없다. 읽는 수단이 없었을 뿐이다.**
 *
 * ## 왜 SQL 로 세는가
 *
 * 원장은 날짜 파티션에 하루 수백 행씩 쌓인다. payload 를 앱으로 끌어와 세면 조회 경로가
 * 감사 때문에 흔들린다. `candle-coverage.ts` 와 같은 규약을 지킨다 — **DB 안에서 세고
 * 숫자만 가져온다.**
 *
 * 읽기 전용이다. 쓰기·크론 호출 없음.
 */

export type CoverageAsset = "kr-stock" | "us-stock" | "coin" | "macro";

/** 국가별 카드 수 — 종목 카드만. 코인·거시는 무국적이라 국가 비중의 분모가 아니다. */
export interface CountryDayRow {
  date: string;
  kr: number;
  us: number;
  coin: number;
  macro: number;
  /** 종목 카드 합계(kr + us) — 국가 비중의 분모. */
  stockCards: number;
  /** 미국 비중(%). 종목 카드가 0이면 `null`(0% 와 구별한다 — 잰 게 없는 것이다). */
  usSharePct: number | null;
}

export interface SignalCountryRow {
  signalType: string;
  kr: number;
  us: number;
}

export interface CountryCoverage {
  days: CountryDayRow[];
  signals: SignalCountryRow[];
  /**
   * 미국 0장이 연속된 최근 일수 (WO D-2 알림 기준).
   * `days` 의 최신부터 세되, **원장에 아무 행도 없는 날은 세지 않는다** —
   * 빌드가 안 돈 날과 미국이 0장인 날은 다른 사고다.
   */
  usZeroStreak: number;
  /** 원장에 selection 행이 하나도 없는 날짜(빌드·적재 사고 후보). */
  missingDates: string[];
}

const ASSETS: readonly CoverageAsset[] = ["kr-stock", "us-stock", "coin", "macro"] as const;

function kstDate(offsetDays = 0): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() - offsetDays);
  return now.toISOString().slice(0, 10);
}

function emptyDay(date: string): CountryDayRow {
  return { date, kr: 0, us: 0, coin: 0, macro: 0, stockCards: 0, usSharePct: null };
}

/**
 * 최근 `days` 일의 국가별 카드 수와 신호별 국가 분포.
 *
 * 날짜 축은 **달력으로 채운다** — 원장에 없는 날을 표에서 빼면 "미국 0장 이틀 연속"을
 * 판정할 때 빈 날이 조용히 사라져 연속이 끊긴 것처럼 보인다. 없는 날은 `missingDates` 로
 * 드러내고 연속 계산에서는 제외한다(사고 종류가 다르므로).
 */
export async function countryCoverage(days = 14): Promise<CountryCoverage | null> {
  const window = Math.max(1, Math.min(90, Math.floor(days)));
  const from = kstDate(window - 1);
  try {
    const [selectionRows, signalRows] = await Promise.all([
      prisma.$queryRaw<Array<{ date: string; asset: string; n: bigint }>>`
        SELECT "date", "asset", COUNT(DISTINCT "canonical")::bigint AS n
        FROM "JudgmentLedger"
        WHERE "kind" = 'selection' AND "date" >= ${from}
        GROUP BY "date", "asset"
      `,
      prisma.$queryRaw<Array<{ asset: string; signal_type: string; n: bigint }>>`
        SELECT "asset", signal_type, COUNT(*)::bigint AS n
        FROM "JudgmentLedger",
             jsonb_array_elements_text(COALESCE("payload"->'signalTypes', '[]'::jsonb)) AS signal_type
        WHERE "kind" = 'signal' AND "date" >= ${from}
        GROUP BY "asset", signal_type
      `,
    ]);

    const byDate = new Map<string, CountryDayRow>();
    for (let i = window - 1; i >= 0; i -= 1) {
      const date = kstDate(i);
      byDate.set(date, emptyDay(date));
    }
    const seenDates = new Set<string>();
    for (const row of selectionRows) {
      const day = byDate.get(row.date);
      if (!day) continue;
      seenDates.add(row.date);
      const n = Number(row.n);
      if (row.asset === "kr-stock") day.kr += n;
      else if (row.asset === "us-stock") day.us += n;
      else if (row.asset === "coin") day.coin += n;
      else if (row.asset === "macro") day.macro += n;
    }
    for (const day of byDate.values()) {
      day.stockCards = day.kr + day.us;
      day.usSharePct = day.stockCards > 0 ? Math.round((day.us / day.stockCards) * 1000) / 10 : null;
    }

    const signalMap = new Map<string, SignalCountryRow>();
    for (const row of signalRows) {
      const entry = signalMap.get(row.signal_type) ?? { signalType: row.signal_type, kr: 0, us: 0 };
      const n = Number(row.n);
      if (row.asset === "kr-stock") entry.kr += n;
      else if (row.asset === "us-stock") entry.us += n;
      else continue; // 국가 표에는 종목 카드만 — 코인·거시는 국가가 없다.
      signalMap.set(row.signal_type, entry);
    }

    const ordered = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const missingDates = ordered.filter((day) => !seenDates.has(day.date)).map((day) => day.date);
    let usZeroStreak = 0;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const day = ordered[i]!;
      if (!seenDates.has(day.date)) continue; // 원장이 빈 날은 판정 불가 — 건너뛴다(연속을 끊지도 않는다).
      if (day.us > 0) break;
      usZeroStreak += 1;
    }

    return {
      days: ordered,
      signals: [...signalMap.values()].sort((a, b) => b.us + b.kr - (a.us + a.kr) || a.signalType.localeCompare(b.signalType)),
      usZeroStreak,
      missingDates,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) return null;
    return null;
  }
}

export { ASSETS as COVERAGE_ASSETS };
