/**
 * LAB-BRIDGE PART B — FCE 를 읽어 랩으로 밀어 올린다.
 *
 * ```
 * FCE API (127.0.0.1:8875)  ──▶  이 스크립트  ──▶  LAB /api/lab/fce  ──▶  화면
 * ```
 *
 * ## FCE 레포를 건드리지 않았다
 *
 * 지시서 B-3 은 "FCE 쪽에 업로드 스크립트 하나만 붙인다" 였다. 그런데 FCE 의 API 가
 * 이 맥에서 열려 있어서 **읽는 쪽을 이 레포에 두면 FCE 변경이 0** 이다.
 * 같은 결과에 건드릴 레포가 하나 적다.
 *
 * ## 계산하지 않는다 — 옮긴다
 *
 * 승률·PF·MDD 를 여기서 다시 재지 않는다. FCE 가 낸 값을 그대로 옮긴다.
 * 랩이 다시 계산하면 두 화면이 서로 다른 말을 하고, 그때 어느 쪽이 맞는지
 * 아무도 모른다.
 *
 * **모르는 값은 null 로 보낸다.** 폴리마켓 평가액이 그렇다(451 차단으로 산출 불가) —
 * 0 으로 채우면 자본이 틀리게 계산된다.
 *
 *   npm run lab:fce-upload                    # 한 번
 *   npm run lab:fce-upload -- --watch         # 15분마다
 *   npm run lab:fce-upload -- --dry           # 올리지 않고 무엇을 올릴지만
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CHART_TIMEFRAMES, positionFromOpenTrade, shortAddress, walletKey } from "../../apps/web/lib/lab/fce-payload";
import type {
  ChartPayload,
  ChartTimeframe,
  FcePayload,
  LostDayPayload,
  PositionPayload,
  TradePayload,
  TrackPayload,
  TrackStatus,
  WhaleBoard,
  WhalePayload,
} from "../../apps/web/lib/lab/fce-payload";

const FCE = process.env.FCE_BASE_URL ?? "http://127.0.0.1:8875";
const LAB = process.env.LAB_BASE_URL ?? "https://fomo-web-mlender-ais-projects.vercel.app";
const TOKEN = process.env.LAB_INGEST_TOKEN ?? "";

/** PART B-2 — 15분. */
const INTERVAL_MS = 15 * 60 * 1000;

const DRY = process.argv.includes("--dry");

/**
 * 올릴 페이로드를 **그대로 찍는다**. 올리지는 않는다.
 *
 * 인제스트가 느리거나 죽을 때 "무엇을 보냈길래" 를 손에 쥐고 좁히려면 이게 있어야
 * 한다. 실제로 거래 이력을 붙이자마자 라우트가 타임아웃났는데, 페이로드를 못 꺼내서
 * 어디가 느린지 이등분을 못 했다.
 */
const EMIT = process.argv.find((a) => a.startsWith("--emit"));
/** `--emit=/tmp/payload.json` — 파일 경로. 없으면 `/tmp/fce-payload.json`. */
const EMIT_PATH = EMIT?.includes("=") ? EMIT.slice(EMIT.indexOf("=") + 1) : "/tmp/fce-payload.json";
const WATCH = process.argv.includes("--watch");

/**
 * FCE 호출 하나의 제한. 60초였다.
 *
 * 2026-09-26 FCE 가 CPU 468% 로 과부하였을 때 `follow/eligibility` 하나가 **40초**, `paper/dashboard`
 * 가 **20초** 걸렸다. 60초 제한에 일곱 개를 동시에 부르니 서로 CPU 를 뺏어 제한을 넘기고 업로드가
 * 통째로 죽었다 — 06:07 부터 한 시간 넘게.
 */
const FCE_TIMEOUT_MS = 150_000;

/**
 * FCE 한 번. **실패하면 어느 경로였는지를 붙인다** — 러너 로그에는 "The operation was aborted due to timeout"
 * 한 줄만 남아서, 과부하 때 어느 요청이 한도를 넘었는지 알 수 없었다.
 */
async function fce(path: string): Promise<unknown> {
  const started = Date.now();
  try {
    const response = await fetch(`${FCE}${path}`, { signal: AbortSignal.timeout(FCE_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${response.status}`);
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FCE ${path} — ${message} (${Math.round((Date.now() - started) / 1000)}초)`);
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ── 트랙 조립 ────────────────────────────────────────────────────────────────

/** 크립토 — `/api/paper/dashboard` 의 `scoreboard.engine`. */
function cryptoTrack(dashboard: Record<string, unknown>, asOf: string): TrackPayload {
  const scoreboard = record(dashboard.scoreboard);
  const engine = record(scoreboard.engine);
  const capital = record(record(record(dashboard.capital).tracks).crypto);
  const open = Array.isArray(dashboard.open_trades) ? dashboard.open_trades : [];

  // 레버리지는 **보유 포지션에서 실측한다.** 설정값(`paper_leverage`)은 환경변수로
  // 덮일 수 있어서, 화면에 띄울 값은 실제로 열려 있는 포지션이 쓰는 배수여야 한다.
  const leverages = open.map((t) => num(record(t).leverage)).filter((v): v is number => v !== null);
  const leverage = leverages.length > 0 ? Math.max(...leverages) : null;

  return {
    key: "crypto",
    label: "크립토",
    currency: String(capital.currency ?? "USDT"),
    startingCapital: num(engine.capital_usdt) ?? num(capital.starting_capital) ?? 0,
    currentCapital: num(capital.current_capital),
    realized: num(engine.net_pnl_usdt),
    unrealized: num(capital.unrealized),
    // **자본과 같은 기준의 수익률**을 쓴다. `engine.return_on_capital_pct` 는 검증 창(07-18~)
    // 안의 거래만 센 값이라, 자본(전체 거래) 옆에 두면 한 행이 두 모집단을 말한다 —
    // 실측 −29.50% 자리에 −28.79% 가 나갈 뻔했다.
    returnPct: num(capital.return_on_capital_pct) ?? num(engine.return_on_capital_pct),
    trades: num(engine.trade_count),
    winRatePct: num(engine.win_rate_pct),
    profitFactor: num(engine.profit_factor),
    mddPct: num(engine.mdd_pct),
    sampleNote: engine.sample_sufficient === false ? "표본 부족" : null,
    status: "running",
    statusReason: null,
    leverage,
    benchmarkLabel: "BTC 보유",
    benchmarkStart: null,
    benchmarkCurrent: null,
    benchmarkReturnPct: null,
    evidenceNote: null,
    // FCE 가 이 트랙에는 유효일을 내지 않는다. **0 으로 채우지 않는다.**
    elapsedDays: null,
    calendarDays: null,
    asOf,
  };
}

/** 고래 추종 시작 자본. FCE 트랙 설정값이다. */
const WHALE_START = 500;

/** 고래 추종 — `/api/onchain/follow/trades` 의 `performance.buckets.follow`. */
function whaleTrack(follow: Record<string, unknown>, asOf: string): TrackPayload {
  const bucket = record(record(record(follow.performance).buckets).follow);
  return {
    key: "whale",
    label: "고래 추종",
    currency: "USDT",
    startingCapital: WHALE_START,
    // FCE 는 고래 트랙에 `capital` 블록을 안 준다. 다른 네 트랙의 FCE 자본이 전부
    // **"시작 자본 + 실현 손익"**(`current_capital_basis: realized`)이라, 같은 정의를 FCE 가
    // 낸 실현 손익(`net_usdt`)에 그대로 적용한다. 새로 계산하는 게 아니라 같은 기준으로 맞춘다.
    currentCapital: num(bucket.net_usdt) === null ? null : WHALE_START + (num(bucket.net_usdt) ?? 0),
    realized: num(bucket.net_usdt),
    unrealized: null,
    returnPct: num(bucket.net_usdt) === null ? null : ((num(bucket.net_usdt) ?? 0) / WHALE_START) * 100,
    trades: num(bucket.closed) ?? num(bucket.entries),
    winRatePct: num(bucket.win_pct),
    profitFactor: num(bucket.profit_factor),
    mddPct: null,
    // **고래 자신의 승률과 다른 모집단이다**(docs/lab/WHALE_GAP.md).
    sampleNote: "추종 트랙 성적 — 고래 자신의 승률과 다른 모집단",
    status: "running",
    statusReason: null,
    leverage: null,
    benchmarkLabel: null,
    benchmarkStart: null,
    benchmarkCurrent: null,
    benchmarkReturnPct: null,
    evidenceNote: null,
    // FCE 가 이 트랙에는 유효일을 내지 않는다. **0 으로 채우지 않는다.**
    elapsedDays: null,
    calendarDays: null,
    asOf,
  };
}

/**
 * 주식 US·KR — `/api/stock-paper/dashboard` 의 `tracks[]`.
 *
 * **FCE 가 이미 낸 값을 쓴다.** `nav`(평가액)·`engine_return_pct`·`benchmark_return_pct`
 * 가 그대로 있는데 현금에서 다시 계산하면 두 화면이 다른 말을 한다.
 * 정지 판정도 `halt` 객체가 갖고 있다 — 상태·사유·증거 메모까지.
 */
function stockTracks(dashboard: Record<string, unknown>, asOf: string): TrackPayload[] {
  const rows = Array.isArray(dashboard.tracks) ? dashboard.tracks : [];
  const capitalOf = record(record(dashboard.capital).tracks);
  const out: TrackPayload[] = [];
  for (const raw of rows) {
    const t = record(raw);
    const market = String(t.market ?? "");
    if (market !== "US" && market !== "KR") continue;

    const halt = record(t.halt);
    const stopped = halt.stopped === true;
    const sample = record(t.sample_breakdown);
    const navComplete = t.nav_complete === true;

    const key = market === "US" ? "stock_us" : "stock_kr";
    // **FCE 의 `capital` 블록을 쓴다** — 다섯 트랙이 같은 기준("시작 자본 + 실현 손익")이다.
    // 전에는 NAV(평가액)를 썼는데, 그러면 이 트랙만 미실현이 섞여 합산이 두 기준이 된다.
    const cap = record(capitalOf[key]);
    void navComplete;
    const held = stopped ? 0 : (queuedOrders(market) ?? 0);
    out.push({
      key,
      label: market === "US" ? "주식 US" : "주식 KR",
      currency: String(t.currency ?? ""),
      startingCapital: num(cap.starting_capital) ?? num(t.initial_cash) ?? 0,
      currentCapital: num(cap.current_capital),
      realized: null,
      unrealized: null,
      returnPct: num(cap.return_on_capital_pct),
      trades: num(sample.strategy_fills),
      winRatePct: null,
      profitFactor: null,
      mddPct: null,
      sampleNote:
        sample.strategy_sample_zero === true
          ? "전략 체결 0건 — 트랙 수익률은 탐색분을 포함한 계정 전체다"
          : (typeof sample.headline_note === "string" ? sample.headline_note : null),
      // FCE 리포트와 같은 순서다 — 정지가 먼저, 그다음 큐 보류.
      status: stopped ? "stopped" : held ? "held" : "running",
      statusReason: stopped
        ? `체결 invariant — ${String(halt.reason ?? "unknown")}`
        : held
          ? `봉 불일치 정지 예방 · 대기 주문 ${held.toLocaleString("en-US")}건`
          : null,
      leverage: null,
      benchmarkLabel: t.benchmark_index ? String(t.benchmark_index) : null,
      benchmarkStart: num(t.benchmark_start),
      benchmarkCurrent: num(t.benchmark_current),
      benchmarkReturnPct: num(t.benchmark_return_pct),
      evidenceNote:
        typeof halt.evidence_note === "string" ? halt.evidence_note : held ? QUEUE_HOLD_REASON : null,
      // 호스트가 자면 그 하루는 검증에 안 들어간다. FCE 가 이미 재고 있다.
      elapsedDays: num(t.elapsed_days),
      calendarDays: num(t.calendar_days),
      asOf,
    });
  }
  return out;
}

/**
 * 주식 트랙의 **큐 보류** 건수 (UI-04 D · E).
 *
 * FCE 는 트랙 상태를 `running` 으로 주지만, 설정(`stock_paper_hold_queued_orders`, 기본 켜짐)
 * 때문에 대기 주문을 **내보내지 않는다.** KR 은 마지막 체결이 08-05 이고 대기 주문이 1만 건을
 * 넘는다. 이걸 `운용중` 으로 세면 "운용중 트랙" 이 부풀려진다.
 *
 * 이 판정은 FCE 가 **자기 일일 리포트**에서 이미 한다(`notify/daily_report_source.py`) — 설정이
 * 켜져 있고 대기 주문이 있으면 `held · 봉 불일치 정지 예방 (N건)`. API 로는 안 나와서 같은
 * 쿼리로 DB 를 **읽기 전용**으로 본다. FCE 를 고치지 않는다.
 *
 * DB 를 못 읽으면 `null` — 그러면 FCE 가 준 상태를 그대로 둔다.
 */
function queuedOrders(market: "KR" | "US"): number | null {
  const path = process.env.FCE_DB_PATH ?? "/Users/cocteau/Documents/Fomo club engine/backend/fomo_control_engine.db";
  try {
    const out = execFileSync(
      "sqlite3",
      [
        "-readonly",
        path,
        `SELECT COUNT(*) FROM stock_paper_orders WHERE status='queued' AND json_extract(payload,'$.market')='${market}';`,
      ],
      { encoding: "utf8", timeout: 30_000 }
    );
    const n = Number(out.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** FCE 가 보류 사유로 쓰는 문장(`stock_paper/service.py`). 바꾸면 거기도 바꾼다. */
const QUEUE_HOLD_REASON =
  "체결가는 세션 시가에서 만들고 invariant 는 현재 분봉으로 검사한다 — 봉 불일치로 US 가 정지했다. 임시 방어이며 근본 수리는 별건이다.";

/** 폴리마켓 — `/api/poly-paper/dashboard`. */
function polyTrack(dashboard: Record<string, unknown>, asOf: string): TrackPayload {
  const track = record(dashboard.track);
  const unrealized = record(dashboard.unrealized);
  const cap = record(record(record(dashboard.capital).tracks).poly);
  const initial = num(cap.starting_capital) ?? num(track.initial_cash) ?? 0;
  const cash = num(track.cash);
  return {
    key: "polymarket",
    label: "폴리마켓",
    currency: String(track.currency ?? "USDC"),
    startingCapital: initial,
    // NAV(평가액)는 451 로 막혀 안 나온다. 그래도 FCE 가 **실현 기준 자본**은 낸다 —
    // 다른 네 트랙과 같은 기준이다. 전에는 `null` 로 올려 합산에서 빠졌는데, UI-02 C-4 가
    // "제외 트랙도 합산에 넣는다. 빼면 수익률이 좋아 보인다" 고 했다.
    currentCapital: num(cap.current_capital),
    realized: cash !== null ? cash - initial : null,
    unrealized: num(unrealized.pnl),
    returnPct: num(cap.return_on_capital_pct),
    // `resolution_count`(12,774)는 **시장 정산 건수**지 우리 거래 수가 아니다.
    // 처음에 그걸 N 으로 올렸다가 폴리마켓이 표본 1만 건짜리 트랙으로 보였다.
    trades: null,
    winRatePct: null,
    profitFactor: null,
    mddPct: null,
    sampleNote: "미실현은 확정 손익이 아니다 — 정산 손익과 합산하지 않는다",
    status: "excluded",
    statusReason: `451 지역 차단 · 평가 불가 보유 ${num(unrealized.open_positions) ?? 0}건 → NAV 미산출`,
    leverage: null,
    benchmarkLabel: null,
    benchmarkStart: null,
    benchmarkCurrent: null,
    benchmarkReturnPct: null,
    evidenceNote: null,
    // FCE 가 이 트랙에는 유효일을 내지 않는다. **0 으로 채우지 않는다.**
    elapsedDays: null,
    calendarDays: null,
    asOf,
  };
}

/** 보유 포지션 — 크립토 페이퍼. 칸 옮기기는 `positionFromOpenTrade`(손익 필드 사유가 거기 있다). */
function positions(dashboard: Record<string, unknown>): PositionPayload[] {
  const open = Array.isArray(dashboard.open_trades) ? dashboard.open_trades : [];
  return open.flatMap((raw) => {
    const p = positionFromOpenTrade(record(raw));
    return p ? [p] : [];
  });
}

// ── 캔들 (UI-06 B-4) ───────────────────────────────────────────────────────
//
// FCE 는 페이퍼 포지션의 캔들을 내지 않는다(차트 분석은 라이브 계좌 포지션 id 에만 붙는다).
// **시세는 시장 데이터다** — Bitget 공개 시세에서 바로 받는다. 계좌·키가 필요 없다.
// Vercel 에서 부르지 않는 이유: 거래소가 지역을 막을 수 있다(LAB-FIX-BINANCE-HOST 가 겪었다).

const BITGET = "https://api.bitget.com/api/v2/mix/market/candles";
const GRANULARITY: Record<ChartTimeframe, string> = { "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };
/** 시간봉마다 몇 개. 15분봉 200개 = 이틀 남짓, 일봉 200개 = 반년 남짓. */
const CANDLES = 200;

async function charts(symbols: string[]): Promise<ChartPayload[]> {
  const out: ChartPayload[] = [];
  const failed: string[] = [];
  for (const symbol of [...new Set(symbols)]) {
    for (const timeframe of CHART_TIMEFRAMES) {
      const url = `${BITGET}?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES&granularity=${GRANULARITY[timeframe]}&limit=${CANDLES}`;
      try {
        const body = record(await (await fetch(url, { signal: AbortSignal.timeout(15_000) })).json());
        const rows = Array.isArray(body.data) ? (body.data as unknown[][]) : [];
        const candles = rows
          .map((r) => r.slice(0, 5).map(Number) as [number, number, number, number, number])
          .filter((k) => k.every(Number.isFinite))
          .map(([t, o, h, l, c]) => [Math.floor(t / 1000), o, h, l, c] as [number, number, number, number, number])
          .sort((a, b) => a[0] - b[0]);
        if (candles.length > 0) out.push({ symbol, timeframe, candles });
        else failed.push(`${symbol} ${timeframe}`);
      } catch {
        // 차트 하나가 안 와도 업로드는 간다. 화면이 그 시간봉을 "없다" 고 말한다.
        failed.push(`${symbol} ${timeframe}`);
      }
    }
  }
  console.log(`  캔들 ${out.length}개${failed.length > 0 ? ` · 못 받음 ${failed.join(", ")}` : ""}`);
  return out;
}

// ── 고래 보드 (UI-07) ───────────────────────────────────────────────────────
//
// **주소는 여기서 줄인다.** FCE 는 전체 주소를 준다 — 이 함수 밖으로는 `0x020c…5872` 만 나간다.
// 받는 쪽(`checkPayload`)도 전체 주소가 보이면 업로드를 거절한다.

const FCE_BACKEND = process.env.FCE_BACKEND_DIR ?? "/Users/cocteau/Documents/Fomo club engine/backend";
const FCE_PYTHON = process.env.FCE_PYTHON ?? "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3";
// 러너는 레포 루트에서 이 업로더를 띄운다.
const WHALE_REPORT = process.env.FCE_WHALE_REPORT ?? join(process.cwd(), "scripts/lab/fce-whale-report.py");

/**
 * 리더보드 · 24시간 관측 — FCE 자신의 함수를 읽기 전용으로(`fce-whale-report.py`).
 *
 * 실패하면 **마지막 성공(2시간 안)** 을 쓴다 — 다른 느린 FCE 읽기와 같다. 러너 로그는 업로더의 마지막
 * 줄만 남겨서, 첫 배포 때 이 칸이 왜 비었는지 안 보였다. 그래서 이유를 파일에도 적는다(`whale-report.err`).
 */
function whaleReport(): { leaderboard: WhaleBoard["leaderboard"]; observation: WhaleBoard["observation"] } {
  const cache = join(CACHE_DIR, "whale-report.json");
  try {
    const out = execFileSync(FCE_PYTHON, [WHALE_REPORT], {
      cwd: FCE_BACKEND,
      encoding: "utf8",
      timeout: 120_000,
    });
    const body = record(JSON.parse(out));
    const hit = {
      leaderboard: body.leaderboard ? (body.leaderboard as WhaleBoard["leaderboard"]) : null,
      observation: body.observation ? (body.observation as WhaleBoard["observation"]) : null,
    };
    if (hit.leaderboard || hit.observation) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(cache, JSON.stringify({ at: Date.now(), ...hit }));
    }
    const partial = [body.leaderboardError, body.observationError].filter(Boolean).join(" | ");
    if (partial) writeFileSync(join(CACHE_DIR, "whale-report.err"), `${new Date().toISOString()} ${partial}\n`);
    return hit;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 600) : String(error);
    try {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(join(CACHE_DIR, "whale-report.err"), `${new Date().toISOString()} ${message}\n`);
    } catch {
      // 적을 곳도 없다 — 콘솔만.
    }
    console.log(`  고래 리포트 못 읽음 — ${message.slice(0, 120)}`);
    try {
      const saved = JSON.parse(readFileSync(cache, "utf8")) as { at: number } & ReturnType<typeof whaleReport>;
      if (Date.now() - saved.at < 2 * HOUR_MS) return { leaderboard: saved.leaderboard, observation: saved.observation };
    } catch {
      // 캐시 없음.
    }
    return { leaderboard: null, observation: null };
  }
}

function whaleBoard(whales: Record<string, unknown>, eligibility: Record<string, unknown>): WhaleBoard {
  const track = record(whales.follow_track);
  const cmp = record(track.exit_comparison);
  const overall = record(cmp.overall);
  const verdict = record(cmp.verdict);
  const hold = record(cmp.hold_hours);
  const lead = record(cmp.lead_breakdown);
  const gap = record(cmp.gap);
  const funnel = record(eligibility.funnel);
  const rejected = record(funnel.rejected);
  const criteria = record(funnel.criteria);

  const followBy = new Map(
    (Array.isArray(track.whales) ? track.whales : []).map((w) => [String(record(w).address ?? "").toLowerCase(), record(w)])
  );
  const tracked = new Map(
    (Array.isArray(whales.wallets) ? whales.wallets : []).map((w) => [String(record(w).address ?? "").toLowerCase(), record(w)])
  );
  const events = Array.isArray(whales.recent_events) ? whales.recent_events.map(record) : [];
  const passers = Array.isArray(eligibility.passers) ? eligibility.passers.map(record) : [];

  const wallets: WhaleBoard["wallets"] = passers.map((p) => {
    const address = String(p.address ?? "");
    const lower = address.toLowerCase();
    const t = tracked.get(lower) ?? {};
    const f = followBy.get(lower);
    const rank = num(record(record(t.payload).discovery).leaderboard_rank);
    return {
      key: walletKey(address),
      short: shortAddress(address),
      // 표시 이름 대신 리더보드 순위 — 이름은 FCE 도 "별칭" 이라고 적는다(`alias_disclaimer`).
      label: rank !== null ? `리더보드 #${rank}` : "리더보드 밖",
      type: typeof p.participant_type === "string" ? p.participant_type : null,
      sampleSize: num(p.sample_size),
      winPct: num(p.win_pct),
      ciLow: num(p.ci_low),
      follow: f
        ? {
            entries: num(f.entries),
            closed: num(f.closed),
            wins: num(f.wins),
            winPct: num(f.follow_win_pct),
            pf: num(f.profit_factor),
            netUsdt: num(f.net_usdt),
          }
        : null,
      positions: (Array.isArray(t.positions) ? t.positions : []).map(record).map((x) => ({
        coin: String(x.coin ?? ""),
        side: String(x.side ?? ""),
        sizeUsd: num(x.size_usd),
        leverage: num(record(x.leverage).value),
        entryPx: num(x.entry_px),
        markPx: num(x.mark_px),
        unrealizedUsd: num(x.unrealized_pnl),
      })),
      events: events
        .filter((e) => String(e.wallet_address ?? "").toLowerCase() === lower)
        .map((e) => ({
          coin: String(e.coin ?? ""),
          side: String(e.side ?? ""),
          event: String(e.event ?? ""),
          sizeUsd: num(e.size_usd),
          at: typeof e.event_at === "string" ? e.event_at : null,
        })),
      lastFillAt: typeof t.last_fill_at === "string" ? t.last_fill_at : null,
    };
  });

  const report = whaleReport();
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    gap: Object.keys(gap).length
      ? {
          whaleWinPct: num(gap.whale_win_pct),
          followWinPct: num(gap.follow_win_pct),
          gapPp: num(gap.gap_pp),
          sampleNote: str(gap.sample_note),
          notCausal: str(gap.not_causal),
          hypotheses: (Array.isArray(gap.hypotheses) ? gap.hypotheses : []).map(record).map((h) => ({
            id: String(h.id ?? ""),
            label: String(h.label ?? ""),
            consistent: typeof h.consistent === "boolean" ? h.consistent : null,
            note: String(h.note ?? ""),
          })),
        }
      : null,
    exit: Object.keys(overall).length
      ? {
          count: num(overall.count),
          oursNet: num(overall.a_net),
          whaleNet: num(overall.b_net),
          oursWinPct: num(overall.a_win_pct),
          whaleWinPct: num(overall.b_win_pct),
          oursPf: num(overall.a_profit_factor),
          whalePf: num(overall.b_profit_factor),
          verdict: str(verdict.verdict),
          reason: str(verdict.reason),
          caveat: str(verdict.caveat),
          holdOursMedianH: num(hold.a_median),
          holdWhaleMedianH: num(hold.b_median),
          oursFirst: num(lead.ours_first),
          whaleFirst: num(lead.whale_first),
        }
      : null,
    wallets,
    funnel: Object.keys(funnel).length
      ? {
          population: num(funnel.population) ?? 0,
          populationNote: str(funnel.population_note),
          excludedType: num(rejected.excluded_type) ?? 0,
          excludedByType: Object.fromEntries(
            Object.entries(record(funnel.excluded_by_type)).filter(([, v]) => typeof v === "number")
          ) as Record<string, number>,
          sampleBelow: num(rejected.sample_below_min) ?? 0,
          winBelow: num(rejected.win_rate_below_min) ?? 0,
          eligible: num(funnel.eligible) ?? 0,
          minSample: num(criteria.min_sample),
          minWinPct: num(criteria.min_win_pct),
        }
      : null,
    leaderboard: report.leaderboard,
    observation: report.observation,
  };
}

/** 고래 분석 — 자격 심사 + 추종 성적 + 지연·드리프트. */
function whale(
  eligibility: Record<string, unknown>,
  follow: Record<string, unknown>,
  asOf: string,
  whales: Record<string, unknown> = {}
): WhalePayload {
  const bucket = record(record(record(follow.performance).buckets).follow);
  // 탈락 사유는 `funnel.rejected` 안에만 있다. 퍼널 전체를 훑으면
  // `population`·`eligible` 같은 **집계값이 탈락 사유로 섞인다** — 실제로 그렇게 짰다가
  // 화면에 "ELIGIBLE 2 · POPULATION 82" 가 탈락 사유 칸에 떴다.
  const funnel = record(eligibility.funnel);
  const rejected: Record<string, number> = {};
  for (const [key, value] of Object.entries(record(funnel.rejected))) {
    if (typeof value === "number" && value > 0) rejected[key] = value;
  }
  return {
    walletsTotal: num(eligibility.wallets) ?? 0,
    eligible: num(eligibility.eligible) ?? 0,
    rejected,
    // 전체 주소를 내보내지 않는다(UI-07) — 앞 6 · 뒤 4.
    passers: Array.isArray(eligibility.eligible_addresses)
      ? (eligibility.eligible_addresses as unknown[]).map((a) => shortAddress(String(a)))
      : [],
    followWinPct: num(bucket.win_pct),
    followTrades: num(bucket.closed),
    followPf: num(bucket.profit_factor),
    followNetUsdt: num(bucket.net_usdt),
    latency: record(bucket.latency),
    drift: record(bucket.drift),
    asOf,
    board: Object.keys(whales).length > 0 ? whaleBoard(whales, eligibility) : null,
  };
}

/**
 * 닫힌 거래 이력 — `/api/paper/trades`.
 *
 * ## 칸을 하나씩 옮긴다. 펼치지 않는다
 *
 * FCE 응답에는 `take_profit_price` · `stop_price` · `invalidation_price` ·
 * `target_plan` 이 들어 있다. `...t` 로 펼치면 그게 전부 랩 DB 로 넘어오고,
 * 한 번 들어온 값은 언젠가 화면에 샌다 — `LAB-08` 이 막은 것이 정확히 그것이다.
 * 그래서 **여기서 이름을 하나씩 적는다.** 빠뜨리는 것은 안전한 실패다.
 *
 * `exit_reason` 은 가져온다. 닫힌 거래가 왜 끝났는지는 **과거의 사실**이고,
 * 그게 없으면 이력이 "얼마 벌었다" 뿐인 표가 된다.
 */
function trades(
  payload: Record<string, unknown>,
  trackKey: "crypto" | "whale" = "crypto",
  keep: (t: Record<string, unknown>) => boolean = () => true
): TradePayload[] {
  const rows = Array.isArray(payload.trades) ? payload.trades : [];
  return rows.flatMap((raw) => {
    const t = record(raw);
    // 열린 거래는 여기 담지 않는다 — 그건 `positions()` 가 본다.
    if (t.status === "open") return [];
    if (!keep(t)) return [];
    if (typeof t.id !== "string" && typeof t.id !== "number") return [];
    const tags = Array.isArray(t.loss_tags) ? t.loss_tags.map(String) : [];
    return [
      {
        id: String(t.id),
        trackKey,
        symbol: String(t.symbol ?? ""),
        direction: String(t.direction ?? ""),
        assetClass: typeof t.asset_class === "string" ? t.asset_class : null,
        timeframe: typeof t.timeframe === "string" ? t.timeframe : null,
        leverage: num(t.leverage),
        marginUsdt: num(t.margin_usdt),
        entryAt: typeof t.entry_at === "string" ? t.entry_at : null,
        entryPrice: num(t.entry_price),
        exitAt: typeof t.exit_at === "string" ? t.exit_at : null,
        exitPrice: num(t.exit_price),
        grossPnlUsdt: num(t.gross_pnl_usdt),
        costsUsdt: num(t.costs_usdt),
        netPnlUsdt: num(t.net_pnl_usdt),
        netReturnPct: num(t.net_return_pct),
        exitReason: typeof t.exit_reason === "string" ? t.exit_reason : null,
        lossTags: tags,
        holdingBars: num(t.holding_bars),
      },
    ];
  });
}

/** FCE 관측 유실일 — `observation_integrity.tracks.*.lost_day_details` (UI-04 C-2). */
function lostDays(diagnosis: Record<string, unknown>): LostDayPayload[] {
  const tracks = record(record(diagnosis.observation_integrity).tracks);
  // FCE 키 → 랩 트랙 키. 고래 추종은 FCE 가 관측률을 따로 안 잰다.
  const map: Record<string, LostDayPayload["trackKey"]> = {
    crypto: "crypto",
    stock_us: "stock_us",
    stock_kr: "stock_kr",
    poly: "polymarket",
  };
  const out: LostDayPayload[] = [];
  for (const [fceKey, trackKey] of Object.entries(map)) {
    const details = record(tracks[fceKey]).lost_day_details;
    for (const raw of Array.isArray(details) ? details : []) {
      const d = record(raw);
      const coverage = num(d.coverage_pct);
      if (typeof d.day !== "string" || coverage === null) continue;
      out.push({ trackKey, day: d.day, coveragePct: coverage, reason: String(d.reason ?? "") });
    }
  }
  return out;
}

// ── 한 바퀴 ──────────────────────────────────────────────────────────────────

/**
 * 느리고 자주 안 바뀌는 보조 호출 — **1시간 캐시, 실패하면 직전 값** (UI-02 B-1).
 *
 * 지갑 자격(40초)과 관측 진단은 UI-02 B-1 이 "1시간" 주기로 정한 것들이다. 15분마다 부를 이유가
 * 없고, 이 둘 중 하나가 늦는다고 트랙 자본·포지션까지 못 올라가면 안 된다. 업로더는 매번 새
 * 프로세스로 뜨므로(러너가 부른다) 캐시는 파일에 둔다.
 *
 * 캐시도 없고 호출도 실패하면 빈 객체다 — 그 칸만 비고 나머지는 올라간다.
 */
const CACHE_DIR = process.env.FCE_CACHE_DIR ?? "/tmp/fce-upload-cache";
const HOUR_MS = 60 * 60 * 1000;

async function cachedFce(path: string, name: string): Promise<{ body: Record<string, unknown>; source: string }> {
  const file = `${CACHE_DIR}/${name}.json`;
  let cached: { at: number; body: Record<string, unknown> } | null = null;
  try {
    cached = JSON.parse(readFileSync(file, "utf8")) as { at: number; body: Record<string, unknown> };
  } catch {
    cached = null;
  }
  if (cached && Date.now() - cached.at < HOUR_MS) return { body: cached.body, source: "캐시" };
  try {
    const body = record(await fce(path));
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify({ at: Date.now(), body }));
    return { body, source: "새로" };
  } catch (error) {
    if (cached) return { body: cached.body, source: `캐시(${Math.round((Date.now() - cached.at) / 60_000)}분 전 · 새로 부르기 실패)` };
    console.error(`  ⚠ ${path} 실패 — 이 칸만 비운다: ${error instanceof Error ? error.message : String(error)}`);
    return { body: {}, source: "없음" };
  }
}

async function collect(): Promise<FcePayload> {
  const at = new Date().toISOString();
  // **순서대로 부른다.** 전에는 일곱 개를 동시에 불렀다. FCE 가 과부하일 때 동시 호출은 서로
  // CPU 를 뺏어 모두 늦어진다 — 하나씩 부르면 합이 ~70초이고 각각 제한 안에 들어온다.
  // 핵심(자본·포지션·거래)을 먼저, 느린 보조(자격·진단)를 나중에.
  const paper = record(await fce("/api/paper/dashboard"));
  const stock = record(await fce("/api/stock-paper/dashboard"));
  const poly = record(await fce("/api/poly-paper/dashboard"));
  const follow = record(await fce("/api/onchain/follow/trades"));
  // 매번 전부 받는다. 거래가 수백 건이라 싸고, **증분으로 받으면 FCE 가 사후 정정한
  // 비용이 랩에 반영되지 않는다.** 늘어나면 그때 자르면 된다.
  const ledger = record(await fce("/api/paper/trades?limit=1000"));
  const eligibilityHit = await cachedFce("/api/onchain/follow/eligibility", "eligibility");
  // 관측 유실일. 무거운 진단이라 실패해도 나머지는 올린다 — 띠가 없는 차트가
  // 차트가 없는 것보다 낫다.
  const diagnosisHit = await cachedFce("/api/system/paper/diagnosis", "diagnosis");
  const eligibility = eligibilityHit.body;
  // 추적군 · 추종 대조(UI-07). 7초 남짓 — 무거운 둘처럼 캐시하지는 않는다(지갑 포지션이 30초마다 바뀐다).
  const whalesBody = record(await fce("/api/onchain/whales").catch(() => ({})));
  const diagnosis = diagnosisHit.body;
  console.log(`  지갑 자격 ${eligibilityHit.source} · 관측 진단 ${diagnosisHit.source}`);

  const openPositions = positions(paper);
  return {
    at,
    tracks: [
      cryptoTrack(paper, at),
      whaleTrack(follow, at),
      ...stockTracks(stock, at),
      polyTrack(poly, at),
    ],
    positions: openPositions,
    charts: await charts(openPositions.map((p) => p.symbol)),
    trades: [
      ...trades(ledger, "crypto"),
      // 고래는 **추종 자격(follow)만** 싣는다. FCE 성적 버킷이 그 83건으로 계산되고,
      // 관찰 자격(observation) 7건까지 섞으면 곡선 끝이 트랙 자본과 어긋난다.
      ...trades(follow, "whale", (t) => record(t.entry_evidence).qualification === "follow"),
    ],
    lostDays: lostDays(diagnosis),
    whale: whale(eligibility, follow, at, whalesBody),
  };
}

async function push(payload: FcePayload): Promise<void> {
  if (!TOKEN) throw new Error("LAB_INGEST_TOKEN 이 없다 — 올릴 수 없다");
  const started = Date.now();
  const response = await fetch(`${LAB}/api/lab/fce`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
    // 거래 이력까지 올리므로 60초로는 모자랐다. 실측 한 바퀴가 ~20초다.
    signal: AbortSignal.timeout(120_000),
  }).catch((error: unknown) => {
    // FCE 요청과 가른다 — 둘 다 같은 '타임아웃' 한 줄이었다.
    throw new Error(`LAB 업로드 — ${error instanceof Error ? error.message : error} (${Math.round((Date.now() - started) / 1000)}초)`);
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`LAB 업로드 ${response.status}: ${text.slice(0, 300)}`);
  console.log(`  → ${text.slice(0, 200)}`);
}

async function once(): Promise<boolean> {
  const started = Date.now();
  try {
    const payload = await collect();
    const line = payload.tracks
      .map((t) => `${t.label} ${t.status}${t.trades ? ` N=${t.trades}` : ""}`)
      .join(" · ");
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
    // 닫힌 거래는 **비용까지** 적는다. 건수만 적으면 무엇이 올라가는지 안 보인다.
    const costs = payload.trades.reduce((sum, t) => sum + (t.costsUsdt ?? 0), 0);
    const net = payload.trades.reduce((sum, t) => sum + (t.netPnlUsdt ?? 0), 0);
    console.log(
      `  포지션 ${payload.positions.length} · 지갑 ${payload.whale?.walletsTotal ?? 0}` +
        ` · 닫힌 거래 ${payload.trades.length} (순손익 ${net.toFixed(2)} · 비용 ${costs.toFixed(2)} USDT)`
    );

    if (EMIT) {
      // **파일로 쓴다.** 처음엔 stdout 으로 흘렸는데, 80KB 가 넘으니 파이프가 다 비기
      // 전에 `process.exit` 가 먼저 불려 JSON 이 중간에 잘렸다.
      //   npm run lab:fce-upload -- --emit=/tmp/payload.json
      writeFileSync(EMIT_PATH, JSON.stringify(payload));
      console.log(`  → ${EMIT_PATH} (${Math.round(JSON.stringify(payload).length / 1024)}KB)`);
      return true;
    }
    if (DRY) {
      console.log("  (--dry — 올리지 않았다)");
      return true;
    }
    await push(payload);
    console.log(`  ✅ ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return true;
  } catch (error) {
    // **실패를 조용히 넘기지 않는다.** 호스트가 자면 여기가 먼저 터진다.
    console.error(`  ❌ ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`FCE ${FCE} → LAB ${LAB}${DRY ? " (dry)" : ""}`);
  const ok = await once();
  if (!WATCH) {
    process.exit(ok ? 0 : 1);
  }
  console.log(`\n15분마다 반복한다. 멈추려면 Ctrl+C.`);
  setInterval(() => {
    void once();
  }, INTERVAL_MS);
}

void main();
