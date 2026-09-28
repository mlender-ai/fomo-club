/**
 * 주식 정규장 · 휴장일 (OPS-03 A-1 · C) — 순수 함수.
 *
 * **주식은 장외 시간에 알림을 내지 않는다**, 유효일도 정규장만 센다. 그래서 랩이 장 시간을 스스로 안다 —
 * FCE 가 주는 `market_state` 만 믿으면 FCE 가 멈춘 순간의 상태(예: `closed`)로 굳어 버려 멈춤을 못 잡는다.
 *
 * 날짜는 FCE `app/worker/market_calendar.py` 의 **확정** 목록과 같다(2026). 거기 `확인 필요` 는 넣지 않는다.
 * 바꾸면 둘 다 바꾼다.
 */

export type StockMarket = "KR" | "US";

/** KRX 확정 휴장일 (FCE `KR_CONFIRMED` · OPS-02 B-2 로 9일 추가). */
export const KR_HOLIDAYS: ReadonlySet<string> = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-01", "2026-05-05",
  "2026-05-25", "2026-06-06", "2026-07-17", "2026-08-15", "2026-08-17", "2026-09-24", "2026-09-25", "2026-10-03",
  "2026-10-05", "2026-10-09", "2026-12-25", "2026-12-31",
]);

/** NYSE 확정 휴장일 (FCE `US_CONFIRMED`). */
export const US_HOLIDAYS: ReadonlySet<string> = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
  "2026-11-26", "2026-12-25",
]);

/** NYSE 조기 폐장 — 뉴욕 시각 13:00. */
export const US_EARLY_CLOSES: ReadonlySet<string> = new Set(["2026-07-02", "2026-11-27", "2026-12-24"]);

const MINUTE = 60_000;

/** 그 시각의 뉴욕 벽시계 − UTC (분). 서머타임을 `Intl` 에 맡긴다. */
function nyOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((wall - Math.floor(at.getTime() / MINUTE) * MINUTE) / MINUTE);
}

/** 시장 현지 날짜 `YYYY-MM-DD`. */
export function localDay(market: StockMarket, at: Date): string {
  const offset = market === "KR" ? 9 * 60 : nyOffsetMinutes(at);
  return new Date(at.getTime() + offset * MINUTE).toISOString().slice(0, 10);
}

/** 그 현지 날짜의 정규장 [열림, 닫힘] (UTC). 휴장 · 주말이면 null. */
export function sessionOf(market: StockMarket, day: string): { open: Date; close: Date } | null {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (weekday === 0 || weekday === 6) return null;
  if ((market === "KR" ? KR_HOLIDAYS : US_HOLIDAYS).has(day)) return null;
  if (market === "KR") {
    // 09:00 ~ 15:30 KST = 00:00 ~ 06:30 UTC
    return { open: new Date(Date.UTC(y, m - 1, d, 0, 0)), close: new Date(Date.UTC(y, m - 1, d, 6, 30)) };
  }
  // 09:30 ~ 16:00 뉴욕. 그날 정오의 오프셋을 쓴다(서머타임 전환은 새벽 2시라 장중에 바뀌지 않는다).
  const offset = nyOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 16)));
  const at = (h: number, min: number) => new Date(Date.UTC(y, m - 1, d, h, min) - offset * MINUTE);
  return { open: at(9, 30), close: US_EARLY_CLOSES.has(day) ? at(13, 0) : at(16, 0) };
}

/** 지금 정규장 안인가. */
export function inSession(market: StockMarket, at: Date): boolean {
  const s = sessionOf(market, localDay(market, at));
  return s !== null && at >= s.open && at < s.close;
}
