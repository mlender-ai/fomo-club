/**
 * 로컬 수집 러너 — **랩을 실제로 살아 있게 하는 프로세스.**
 *
 * ## 왜 이게 있나
 *
 * 수집을 GitHub Actions 크론에 걸어뒀는데 못 지켰다. 2026-09-21 실측:
 *
 * | 잡 | 걸어둔 주기 | 실측 |
 * |---|---|---|
 * | latest-price | 5분 | 19분에 한 번 |
 * | candles | 매시 | 3.5시간째 안 돎 |
 * | paper-tick | 매시 | 8시간째 안 돎 |
 * | funding | 8시간 | 연속 실패 12회 — fapi.binance.com 451 |
 *
 * `STALE_AFTER_MS` 가 3분이라 화면이 **항상 `끊김`** 이었다. 임계가 틀린 게 아니라
 * 수집이 안 된 것이다. 그리고 451 은 **GitHub 러너(미국 IP)에서만** 난다 —
 * 이 맥에서는 200 이다. 로컬로 옮기면 주기와 펀딩비가 **같이** 풀린다.
 *
 * ## 쓰기는 API 가 한다
 *
 * 로컬에 프로덕션 `DATABASE_URL` 이 없다(Vercel 이 암호화해 안 내려준다).
 * 그래서 이 러너는 **공개 소스를 읽어 인증된 엔드포인트로 밀어 올린다** —
 * FCE 브리지와 같은 구조다. DB 자격증명이 이 맥에 없어도 된다.
 *
 * ## 한 프로세스만 살려두면 된다
 *
 * 시세·봉·펀딩비·고래·FCE 스냅샷을 전부 이 하나가 챈다. 여러 개를 띄우면
 * 어느 게 죽었는지 모르게 된다. 페이퍼만은 DB 를 직접 만져야 해서 여기서
 * **돌리지 않고 Actions 를 깨운다** — 실행기를 둘로 만들지 않으려는 것이다.
 *
 *   npm run lab:runner              # 계속 돈다
 *   npm run lab:runner -- --once    # 전부 한 번씩만
 *
 * 필요: `LAB_INGEST_TOKEN`. 없으면 시작하지 않는다.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  BINANCE_PAIR,
  BINANCE_PERP,
  SYMBOLS,
  WHALE_COHORT_SIZE,
  WHALE_MIN_SIZE_USD,
} from "./collect/config";
import {
  fetchBinanceCandles,
  fetchBinanceFunding,
  fetchBinancePrices,
  fetchHyperliquidLeaderboard,
  fetchHyperliquidPositions,
} from "./collect/sources";

const LAB = process.env.LAB_BASE_URL ?? "https://fomo-web-mlender-ais-projects.vercel.app";
const TOKEN = process.env.LAB_INGEST_TOKEN ?? "";
const ONCE = process.argv.includes("--once");

const execFileAsync = promisify(execFile);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;


interface Result {
  rows: number;
  detail?: Record<string, unknown>;
}

async function post(path: string, body: unknown): Promise<string> {
  const response = await fetch(`${LAB}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text.slice(0, 200)}`);
  return text;
}

// ── 잡 ──────────────────────────────────────────────────────────────────────

/** 실시간 시세. **1분 주기** — `STALE_AFTER_MS`(3분)를 지키려면 이보다 느릴 수 없다. */
async function latestPrice(startedAt: Date): Promise<Result> {
  const pairs = SYMBOLS.map((s) => BINANCE_PAIR[s]);
  const prices = await fetchBinancePrices(pairs);
  const rows = SYMBOLS.flatMap((symbol) => {
    const hit = prices.get(BINANCE_PAIR[symbol]);
    return hit ? [{ symbol, price: hit.price, at: hit.at.toISOString() }] : [];
  });
  await post("/api/lab/market", {
    job: "latest-price",
    source: "binance-spot",
    startedAt: startedAt.toISOString(),
    prices: rows,
  });
  return { rows: rows.length };
}

/**
 * 봉. 마지막으로 가진 봉 **이후**만 받는다 — 전체를 매번 받으면 소스에 무례하다.
 * 무엇을 가졌는지는 랩이 아니까 물어본다.
 */
async function candles(startedAt: Date): Promise<Result> {
  const status = (await fetch(`${LAB}/api/lab/data-status`, {
    signal: AbortSignal.timeout(60_000),
  }).then((r) => r.json())) as {
    candles: { symbol: string; interval: string; last: string | null }[];
  };

  const have = new Map(
    status.candles.map((c) => [`${c.symbol}:${c.interval}`, c.last ? new Date(c.last) : null])
  );

  const out: unknown[] = [];
  for (const symbol of SYMBOLS) {
    for (const interval of ["H1", "D1"] as const) {
      const step = interval === "H1" ? HOUR : 24 * HOUR;
      const last = have.get(`${symbol}:${interval}`) ?? null;
      // 아직 닫히지 않은 봉은 안 받는다 — 값이 나중에 바뀐다.
      const to = new Date(Math.floor(Date.now() / step) * step - step);
      const from = last ? new Date(last.getTime() + step) : new Date(to.getTime() - 30 * step);
      if (from > to) continue;
      const bars = await fetchBinanceCandles(BINANCE_PAIR[symbol], interval, from, to);
      for (const bar of bars) {
        if (bar.at.getTime() > to.getTime()) continue;
        out.push({
          symbol,
          interval,
          at: bar.at.toISOString(),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        });
      }
    }
  }

  if (out.length > 0) {
    await post("/api/lab/market", {
      job: "candles",
      source: "binance-spot",
      startedAt: startedAt.toISOString(),
      candles: out,
    });
  } else {
    await post("/api/lab/market", {
      job: "candles",
      source: "binance-spot",
      startedAt: startedAt.toISOString(),
      detail: { note: "받을 새 봉이 없다" },
    });
  }
  return { rows: out.length };
}

/**
 * 펀딩비. **GitHub 러너에서 451 이던 그 호출이 여기서는 200 이다.**
 * 빼면 무기한 선물 성과가 부풀려진다.
 */
async function funding(startedAt: Date): Promise<Result> {
  const to = new Date();
  const from = new Date(to.getTime() - 3 * 24 * HOUR);
  const out: unknown[] = [];
  for (const symbol of SYMBOLS) {
    const rows = await fetchBinanceFunding(BINANCE_PERP[symbol], from, to);
    for (const row of rows) {
      out.push({ symbol, at: row.at.toISOString(), rate: row.rate });
    }
  }
  await post("/api/lab/market", {
    job: "funding",
    source: "binance-perp",
    startedAt: startedAt.toISOString(),
    funding: out,
  });
  return { rows: out.length };
}

/**
 * 고래 스냅샷. Hyperliquid 는 **현재 포지션만** 준다 — 과거는 없다.
 *
 * `collect-whale.ts` 가 지키는 규칙 두 개를 여기서도 지킨다:
 *
 *  1. **코호트를 매번 다시 뽑지 않는다.** 리더보드에서 재선정하면 순위에서 밀린
 *     지갑의 관측이 끊긴다 — 표본이 남되 **자라지 않는다**(FCE `c0e4805` 가 고친 결함).
 *     이미 보던 지갑이 랩에 있으면 그걸 쓰고, 없을 때만 리더보드에서 뽑는다.
 *  2. 뽑을 때는 성과가 아니라 **계좌 규모**로 뽑는다. pnl·roi 로 뽑으면 생존 편향이 들어간다.
 *
 * 무엇을 보고 있었는지는 랩(=DB)이 아니까 물어본다.
 */
async function whale(startedAt: Date): Promise<Result> {
  const known = (await fetch(`${LAB}/api/lab/market?cohort=1`, {
    headers: { authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(60_000),
  }).then((r) => r.json())) as { addresses?: string[] };

  let addresses = (known.addresses ?? []).slice(0, WHALE_COHORT_SIZE);
  let reselected = false;
  if (addresses.length < WHALE_COHORT_SIZE) {
    const board = await fetchHyperliquidLeaderboard();
    addresses = board
      .sort((a, b) => b.accountValue - a.accountValue)
      .slice(0, WHALE_COHORT_SIZE)
      .map((r) => r.address);
    reselected = true;
  }

  // 한 바퀴가 한 스냅샷이다. 지갑마다 다른 시각을 쓰면 같은 시점의 포지션을
  // 모아볼 수 없다.
  const at = startedAt.toISOString();
  const watched = new Set<string>(SYMBOLS);
  const out: unknown[] = [];
  let scanned = 0;
  let skippedSmall = 0;

  for (const address of addresses) {
    try {
      const positions = await fetchHyperliquidPositions(address);
      scanned += 1;
      for (const position of positions) {
        if (!watched.has(position.symbol)) continue;
        if (position.sizeUsd < WHALE_MIN_SIZE_USD) {
          skippedSmall += 1;
          continue;
        }
        out.push({
          address: position.address,
          symbol: position.symbol,
          side: position.side,
          size: position.sizeUsd,
          at,
        });
      }
    } catch {
      // 지갑 하나가 죽어도 나머지는 받는다.
    }
  }

  await post("/api/lab/market", {
    job: "whale",
    source: "hyperliquid",
    startedAt: startedAt.toISOString(),
    whale: out,
    detail: { cohort: addresses.length, scanned, skippedSmall, reselected },
  });
  return { rows: out.length, detail: { scanned, skippedSmall } };
}

/**
 * 페이퍼 실행. **여기서 돌리지 않고 Actions 를 깨운다.**
 *
 * 페이퍼는 DB 를 직접 읽고 쓴다(전략 상태·거래·자산). 이 맥에는 프로덕션
 * `DATABASE_URL` 이 없다. 그렇다고 실행기를 API 쪽에 다시 짜면 **실행기가 둘이
 * 된다** — `LAB-07 PART A` 가 하지 말라고 못박은 바로 그것이고, 백테스트와
 * 페이퍼가 같은 `execute()` 를 쓴다는 보장이 깨진다.
 *
 * 그래서 역할을 나눈다:
 *
 *  - **주기는 로컬이 준다** — GitHub `schedule` 이 못 지키는 것이 이것이다
 *  - **DB 자격은 Actions 가 준다** — `workflow_dispatch` 는 정상 동작한다(§CRON 0-2)
 *
 * `gh` 가 이 맥에 로그인돼 있어야 한다. 없으면 이 잡만 실패하고 나머지는 돈다.
 */
async function paperTick(startedAt: Date): Promise<Result> {
  await execFileAsync(
    "gh",
    ["workflow", "run", "lab-collect.yml", "-f", "job=paper", "--ref", "main"],
    { encoding: "utf8", env: process.env, timeout: 2 * MINUTE }
  );
  await post("/api/lab/market", {
    job: "paper-dispatch",
    source: "local-runner",
    startedAt: startedAt.toISOString(),
    detail: { note: "lab-collect.yml job=paper 를 깨웠다. 실제 실행은 Actions 가 한다" },
  });
  return { rows: 0, detail: { dispatched: "lab-collect job=paper" } };
}

/**
 * FCE 스냅샷. 업로더를 그대로 부른다 — 계약이 한 곳에만 있어야 한다.
 *
 * ## 성공도 `CollectionRun` 에 적는다
 *
 * 업로더의 성공은 `FceUpload` 에 적히고 `CollectionRun` 에는 안 남는다. 반면
 * 실패는 러너가 `CollectionRun` 에 적는다. 그래서 한 번 실패하면 `/data` 의
 * 수집 잡 표에 **`fce ❌` 가 영영 남는다** — 그 뒤로 몇 번을 성공해도 그 표를
 * 갱신할 것이 없기 때문이다. 실제로 14:54 실패가 15:10 성공 뒤에도 빨갛게 있었다.
 *
 * 다른 잡들은 데이터를 밀어 올리는 그 요청이 `CollectionRun` 을 같이 쓴다.
 * fce 만 경로가 달라서 여기서 따로 적는다.
 */
async function fceSnapshot(startedAt: Date): Promise<Result> {
  const { stdout } = await execFileAsync("npx", ["tsx", "scripts/lab/fce-upload.ts"], {
    encoding: "utf8",
    env: process.env,
    timeout: 5 * MINUTE,
  });
  const line = stdout.split("\n").find((l) => l.includes("tracks")) ?? "";
  await post("/api/lab/market", {
    job: "fce",
    source: "local-runner",
    startedAt: startedAt.toISOString(),
    detail: { line: line.trim().slice(0, 300) },
  });
  return { rows: 1, detail: { line: line.trim().slice(0, 140) } };
}

// ── 스케줄 ──────────────────────────────────────────────────────────────────

interface Job {
  name: string;
  everyMs: number;
  run: (startedAt: Date) => Promise<Result>;
  lastAt: number;
  fails: number;
}

/**
 * 시세는 **혼자 도는 레인**이다.
 *
 * 처음에는 전부 한 줄로 세웠다. 그런데 FCE 업로드가 길어지자 시세가 그 뒤에서
 * 94초까지 밀렸고(실측), 업로드가 타임아웃(120초)까지 가면 시세 간격이
 * `STALE_AFTER_MS`(3분)를 넘긴다. 그러면 **수집은 멀쩡한데 화면에 끊김이 뜬다** —
 * 이 러너가 없애려고 만들어진 바로 그 화면이다.
 *
 * 시세는 3심볼 한 번 GET 에 upsert 3행이다. 커넥션을 잡아먹는 쪽이 아니다.
 */
const fastJobs: Job[] = [
  { name: "latest-price", everyMs: 1 * MINUTE, run: latestPrice, lastAt: 0, fails: 0 },
];

/** 나머지는 한 줄로 선다. 병렬로 돌리면 어느 잡이 느린지 안 보인다. */
const slowJobs: Job[] = [
  { name: "candles", everyMs: 5 * MINUTE, run: candles, lastAt: 0, fails: 0 },
  { name: "whale", everyMs: 15 * MINUTE, run: whale, lastAt: 0, fails: 0 },
  { name: "fce", everyMs: 15 * MINUTE, run: fceSnapshot, lastAt: 0, fails: 0 },
  { name: "paper", everyMs: 1 * HOUR, run: paperTick, lastAt: 0, fails: 0 },
  { name: "funding", everyMs: 8 * HOUR, run: funding, lastAt: 0, fails: 0 },
];

const jobs: Job[] = [...fastJobs, ...slowJobs];

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

/**
 * 레인 하나를 한 바퀴 돌린다. **레인 안에서는 한 번에 하나만 돈다** — 병렬이면
 * DB 커넥션이 몰리고(서버리스는 람다당 1개다) 어느 잡이 느린지도 안 보인다.
 *
 * 레인이 둘인 이유는 위 `fastJobs` 주석에 있다.
 */
async function runLane(lane: Job[], busy: { value: boolean }): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const now = Date.now();
    for (const job of lane) {
      if (now - job.lastAt < job.everyMs) continue;
      const startedAt = new Date();
      try {
        const result = await job.run(startedAt);
        job.lastAt = Date.now();
        job.fails = 0;
        const extra = result.detail ? ` ${JSON.stringify(result.detail)}` : "";
        console.log(`[${stamp()}] ${job.name} ✅ ${result.rows}행${extra}`);
      } catch (error) {
        job.lastAt = Date.now();
        job.fails += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${stamp()}] ${job.name} ❌ (${job.fails}회) ${message.slice(0, 200)}`);
        // **실패를 랩에도 남긴다.** 로컬 콘솔에만 있으면 화면은 조용히 낡아간다.
        try {
          await post("/api/lab/market", {
            job: job.name,
            source: "local-runner",
            startedAt: startedAt.toISOString(),
            error: message,
          });
        } catch {
          // 랩에 못 닿는 상황이면 그것도 기록할 곳이 없다. 콘솔이 마지막 줄이다.
        }
      }
    }
  } finally {
    busy.value = false;
  }
}

const fastBusy = { value: false };
const slowBusy = { value: false };

async function tick(): Promise<void> {
  // 두 레인을 같이 깨운다. 서로를 기다리지 않는 것이 요점이다.
  await Promise.all([runLane(fastJobs, fastBusy), runLane(slowJobs, slowBusy)]);
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error("LAB_INGEST_TOKEN 이 없다. 러너를 시작하지 않는다.");
    process.exit(1);
  }
  console.log(`로컬 수집 러너 → ${LAB}`);
  console.log(jobs.map((j) => `${j.name} ${j.everyMs / MINUTE}분`).join(" · "));
  console.log("");

  await tick();
  if (ONCE) {
    process.exit(0);
  }
  // 15초마다 "돌 때가 된 잡" 을 본다. 주기 자체를 타이머로 걸지 않는 이유는
  // 잡이 오래 걸릴 때 타이머가 겹쳐 쌓이는 것을 막기 위해서다.
  setInterval(() => void tick(), 15_000);
}

void main();
