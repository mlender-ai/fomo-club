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
import type {
  FcePayload,
  PositionPayload,
  TradePayload,
  TrackPayload,
  TrackStatus,
  WhalePayload,
} from "../../apps/web/lib/lab/fce-payload";

const FCE = process.env.FCE_BASE_URL ?? "http://127.0.0.1:8875";
const LAB = process.env.LAB_BASE_URL ?? "https://fomo-web-mlender-ais-projects.vercel.app";
const TOKEN = process.env.LAB_INGEST_TOKEN ?? "";

/** PART B-2 — 15분. */
const INTERVAL_MS = 15 * 60 * 1000;

const DRY = process.argv.includes("--dry");
const WATCH = process.argv.includes("--watch");

async function fce(path: string): Promise<unknown> {
  const response = await fetch(`${FCE}${path}`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return response.json();
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
    returnPct: num(engine.return_on_capital_pct),
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
    asOf,
  };
}

/** 고래 추종 — `/api/onchain/follow/trades` 의 `performance.buckets.follow`. */
function whaleTrack(follow: Record<string, unknown>, asOf: string): TrackPayload {
  const bucket = record(record(record(follow.performance).buckets).follow);
  return {
    key: "whale",
    label: "고래 추종",
    currency: "USDT",
    startingCapital: 500,
    currentCapital: null,
    realized: num(bucket.net_usdt),
    unrealized: null,
    returnPct: null,
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
  const out: TrackPayload[] = [];
  for (const raw of rows) {
    const t = record(raw);
    const market = String(t.market ?? "");
    if (market !== "US" && market !== "KR") continue;

    const halt = record(t.halt);
    const stopped = halt.stopped === true;
    const sample = record(t.sample_breakdown);
    const navComplete = t.nav_complete === true;

    out.push({
      key: market === "US" ? "stock_us" : "stock_kr",
      label: market === "US" ? "주식 US" : "주식 KR",
      currency: String(t.currency ?? ""),
      startingCapital: num(t.initial_cash) ?? 0,
      // NAV 가 불완전하면 **평가액을 내지 않는다** — 반쯤 센 자본은 틀린 자본이다.
      currentCapital: navComplete ? num(t.nav) : null,
      realized: null,
      unrealized: null,
      returnPct: num(t.engine_return_pct),
      trades: num(sample.strategy_fills),
      winRatePct: null,
      profitFactor: null,
      mddPct: null,
      sampleNote:
        sample.strategy_sample_zero === true
          ? "전략 체결 0건 — 트랙 수익률은 탐색분을 포함한 계정 전체다"
          : (typeof sample.headline_note === "string" ? sample.headline_note : null),
      status: stopped ? "stopped" : "running",
      statusReason: stopped ? `체결 invariant — ${String(halt.reason ?? "unknown")}` : null,
      leverage: null,
      benchmarkLabel: t.benchmark_index ? String(t.benchmark_index) : null,
      benchmarkStart: num(t.benchmark_start),
      benchmarkCurrent: num(t.benchmark_current),
      benchmarkReturnPct: num(t.benchmark_return_pct),
      evidenceNote: typeof halt.evidence_note === "string" ? halt.evidence_note : null,
      asOf,
    });
  }
  return out;
}

/** 폴리마켓 — `/api/poly-paper/dashboard`. */
function polyTrack(dashboard: Record<string, unknown>, asOf: string): TrackPayload {
  const track = record(dashboard.track);
  const unrealized = record(dashboard.unrealized);
  const initial = num(track.initial_cash) ?? 0;
  const cash = num(track.cash);
  return {
    key: "polymarket",
    label: "폴리마켓",
    currency: String(track.currency ?? "USDC"),
    startingCapital: initial,
    // **평가액을 만들어내지 않는다.** 451 로 막혀 NAV 가 안 나온다.
    currentCapital: null,
    realized: cash !== null ? cash - initial : null,
    unrealized: num(unrealized.pnl),
    returnPct: null,
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
    asOf,
  };
}

/** 보유 포지션 — 크립토 페이퍼. */
function positions(dashboard: Record<string, unknown>): PositionPayload[] {
  const open = Array.isArray(dashboard.open_trades) ? dashboard.open_trades : [];
  return open.flatMap((raw) => {
    const t = record(raw);
    if (typeof t.id !== "string" && typeof t.id !== "number") return [];
    return [
      {
        id: String(t.id),
        trackKey: "crypto" as const,
        symbol: String(t.symbol ?? ""),
        direction: String(t.direction ?? ""),
        leverage: num(t.leverage),
        marginUsdt: num(t.margin_usdt),
        netReturnPct: num(t.net_return_pct),
        healthScore: num(t.health_score),
        entryAt: typeof t.entry_at === "string" ? t.entry_at : null,
        entryPrice: num(t.entry_price),
      },
    ];
  });
}

/** 고래 분석 — 자격 심사 + 추종 성적 + 지연·드리프트. */
function whale(
  eligibility: Record<string, unknown>,
  follow: Record<string, unknown>,
  asOf: string
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
    passers: Array.isArray(eligibility.eligible_addresses)
      ? (eligibility.eligible_addresses as unknown[]).map(String)
      : [],
    followWinPct: num(bucket.win_pct),
    followTrades: num(bucket.closed),
    followPf: num(bucket.profit_factor),
    followNetUsdt: num(bucket.net_usdt),
    latency: record(bucket.latency),
    drift: record(bucket.drift),
    asOf,
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
function trades(payload: Record<string, unknown>): TradePayload[] {
  const rows = Array.isArray(payload.trades) ? payload.trades : [];
  return rows.flatMap((raw) => {
    const t = record(raw);
    // 열린 거래는 여기 담지 않는다 — 그건 `positions()` 가 본다.
    if (t.status === "open") return [];
    if (typeof t.id !== "string" && typeof t.id !== "number") return [];
    const tags = Array.isArray(t.loss_tags) ? t.loss_tags.map(String) : [];
    return [
      {
        id: String(t.id),
        trackKey: "crypto" as const,
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

// ── 한 바퀴 ──────────────────────────────────────────────────────────────────

async function collect(): Promise<FcePayload> {
  const at = new Date().toISOString();
  const [paper, follow, eligibility, stock, poly, ledger] = await Promise.all([
    fce("/api/paper/dashboard").then(record),
    fce("/api/onchain/follow/trades").then(record),
    fce("/api/onchain/follow/eligibility").then(record),
    fce("/api/stock-paper/dashboard").then(record),
    fce("/api/poly-paper/dashboard").then(record),
    // 매번 전부 받는다. 148건이라 싸고, **증분으로 받으면 FCE 가 사후 정정한
    // 비용이 랩에 반영되지 않는다.** 늘어나면 그때 자르면 된다.
    fce("/api/paper/trades?limit=1000").then(record),
  ]);

  return {
    at,
    tracks: [
      cryptoTrack(paper, at),
      whaleTrack(follow, at),
      ...stockTracks(stock, at),
      polyTrack(poly, at),
    ],
    positions: positions(paper),
    trades: trades(ledger),
    whale: whale(eligibility, follow, at),
  };
}

async function push(payload: FcePayload): Promise<void> {
  if (!TOKEN) throw new Error("LAB_INGEST_TOKEN 이 없다 — 올릴 수 없다");
  const response = await fetch(`${LAB}/api/lab/fce`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
    // 거래 이력까지 올리므로 60초로는 모자랐다. 실측 한 바퀴가 ~20초다.
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`LAB ${response.status}: ${text.slice(0, 300)}`);
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
