/**
 * 화면 조립본 (UI-02 F-1).
 *
 * > **집계는 미리 해둔다. 요청 시점에 계산하지 않는다.**
 *
 * ## 왜 이렇게까지 하나 — 왕복 한 번이 ~900ms 다
 *
 * 정규 도메인 실측:
 *
 * ```
 * 쿼리 2개  →  1,793ms      (GET /api/lab/status)
 * 쿼리 1개  →    904ms
 * Overview  → 11,900ms      (쿼리 ~11개)
 * ```
 *
 * 응답 시간은 로직이 아니라 **왕복 수**가 정한다. `Promise.all` 로 감싸도 줄지
 * 않는다 — 한 커넥션에서 차례로 간다. 그래서 **API 하나가 쿼리 하나**가 되게 한다.
 *
 * ## 동기화 상태도 조립본에 넣는다
 *
 * 그러지 않으면 모든 API 가 쿼리 두 개가 된다. 시각(`lastAt`)만 넣고 **경과 시간은
 * 요청 시점에 센다** — 그건 계산이 아니라 뺄셈이고, 조립본에 굳혀두면 화면이 항상
 * "2분 전" 이라고 말하게 된다.
 */
import { readCapitalSeries } from "./capital";
import { readFceBoard, readFceLedger } from "./fce-board";
import { buildOverview } from "./overview";
import { buildPortfolio } from "./portfolio";
import { buildCharts, buildPositions } from "./positions";
import { buildStrategies } from "./strategies";
import { buildWhales } from "./whales";
import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";

export type SnapshotKey =
  | "overview"
  | "strategies"
  | "positions"
  | "whales"
  | "research"
  | "journal"
  /** UI-06 — 포지션 심볼의 캔들. 포지션 상세만 읽는다. */
  | "charts";

/**
 * 조립본 **형식 번호**. 조립본의 모양을 바꾸면 **반드시 올린다.**
 *
 * ## 왜 있나 — 조립본은 배포보다 오래 산다
 *
 * UI-03 을 배포했더니 `/whales` 가 통째로 터졌다. DB 에 남아 있던 조립본은 **이전 배포의
 * 코드**가 만든 것이라 `causes[].measured` 가 문자열이 아니라 객체였고, 새 화면이 그걸
 * 글자로 그리려다 React 가 멈췄다. 전략 조립본에는 새 화면이 찾는 `series` 도 없었다.
 *
 * 번호가 다르면 읽는 쪽이 **"다시 만드는 중"** 으로 받는다. 옛 모양을 새 화면에 넘기지 않는다.
 */
export const SNAPSHOT_VERSION = 8;
// 3 — UI-04: Overview 가 곡선·띠·통계·전략 경쟁·최근 활동을 통째로 갖는다(`overview.ts`).
// 4 — UI-FIX: 기준선은 트랙별 한 곳(`competition.rows[].baseline`) · 거래 수는 원장 하나(`ledger`) ·
//     복기의 `countNote`/`boardCount` 삭제 · 전략 행에 `reason`.
// 8 — UI-07: 고래 조립본을 FCE 보드로(갭 · 반사실 · 지갑 · 깔때기 · 리더보드 · 24시간). 박아 둔 65.8% · 원인 표를 뺐다.
// 7 — UI-06: 포지션 행에 `evidence`(진입 근거). v6 조립본에는 없어서 화면이 `evidence[0]` 에서 멈춘다.
// 6 — UI-06: 포지션에 가격선·현재가·수량·비용 · 위험순 정렬 · 연구 · `charts` 조립본(캔들).
// 5 — UI-05: 전략 행에 순위·샤프·평균 보유·분포·최근 거래·연구 · 우연 확률 · 폐기 보관함(`strategies.ts`).

/** 조립본에 같이 실리는 동기화 재료. 경과 시간은 읽는 쪽이 센다. */
export interface SyncSeed {
  lastAt: string | null;
  lastError: { at: string; error: string } | null;
}

export interface Snapshot<T = unknown> {
  key: SnapshotKey;
  payload: T;
  sync: SyncSeed;
  builtAt: Date;
}




/**
 * 여섯 탭의 조립본을 **읽어서 만든다.** 쓰지는 않는다.
 *
 * 쓰기와 가른 이유는 타입이다 — 화면이 같은 모양을 보게 `Payloads` 를 여기서
 * 뽑아 내보낸다. 서버가 한 칸을 바꾸면 화면 쪽 타입이 같이 깨진다.
 */
/**
 * `justUploadedAt` — 지금 막 끝난 업로드의 시각. 업로드 경로는 조립본을 만든 **뒤에** 업로드 기록을 남겨서
 * (조립이 실패하면 실패로 적으려고), DB 의 마지막 성공은 한 번 전 것이다. 넘기지 않으면 조립본이 말하는
 * "마지막 동기화" 가 15분씩 늦었다 — 헤더는 `1분 전`, 포지션 부제는 `20:48`(실제 21:05).
 */
export async function assemblePayloads(options: { justUploadedAt?: Date } = {}) {
  const [board, ledger, research, lastOk, lastFail] = await Promise.all([
    readFceBoard(),
    readFceLedger(),
    prisma.research.findMany({
      orderBy: { no: "asc" },
      select: {
        no: true,
        title: true,
        status: true,
        verdict: true,
        summary: true,
        blocks: true,
        openedAt: true,
        closedAt: true,
        trackKeys: true,
      },
    }),
    prisma.fceUpload.findFirst({ where: { ok: true }, orderBy: { at: "desc" }, select: { at: true } }),
    prisma.fceUpload.findFirst({
      where: { ok: false },
      orderBy: { at: "desc" },
      select: { at: true, error: true },
    }),
  ]);

  const portfolio = buildPortfolio(board.tracks);
  const series = await Promise.all(portfolio.tracks.map((t) => readCapitalSeries(t.key)));

  // Overview 재료 — 쓰기 경로라 여기서 실컷 읽는다. 화면 요청은 조립본 한 줄만 본다.
  const [tradeLite, lostDays, archive, chartRows] = await Promise.all([
    prisma.fceTrade.findMany({
      where: { exitAt: { not: null } },
      select: {
        trackKey: true,
        symbol: true,
        direction: true,
        entryAt: true,
        exitAt: true,
        netPnlUsdt: true,
        netReturnPct: true,
        leverage: true,
        exitReason: true,
      },
    }),
    prisma.fceLostDay.findMany(),
    // 폐기한 랩 전략(UI-05 A-5) — **지우지 않았다.** 마지막 백테스트의 성적을 같이 싣는다.
    prisma.strategy.findMany({
      where: { status: "STOPPED" },
      orderBy: [{ stoppedAt: "asc" }, { name: "asc" }],
      select: {
        name: true,
        version: true,
        stoppedAt: true,
        runs: {
          where: { kind: "BACKTEST" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { metric: { select: { trades: true, cagrMdd: true } } },
        },
      },
    }),
    prisma.fcePositionChart.findMany(),
  ]);
  const firstExit = tradeLite.reduce<Date | null>(
    (min, t) => (t.exitAt && (!min || t.exitAt < min) ? t.exitAt : min),
    null
  );
  const btc = await prisma.candle.findMany({
    where: {
      symbol: "BTC",
      interval: "H1",
      at: { gte: new Date((firstExit?.getTime() ?? Date.now() - 30 * 86_400_000) - 2 * 86_400_000) },
    },
    orderBy: { at: "asc" },
    select: { at: true, close: true },
  });

  const lastAt =
    options.justUploadedAt && (!lastOk || options.justUploadedAt > lastOk.at) ? options.justUploadedAt : (lastOk?.at ?? null);
  const sync: SyncSeed = {
    lastAt: lastAt?.toISOString() ?? null,
    lastError: lastFail?.error ? { at: lastFail.at.toISOString(), error: lastFail.error } : null,
  };

  const openResearch = research.filter((r) => r.status === "open" || r.status === "testing");

  const overview = {
    ...buildOverview({
      tracks: board.tracks,
      trades: tradeLite,
      positions: board.positions,
      btc: btc.map((b) => ({ at: b.at, close: b.close.toNumber() })),
      lostDays,
      research: research.map((r) => ({
        no: r.no,
        title: r.title,
        status: r.status,
        verdict: r.verdict,
        summary: r.summary,
        blocks: r.blocks,
      })),
      now: new Date(),
    }),
    positions: board.positions.length,
  };
  void openResearch;

  const strategies = {
    ...buildStrategies({
      tracks: board.tracks,
      overview,
      trades: tradeLite,
      research,
      archive: archive.map((a) => ({
        name: a.name,
        version: a.version,
        stoppedAt: a.stoppedAt,
        trades: a.runs[0]?.metric?.trades ?? null,
        cagrMdd: a.runs[0]?.metric?.cagrMdd ?? null,
      })),
      wallets: board.whale?.eligible ?? null,
      now: new Date(),
    }),
    portfolio,
    // 전략 상세(`/strategies/[id]`)가 자본 곡선을 그린다. **API 를 두 번 부르지 않게**
    // 여기 같이 싣는다(UI-02 F — 화면 하나에 필요한 걸 한 번에).
    series: series.filter((s) => s.points.length > 0),
  };

  const positions = buildPositions({
    positions: board.positions,
    trackLabels: Object.fromEntries(board.tracks.map((t) => [t.key, t.label])),
    research,
    lastAt,
  });
  const charts = buildCharts(chartRows);

  const whales = buildWhales({
    whale: board.whale,
    research,
    followAvgHoldHours: strategies.rows.find((r) => r.key === "whale")?.avgHoldHours ?? null,
  });

  const researchPayload = {
    items: research,
    open: openResearch.length,
    blocked: research.filter((r) => r.status === "blocked").length,
    closed: research.filter((r) => r.status === "closed").length,
    blockers: research
      .filter((r) => r.status === "blocked" && r.blocks)
      .map((r) => ({ no: r.no, title: r.title, blocks: r.blocks })),
  };

  // 복기의 거래 수는 Overview `stats.trades` 와 **같은 행들**(FceTrade · exitAt 있음)을 센다(B-5).
  const journal = ledger;

  return {
    payloads: {
      overview,
      strategies,
      positions,
      whales,
      research: researchPayload,
      journal,
      charts,
    },
    sync,
  };
}

/** 화면 쪽이 받는 조립본 모양. **서버와 같은 정의에서 나온다.** */
export type Payloads = Awaited<ReturnType<typeof assemblePayloads>>["payloads"];

/**
 * 여섯 탭을 통째로 만들어 쓴다. **업로드가 끝난 뒤 한 번** 부른다.
 *
 * 읽기는 여기서 실컷 한다 — 이 함수는 15분에 한 번 도는 쓰기 경로에 있고,
 * 화면 요청 경로에 있지 않다.
 */
export async function buildSnapshots(options: { justUploadedAt?: Date } = {}): Promise<SnapshotKey[]> {
  const { payloads, sync } = await assemblePayloads(options);
  const keys = Object.keys(payloads) as SnapshotKey[];

  // **여섯 개를 한 문장으로 쓴다.** `upsert` 여섯 번이면 왕복이 여섯 번이고,
  // 이 쓰기 경로는 이미 60초 한도에 붙어 있었다(실측 60.9초).
  const now = new Date();
  const values = keys.map(
    (key) =>
      Prisma.sql`(${key}, ${JSON.stringify({ v: SNAPSHOT_VERSION, payload: payloads[key], sync })}::jsonb, ${now})`
  );
  await prisma.$executeRaw`
    INSERT INTO "LabSnapshot" ("key", "payload", "builtAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("key") DO UPDATE
      SET "payload" = EXCLUDED."payload", "builtAt" = EXCLUDED."builtAt"
  `;
  return keys;
}

/**
 * 조립본 하나. **쿼리 한 번이다.**
 *
 * 없으면 `null`, 형식 번호가 다르면 `"outdated"` 를 낸다. 둘을 가르는 이유는 할 일이 달라서다 —
 * 없으면 러너를 켜야 하고, 옛 형식이면 다음 업로드(또는 `POST /api/lab/snapshot`)가 고친다.
 */
export async function readSnapshot<T>(key: SnapshotKey): Promise<Snapshot<T> | null | "outdated"> {
  const row = await prisma.labSnapshot.findUnique({ where: { key } });
  if (!row) return null;
  const body = row.payload as unknown as { v?: number; payload: T; sync: SyncSeed };
  if (body.v !== SNAPSHOT_VERSION) return "outdated";
  return { key, payload: body.payload, sync: body.sync, builtAt: row.builtAt };
}

/**
 * 조립본 여럿을 **쿼리 한 번에.** 포지션 상세가 목록(`positions`)과 캔들(`charts`)을 같이 본다 —
 * 두 번 부르면 왕복이 두 번(~1.8초)이다. 하나라도 없거나 옛 형식이면 그 자리가 null · "outdated".
 */
export async function readSnapshots<T extends Partial<Record<SnapshotKey, unknown>>>(
  keys: (keyof T & SnapshotKey)[]
): Promise<{ [K in keyof T]: Snapshot<T[K]> | null | "outdated" }> {
  const rows = await prisma.labSnapshot.findMany({ where: { key: { in: keys } } });
  const out = {} as { [K in keyof T]: Snapshot<T[K]> | null | "outdated" };
  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    if (!row) {
      out[key] = null;
      continue;
    }
    const body = row.payload as unknown as { v?: number; payload: T[typeof key]; sync: SyncSeed };
    out[key] =
      body.v !== SNAPSHOT_VERSION ? "outdated" : { key, payload: body.payload, sync: body.sync, builtAt: row.builtAt };
  }
  return out;
}
