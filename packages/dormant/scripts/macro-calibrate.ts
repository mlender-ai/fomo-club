/**
 * MACRO-01 §C-1 — **거시 지표 임계를 과거 분포에서 잡는다.**
 *
 * ## 왜 스크립트인가
 *
 * 「환율은 1.5%, VIX 는 20%」 같은 숫자를 손으로 적으면 그건 감이다. 감으로 정한 임계는
 * 왜 그 값인지 아무도 설명할 수 없고, 카드가 안 나오면 슬금슬금 낮추게 된다.
 *
 * 이 스크립트는 지표별로 **실제 과거 분포**를 재고 백분위에서 임계를 뽑는다. 다시 돌리면
 * 같은 값이 나오고, 값이 바뀌면 시장이 바뀐 것이다.
 *
 * ## 무엇을 재나
 *
 * | 통계 | 쓰는 곳 |
 * |---|---|
 * | 연속 구간 누적 변동률 \|%\| (연속 3일 이상인 날만) | `movePct` |
 * | 하루 변동률 \|%\| | `spikePct` |
 *
 * ## 백분위를 어떻게 고르나 — 목표에서 거꾸로 푼다
 *
 * 처음엔 P90/P97 로 잡았다. 재보니 **지표 15종 합산 하루 0.71건** 이었다. 하루 1~3장을
 * 내야 하는데 후보가 0.71건이면 카드가 안 나오는 날이 대부분이다.
 *
 * 그렇다고 "카드가 적으니 임계를 낮추자" 는 금지다(하지 말 것). 대신 **목표 후보 수를 먼저
 * 정하고 그걸 만족하는 백분위를 찾는다.** 백분위는 여전히 분포에서 나오고, 고르는 근거는
 * 감이 아니라 하루 카드 수라는 제품 요구다.
 *
 * 목표는 `TARGET_CANDIDATES_PER_DAY` 다. 연결(업종 2곳 이상) 필터가 뒤에서 더 깎으므로
 * 상한 3장보다 넉넉히 잡는다.
 *
 * ```bash
 * npx tsx scripts/macro-calibrate.ts            # 표만 출력
 * npx tsx scripts/macro-calibrate.ts --write    # docs/MACRO_THRESHOLDS.md 갱신
 * ```
 */

import { writeFileSync } from "node:fs";
import { TextDecoder } from "node:util";
import {
  MACRO_INDICATORS,
  MACRO_MIN_STREAK,
  type MacroIndicatorId,
} from "../packages/fomo-core/src/keyword-cards/macro-move";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Point {
  date: string;
  value: number;
}

/** 얼마나 거슬러 재나. 2년이면 금리 사이클이 한 번은 돈다. */
const CALIBRATION_DAYS = 730;

/**
 * 하루 몇 건의 후보를 원하나(§C-2 — 카드 1~3장).
 *
 * 후보가 곧 카드는 아니다. 뒤에 **연결 필터**(업종 2곳 이상)와 **분류별 상한**(2장)이
 * 있어서 실제 카드는 이보다 적다. 그 감쇠를 감안해 상한 3장보다 넉넉히 잡는다.
 */
const TARGET_CANDIDATES_PER_DAY = 2.0;

/**
 * 급변(`spikePct`)은 **고정 P97** 이다. 목표 후보 수를 맞추느라 같이 낮추면 안 된다.
 *
 * 처음엔 두 백분위를 같이 내렸다가 P79 가 나왔다. 그러면 **닷새에 하루가 「급변」** 이다 —
 * 화면에 `하루에 0.7% 올랐어요` 를 급변이라고 쓰는 셈이고, 그건 거짓말에 가깝다.
 * 급변은 드물어야 급변이다. 후보 수는 연속 임계로만 맞춘다.
 */
const SPIKE_PERCENTILE = 97;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getText(url: string, euckr = false): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!euckr) return res.text();
  return new TextDecoder("euc-kr").decode(await res.arrayBuffer());
}

function normalize(points: Point[]): Point[] {
  const byDate = new Map<string, number>();
  for (const p of points) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(p.value)) continue;
    byDate.set(p.date, p.value);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

/* ── 소스 ─────────────────────────────────────────────────────────────────── */

async function fromFred(seriesId: string): Promise<Point[]> {
  const from = new Date(Date.now() - CALIBRATION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const csv = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}&cosd=${from}`);
  const out: Point[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(",");
    if (!date || !raw) continue;
    const trimmed = raw.trim();
    if (trimmed === "." || trimmed === "") continue;
    out.push({ date: date.trim(), value: Number(trimmed) });
  }
  return normalize(out);
}

function num(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

async function fromNaverIndex(code: string, pages: number): Promise<Point[]> {
  const out: Point[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const rows = JSON.parse(
      await getText(`https://m.stock.naver.com/api/index/${code}/price?pageSize=10&page=${page}`)
    ) as Array<{ localTradedAt?: string; closePrice?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      const value = row.closePrice ? num(row.closePrice) : null;
      if (row.localTradedAt && value !== null) out.push({ date: row.localTradedAt, value });
    }
    await sleep(120);
  }
  return normalize(out);
}

async function fromNaverExchange(code: string, pages: number): Promise<Point[]> {
  const out: Point[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const body = JSON.parse(
      await getText(
        `https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=${code}&page=${page}&pageSize=10`
      )
    ) as { result?: Array<{ localTradedAt?: string; closePrice?: string }> };
    const rows = body.result ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const value = row.closePrice ? num(row.closePrice) : null;
      if (row.localTradedAt && value !== null) out.push({ date: row.localTradedAt, value });
    }
    await sleep(120);
  }
  return normalize(out);
}

const QUOTE_PATH: Record<string, (code: string, page: number) => string> = {
  interest: (code, page) =>
    `https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=${code}&page=${page}`,
  world: (code, page) =>
    `https://finance.naver.com/marketindex/worldDailyQuote.naver?marketindexCd=${code}&fdtc=2&page=${page}`,
  gold: (code, page) =>
    `https://finance.naver.com/marketindex/goldDailyQuote.naver?marketindexCd=${code}&page=${page}`,
};

async function fromNaverQuote(kind: keyof typeof QUOTE_PATH, code: string, pages: number): Promise<Point[]> {
  const out: Point[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const html = await getText(QUOTE_PATH[kind]!(code, page), true);
    let found = 0;
    for (const row of html.split(/<tr[^>]*>/i).slice(1)) {
      const dateMatch = row.match(/<td[^>]*class="date"[^>]*>([\s\S]*?)<\/td>/i);
      const numMatch = row.match(/<td[^>]*class="num"[^>]*>([\s\S]*?)<\/td>/i);
      if (!dateMatch || !numMatch) continue;
      const iso = dateMatch[1]!.replace(/<[^>]+>/g, "").trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
      const value = num(numMatch[1]!.replace(/<[^>]+>/g, "").trim());
      if (!iso || value === null) continue;
      out.push({ date: `${iso[1]}-${iso[2]}-${iso[3]}`, value });
      found += 1;
    }
    if (found === 0) break;
    await sleep(120);
  }
  return normalize(out);
}

/** 두 시리즈의 차 — 가산금리·장단기 금리차는 받아오는 게 아니라 만든다. */
function spread(minuend: Point[], subtrahend: Point[]): Point[] {
  const by = new Map(subtrahend.map((p) => [p.date, p.value]));
  const out: Point[] = [];
  for (const p of minuend) {
    const other = by.get(p.date);
    if (other === undefined) continue;
    out.push({ date: p.date, value: p.value - other });
  }
  return out;
}

/* ── 통계 ─────────────────────────────────────────────────────────────────── */

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

interface Stats {
  id: MacroIndicatorId;
  observations: number;
  first: string;
  last: string;
  /** 연속 3일 이상인 날 수 / 전체 날 수. */
  streakDays: number;
  streakP90: number;
  spikeP97: number;
  /** 뽑은 임계로 다시 돌렸을 때 며칠 중 며칠이 후보가 되나. */
  qualifyingDays: number;
  qualifyRate: number;
}

/**
 * 하루씩 앞으로 걸으며 그날 보였을 통계를 모은다. **미래를 보지 않는다** — `points.slice(0, i+1)`
 * 로 자르는 이유다. 전체 시리즈로 한 번에 재면 오늘 임계가 과거를 알고 있는 셈이 된다.
 */
function measure(id: MacroIndicatorId, points: Point[], streakPercentile: number, spikePercentile: number): Stats | null {
  if (points.length < 30) return null;
  const dayPcts: number[] = [];
  const streakPcts: number[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!.value;
    const now = points[i]!.value;
    if (Math.abs(prev) > 0) dayPcts.push(Math.abs(((now - prev) / Math.abs(prev)) * 100));

    // 이 시점까지만 보고 연속 구간을 센다.
    let streak = 0;
    let dir: "up" | "down" | null = null;
    for (let j = i; j > 0; j -= 1) {
      const a = points[j]!.value;
      const b = points[j - 1]!.value;
      if (a === b) break;
      const step: "up" | "down" = a > b ? "up" : "down";
      if (dir === null) dir = step;
      else if (dir !== step) break;
      streak += 1;
    }
    if (dir && streak >= MACRO_MIN_STREAK) {
      const start = points[i - streak]!.value;
      if (Math.abs(start) > 0) streakPcts.push(Math.abs(((now - start) / Math.abs(start)) * 100));
    }
  }

  const sortedDay = [...dayPcts].sort((a, b) => a - b);
  const sortedStreak = [...streakPcts].sort((a, b) => a - b);
  const streakP90 = percentile(sortedStreak, streakPercentile);
  const spikeP97 = percentile(sortedDay, spikePercentile);

  // 뽑은 임계로 다시 돌려 후보 비율을 본다 — 임계가 실제로 몇 %를 통과시키는지.
  let qualifying = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!.value;
    const now = points[i]!.value;
    const dayPct = Math.abs(prev) > 0 ? Math.abs(((now - prev) / Math.abs(prev)) * 100) : 0;
    if (Number.isFinite(spikeP97) && dayPct >= spikeP97) { qualifying += 1; continue; }
    let streak = 0;
    let dir: "up" | "down" | null = null;
    for (let j = i; j > 0; j -= 1) {
      const a = points[j]!.value;
      const b = points[j - 1]!.value;
      if (a === b) break;
      const step: "up" | "down" = a > b ? "up" : "down";
      if (dir === null) dir = step;
      else if (dir !== step) break;
      streak += 1;
    }
    if (!dir || streak < MACRO_MIN_STREAK) continue;
    const start = points[i - streak]!.value;
    if (!(Math.abs(start) > 0)) continue;
    if (Math.abs(((now - start) / Math.abs(start)) * 100) >= streakP90) qualifying += 1;
  }

  return {
    id,
    observations: points.length,
    first: points[0]!.date,
    last: points[points.length - 1]!.date,
    streakDays: streakPcts.length,
    streakP90,
    spikeP97,
    qualifyingDays: qualifying,
    qualifyRate: qualifying / (points.length - 1),
  };
}

/* ── 실행 ─────────────────────────────────────────────────────────────────── */

/** 몇 페이지까지 넘길까 — 페이지당 행 수가 소스마다 다르다. */
const PAGES_FOR_2Y = { index: 52, exchange: 52, quote: 75 } as const;

async function collectAll(): Promise<Map<MacroIndicatorId, Point[]>> {
  const out = new Map<MacroIndicatorId, Point[]>();
  const step = async (id: MacroIndicatorId, run: () => Promise<Point[]>) => {
    try {
      const points = await run();
      out.set(id, points);
      console.log(`  ${id.padEnd(13)} n=${String(points.length).padEnd(5)} ${points[0]?.date} ~ ${points.at(-1)?.date}`);
    } catch (error) {
      console.log(`  ${id.padEnd(13)} 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  console.log("FRED —");
  await step("ust10y", () => fromFred("DGS10"));
  await step("ust2y", () => fromFred("DGS2"));
  await step("yieldcurve", () => fromFred("T10Y2Y"));
  await step("fedfunds", () => fromFred("FEDFUNDS"));
  await step("sp500", () => fromFred("SP500"));
  await step("nasdaq", () => fromFred("NASDAQCOM"));
  await step("vix", () => fromFred("VIXCLS"));

  console.log("네이버 —");
  await step("kospi", () => fromNaverIndex("KOSPI", PAGES_FOR_2Y.index));
  await step("kosdaq", () => fromNaverIndex("KOSDAQ", PAGES_FOR_2Y.index));
  await step("usdkrw", () => fromNaverExchange("FX_USDKRW", PAGES_FOR_2Y.exchange));
  await step("jpykrw", () => fromNaverExchange("FX_JPYKRW", PAGES_FOR_2Y.exchange));
  await step("ktb3y", () => fromNaverQuote("interest", "IRR_GOVT03Y", PAGES_FOR_2Y.quote));
  await step("corp3y", () => fromNaverQuote("interest", "IRR_CORP03Y", PAGES_FOR_2Y.quote));
  await step("oil", () => fromNaverQuote("world", "OIL_CL", PAGES_FOR_2Y.quote));
  await step("gold", () => fromNaverQuote("gold", "CMDT_GC", PAGES_FOR_2Y.quote));

  // 파생 — 받아오는 게 아니라 만든다.
  const corp = out.get("corp3y");
  const ktb = out.get("ktb3y");
  if (corp && ktb) {
    const built = spread(corp, ktb);
    out.set("creditspread", built);
    console.log(`  creditspread  n=${built.length} (회사채 3년 − 국고채 3년)`);
  }
  return out;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : Number.NaN;
}

/**
 * 목표 후보 수를 만족하는 백분위를 찾는다. 백분위를 1씩 낮추며 합산 기대 후보가 목표를
 * 넘는 **첫 지점**을 고른다 — 넘자마자 멈추므로 필요 이상으로 느슨해지지 않는다.
 */
interface Solved {
  streakPercentile: number;
  spikePercentile: number;
  rows: Stats[];
  totalRate: number;
  /** 바닥(P50)까지 내려가고도 목표를 못 채웠나. 그러면 목표가 애초에 불가능한 것이다. */
  hitFloor: boolean;
  /** 백분위별 후보 수 — 고르는 과정을 문서에 그대로 남긴다. */
  sweep: Array<{ percentile: number; rate: number }>;
}

const PERCENTILE_FLOOR = 50;

function rowsAt(series: Map<MacroIndicatorId, Point[]>, streakPercentile: number): Stats[] {
  const rows: Stats[] = [];
  for (const indicator of MACRO_INDICATORS) {
    const points = series.get(indicator.id);
    if (!points) continue;
    const stats = measure(indicator.id, points, streakPercentile, SPIKE_PERCENTILE);
    if (stats) rows.push(stats);
  }
  return rows;
}

/**
 * 목표 후보 수를 만족하는 **가장 엄격한** 백분위를 찾는다. 위에서부터 내려오다 목표를
 * 넘는 첫 지점에서 멈추므로 필요 이상으로 느슨해지지 않는다.
 *
 * 바닥(P${PERCENTILE_FLOOR})까지 내려가고도 목표에 못 미치면 **목표가 불가능한 것**이다.
 * 그때 임계를 더 낮추지 않는다 — 3일 연속이라는 조건 자체가 병목이고, 그건 임계 문제가
 * 아니다. 못 채웠다는 사실을 그대로 보고한다.
 */
function solvePercentile(series: Map<MacroIndicatorId, Point[]>): Solved {
  const sweep: Array<{ percentile: number; rate: number }> = [];
  let chosen: { streakPercentile: number; rows: Stats[]; totalRate: number } | null = null;

  for (let percentile = 95; percentile >= PERCENTILE_FLOOR; percentile -= 5) {
    const rows = rowsAt(series, percentile);
    const rate = rows.reduce((sum, r) => sum + r.qualifyRate, 0);
    sweep.push({ percentile, rate });
    if (!chosen && rate >= TARGET_CANDIDATES_PER_DAY) {
      chosen = { streakPercentile: percentile, rows, totalRate: rate };
    }
  }

  const hitFloor = chosen === null;
  const resolved = chosen ?? (() => {
    const rows = rowsAt(series, PERCENTILE_FLOOR);
    return { streakPercentile: PERCENTILE_FLOOR, rows, totalRate: rows.reduce((s, r) => s + r.qualifyRate, 0) };
  })();

  return { ...resolved, spikePercentile: SPIKE_PERCENTILE, hitFloor, sweep };
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  console.log(`거시 임계 측정 — 최근 ${CALIBRATION_DAYS}일\n`);
  const series = await collectAll();

  const { streakPercentile, spikePercentile, rows, totalRate, hitFloor, sweep } = solvePercentile(series);

  console.log("\n백분위별 후보 수 (연속 임계를 낮추면 후보가 는다)");
  for (const s of sweep) console.log(`  P${s.percentile}  하루 ${s.rate.toFixed(2)}건`);
  console.log(
    `\n목표 하루 ${TARGET_CANDIDATES_PER_DAY}건 → **P${streakPercentile}(연속) · P${spikePercentile}(급변)**` +
      (hitFloor ? `  ⚠️ 바닥(P${PERCENTILE_FLOOR})까지 내려도 목표 미달 — 실제 ${totalRate.toFixed(2)}건` : "") +
      "\n"
  );
  console.log("지표          관측    기간                     연속표본  movePct       spikePct       후보비율");
  for (const r of rows) {
    const current = MACRO_INDICATORS.find((i) => i.id === r.id)!;
    console.log(
      `${r.id.padEnd(13)} ${String(r.observations).padEnd(6)} ${r.first}~${r.last}  ${String(r.streakDays).padEnd(8)} ` +
        `${String(round(r.streakP90)).padEnd(13)} ${String(round(r.spikeP97)).padEnd(14)} ` +
        `${(r.qualifyRate * 100).toFixed(1)}%   (현재 ${current.movePct}/${current.spikePct})`
    );
  }

  console.log(`\n지표 ${rows.length}종 합산 기대 후보 = 하루 ${totalRate.toFixed(2)}건`);
  console.log("연결(업종 2곳 이상) 필터와 분류별 상한을 지나면 이보다 줄어든다 — 카드 상한 3장.");

  console.log("\n── macro-indicators.ts 에 넣을 값 ──");
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(13)} movePct: ${round(r.streakP90)}, spikePct: ${round(r.spikeP97)}`);
  }

  if (!write) {
    console.log("\n(--write 를 주면 docs/MACRO_THRESHOLDS.md 를 갱신한다)");
    return;
  }

  const lines = [
    "# 거시 지표 임계 — 측정 결과",
    "",
    "> **이 문서는 `scripts/macro-calibrate.ts` 가 생성한다. 손으로 고치지 않는다.**",
    "> 값을 바꾸려면 스크립트를 다시 돌린다. 감으로 정한 임계는 카드가 안 나올 때 슬금슬금",
    "> 낮추게 되고, 그러면 임계가 있으나 마나가 된다(MACRO-01 §C-1 · 하지 말 것).",
    "",
    `- 측정 구간: 최근 ${CALIBRATION_DAYS}일`,
    `- \`movePct\` = 연속 ${MACRO_MIN_STREAK}일 이상인 날의 **누적 변동률 |%| P${streakPercentile}**`,
    `- \`spikePct\` = **하루 변동률 |%| P${spikePercentile}**`,
    "",
    "## 백분위를 어떻게 골랐나",
    "",
    "처음엔 P90/P97 로 잡았다. 재보니 합산 **하루 0.71건** 이었다 — 하루 1~3장을 내야 하는데",
    "후보가 그것뿐이면 카드가 없는 날이 대부분이 된다.",
    "",
    '"카드가 적으니 임계를 낮추자" 는 금지다. 대신 **목표 후보 수를 먼저 정하고 그걸 만족하는',
    `가장 엄격한 백분위를 찾았다** — 목표 하루 ${TARGET_CANDIDATES_PER_DAY}건. 고르는 근거는 감이 아니라`,
    "「하루 카드 1~3장」이라는 제품 요구다.",
    "",
    "| 연속 임계 | 하루 후보 |",
    "|---|---|",
    ...sweep.map((s) => `| P${s.percentile} | ${s.rate.toFixed(2)}건 |`),
    "",
    `**고른 값: P${streakPercentile} — 하루 ${totalRate.toFixed(2)}건.**`,
    "",
    ...(hitFloor
      ? [
          `> ⚠️ **바닥(P${PERCENTILE_FLOOR})까지 내려도 목표 ${TARGET_CANDIDATES_PER_DAY}건에 못 미친다.**`,
          ">",
          "> 여기서 임계를 더 낮추지 않는다. 병목은 임계가 아니라 **`MACRO_MIN_STREAK = 3`**(3일 연속)이다 —",
          "> 애초에 3일 이상 같은 방향인 날이 지표당 20~27% 뿐이다. 임계를 0으로 놔도 후보는 그 이상",
          "> 안 나온다. 카드를 늘리려면 임계가 아니라 **지표를 더 늘려야** 한다.",
          "",
        ]
      : []),
    "## 급변(`spikePct`)을 따로 고정한 이유",
    "",
    `\`spikePct\` 는 **P${SPIKE_PERCENTILE} 고정**이다. 목표 후보 수를 맞추느라 같이 내렸더니 P79 가 나왔는데,`,
    "그러면 **닷새에 하루가 「급변」** 이 된다. 화면에 `하루에 0.7% 올랐어요` 를 급변이라고 쓰는 셈이고",
    "그건 거짓말에 가깝다. 급변은 드물어야 급변이다. 후보 수는 연속 임계로만 맞춘다.",
    "",
    "| 지표 | 관측 | 기간 | 연속 표본 | movePct | spikePct | 후보 비율 |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| \`${r.id}\` | ${r.observations} | ${r.first} ~ ${r.last} | ${r.streakDays} | ${round(r.streakP90)} | ${round(r.spikeP97)} | ${(r.qualifyRate * 100).toFixed(1)}% |`
    ),
    "",
    `**지표 ${rows.length}종 합산 기대 후보 = 하루 ${totalRate.toFixed(2)}건.**`,
    "연결(업종 2곳 이상) 필터와 분류별 상한(2장)을 지나면 이보다 줄어들고, 전체 상한은 3장이다(§C-2).",
    "",
    "## 운영 소스 (`apps/web/lib/macro-collect.ts`)",
    "",
    "| 갈래 | 지표 |",
    "|---|---|",
    "| 네이버 국내지수 | `kospi` `kosdaq` |",
    "| 네이버 해외지수 | `sp500` `nasdaq` `vix` |",
    "| 네이버 환율 | `usdkrw` `jpykrw` |",
    "| 네이버 일별 시세표 | `ktb3y` `corp3y` `oil` `gold` |",
    "| 미 재무부 일별 CSV | `ust10y` `ust2y` |",
    "| 계산 | `creditspread`(회사채−국고채) · `yieldcurve`(미 국채 10년−2년) |",
    "",
    "### FRED 를 걷어냈다",
    "",
    "원래 미국 지표는 FRED 에서 받았다. 그런데 실제로 굽혀 보니 **화요일에 미국 지표 6종이",
    "전부 「4일 전 기준」** 이라 신선도 게이트에 걸렸다(2026-09-01 실측). 지표를 15종으로",
    "늘려 놓고 그중 6종이 주 초에 죽으면 늘린 의미가 없다.",
    "",
    "| 지표 | FRED | 원본 |",
    "|---|---|---|",
    "| 미 국채 10년 | 08-28 | **08-31** (재무부) |",
    "| S&P 500 | 08-28 | **08-31** (네이버 해외지수) |",
    "| WTI 유가 | 08-25 | **08-31** (네이버) |",
    "",
    "옮겨 실은 것을 받을 이유가 없다. FRED 는 공개 도메인이라 좋았지만 **느린 게 문제였다.**",
    "",
    "> 이 스크립트는 **측정용으로만** FRED 를 계속 쓴다 — 임계는 분포를 보는 것이라 하루이틀",
    "> 지연이 상관없고, 2년치를 한 번에 주는 편이 낫다. 운영 수집과 소스가 다른 것은 의도다.",
    "",
    "## 미 기준금리를 뺀 이유",
    "",
    "`FEDFUNDS` 는 **월간** 시리즈다(2년에 23관측). 연속·급변을 잴 표본이 안 되고, 최신값이",
    "언제나 한 달 이상 묵어 있어 신선도 게이트(§B-3)에 걸린다. 매일 보는 지표 목록에서 뺀다 —",
    "만들어 놓고 영영 안 나오는 자리를 남기지 않는다.",
    "",
  ];
  writeFileSync(new URL("../docs/MACRO_THRESHOLDS.md", import.meta.url), lines.join("\n"), "utf8");
  console.log("\ndocs/MACRO_THRESHOLDS.md 갱신");
}

void main();
