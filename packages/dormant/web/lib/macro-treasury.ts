/**
 * MACRO-01 §B — **미 국채 금리를 재무부에서 직접 받는다.**
 *
 * ## 왜 FRED 를 안 쓰나
 *
 * FRED 의 `DGS10`·`DGS2` 는 재무부 발표를 하루이틀 늦게 옮겨 싣는다. 2026-09-01 실측:
 *
 * ```
 * FRED DGS10   08-28  4.73
 * 재무부        08-31  4.75      ← 하루 빠르다
 * ```
 *
 * 화·수요일이면 그 차이가 신선도 게이트(§B-3)를 가른다. 원본이 더 빠른데 굳이 옮겨 실은
 * 것을 받을 이유가 없다.
 *
 * ## 형식
 *
 * 연도별 CSV 한 방이면 그 해가 다 온다. 헤더가 `Date,"1 Mo",…,"2 Yr",…,"10 Yr",…` 이고
 * 날짜는 `MM/DD/YYYY` 다. **열 이름으로 찾는다** — 위치로 세면 재무부가 만기 하나만 추가해도
 * 우리 금리가 통째로 바뀐다(`1.5 Month` 가 그렇게 생겼다).
 */

import type { MacroPoint } from "./macro-naver";

const CSV_URL = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/";

/** CSV 한 줄을 따옴표까지 감안해 쪼갠다. `"1.5 Month"` 같은 헤더가 있다. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** `MM/DD/YYYY` → `YYYY-MM-DD`. 아니면 null. */
function toIso(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/**
 * 만기 하나의 시계열을 뽑는다. 열 이름은 `"2 Yr"` · `"10 Yr"` 처럼 온다.
 * 그 열이 없으면 **빈 배열** — 조용히 0으로 채우지 않는다.
 */
export function parseTreasuryCsv(csv: string, column: string): MacroPoint[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]!);
  const idx = header.indexOf(column);
  if (idx < 0) return [];

  const out: MacroPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const date = toIso(cells[0] ?? "");
    const raw = cells[idx];
    if (!date || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 그 해의 일별 국채 금리 전부. `year` 는 `today` 에서 뽑아 넘긴다(시계를 직접 안 본다). */
export async function fetchTreasuryYields(year: string, column: string): Promise<MacroPoint[]> {
  const url = `${CSV_URL}${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; FomoClubBot/1.0)" },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseTreasuryCsv(await res.text(), column);
}
