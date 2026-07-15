/**
 * 주간 판단 캘린더 (2026-07-15 User Zero: "어닝콜·실적발표 캘린더 — 똑같이 하지 말고 우리만의 해자").
 *
 * 해자 설계: 토스류 캘린더 = 전 종목 일정 나열(누구나 같은 화면). FOMO 캘린더 = 발견 덱과 같은
 * 유니버스(큐레이션 미장 대형주)만 추려서, 클라이언트가 내 행동 기록(담은/본 카드, localStorage)과
 * 조인해 "이번 주 내 카드의 시험대"로 보여준다 — 로그인 없이 개인화되는 판단 캘린더.
 *
 * 데이터: Nasdaq calendar API(어닝, Vercel egress 통과 확인) + BLS/Fed/거래소 규칙 일정(feed-extras).
 * KR 실적 발표일은 사전 공표 소스가 없어(DART는 사후 공시) 정직하게 미포함 — 후속 과제.
 * 크론 프리웜 전용(요청 경로 fetch 0) — feed-content?slot=index 가 매일 FeedContentCache에 쓴다.
 */

import { upcomingMarketEvents } from "./feed-extras";
import { usDiscoverySeedForSymbol } from "./us-symbols";
import { readFeedContentByPrefix, writeFeedContent } from "./feed-content-store";
import { kstDate } from "./fomo";

const NASDAQ_CALENDAR_URL = "https://api.nasdaq.com/api/calendar/earnings";
const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** 유니버스 밖이어도 이 시총 이상이면 포함 — TSMC·유나이티드헬스 같은 메가캡 어닝은 시장 이벤트다. */
const MEGA_CAP_FLOOR_USD = 80_000_000_000;
const MAX_EARNINGS_PER_DAY = 4;
const CALENDAR_WINDOW_DAYS = 7;

export interface CalendarStockRef {
  canonical: string;
  symbol: string;
  /** 장전/장후 — Nasdaq time 필드. 미제공이면 생략. */
  session?: "장전" | "장후";
}

export interface CalendarEvent {
  kind: "earnings" | "macro";
  title: string;
  detail?: string;
  stocks?: CalendarStockRef[];
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  events: CalendarEvent[];
}

export interface WeeklyCalendar {
  asOf: string;
  days: CalendarDay[];
}

export interface EarningsRow {
  symbol: string;
  marketCapUsd: number;
  session?: "장전" | "장후";
}

function parseMarketCap(text: string | undefined): number {
  if (!text) return 0;
  const value = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function sessionOf(time: string | undefined): "장전" | "장후" | undefined {
  if (time === "time-pre-market") return "장전";
  if (time === "time-after-hours") return "장후";
  return undefined;
}

/** 하루치 Nasdaq 어닝 캘린더 — 실패는 [](fail-open, 크론 전용). */
export async function fetchNasdaqEarningsDay(dateIso: string): Promise<EarningsRow[]> {
  try {
    const res = await fetch(`${NASDAQ_CALENDAR_URL}?date=${dateIso}`, {
      headers: { accept: "application/json", "user-agent": NASDAQ_UA },
      signal: AbortSignal.timeout(6_000),
      next: { revalidate: 3_600 },
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as {
      data?: { rows?: Array<{ symbol?: string; marketCap?: string; time?: string }> };
    };
    return (payload.data?.rows ?? [])
      .filter((row): row is { symbol: string; marketCap?: string; time?: string } => !!row.symbol)
      .map((row) => {
        const session = sessionOf(row.time);
        return {
          symbol: row.symbol.toUpperCase(),
          marketCapUsd: parseMarketCap(row.marketCap),
          ...(session ? { session } : {}),
        };
      });
  } catch {
    return [];
  }
}

/** 어닝 필터·랭크(순수) — 발견 유니버스(한글명 보유) 우선, 그 외엔 메가캡만. 시총순 상한. */
export function selectDayEarnings(rows: readonly EarningsRow[]): CalendarStockRef[] {
  return rows
    .map((row) => ({ row, seed: usDiscoverySeedForSymbol(row.symbol) }))
    .filter(({ row, seed }) => seed || row.marketCapUsd >= MEGA_CAP_FLOOR_USD)
    .sort((a, b) => b.row.marketCapUsd - a.row.marketCapUsd)
    .slice(0, MAX_EARNINGS_PER_DAY)
    .map(({ row, seed }) => ({
      canonical: seed?.canonical ?? row.symbol,
      symbol: row.symbol,
      ...(row.session ? { session: row.session } : {}),
    }));
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 주간 캘린더 합성(순수) — 어닝 + 매크로 일정을 날짜 그룹으로. 이벤트 없는 날은 생략(정직). */
export function composeWeeklyCalendar(
  todayIso: string,
  earningsByDate: ReadonlyMap<string, readonly CalendarStockRef[]>,
  macroEvents: ReadonlyArray<{ date: string; label: string; detail: string }>
): WeeklyCalendar {
  const days: CalendarDay[] = [];
  for (let offset = 0; offset < CALENDAR_WINDOW_DAYS; offset += 1) {
    const date = addDays(todayIso, offset);
    const events: CalendarEvent[] = [];
    for (const macro of macroEvents.filter((event) => event.date === date)) {
      events.push({ kind: "macro", title: macro.label, detail: macro.detail });
    }
    const stocks = earningsByDate.get(date) ?? [];
    if (stocks.length > 0) {
      events.push({ kind: "earnings", title: "실적 발표", stocks: [...stocks] });
    }
    if (events.length > 0) days.push({ date, events });
  }
  return { asOf: todayIso, days };
}

/** 크론 전용 — 7일치 어닝 fetch + 매크로 병합 → FeedContentCache 저장. */
export async function buildAndStoreWeeklyCalendar(): Promise<WeeklyCalendar> {
  const today = kstDate();
  const earningsByDate = new Map<string, CalendarStockRef[]>();
  for (let offset = 0; offset < CALENDAR_WINDOW_DAYS; offset += 1) {
    const date = addDays(today, offset);
    const rows = await fetchNasdaqEarningsDay(date);
    const selected = selectDayEarnings(rows);
    if (selected.length > 0) earningsByDate.set(date, selected);
  }
  const macro = upcomingMarketEvents(today, 20).filter((event) => event.date < addDays(today, CALENDAR_WINDOW_DAYS));
  const calendar = composeWeeklyCalendar(today, earningsByDate, macro);
  await writeFeedContent(`calendar:${today}`, calendar).catch(() => {});
  return calendar;
}

/** 요청 경로 read — 캐시만(외부 fetch 0). 오늘 것이 없으면 가장 최근 것(어제 빌드도 7일 창이라 유효). */
export async function readWeeklyCalendar(): Promise<WeeklyCalendar | null> {
  const rows = await readFeedContentByPrefix<WeeklyCalendar>("calendar:", 2).catch(
    () => [] as Array<{ id: string; row: WeeklyCalendar }>
  );
  const latest = rows.map((r) => r.row).find((row) => row?.days);
  return latest ?? null;
}
