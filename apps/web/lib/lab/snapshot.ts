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
import { buildPortfolio } from "./portfolio";
import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";

export type SnapshotKey =
  | "overview"
  | "strategies"
  | "positions"
  | "whales"
  | "research"
  | "journal";

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
export const SNAPSHOT_VERSION = 2;

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
 * 지연·드리프트 분포를 한 줄로. FCE 가 `{ median, p90, max }` 로 준다.
 * 값이 없으면 null — **지어내지 않는다.**
 */
function describeDist(box: Record<string, unknown> | null, unit: string): string | null {
  if (!box) return null;
  const pick = (k: string) => (typeof box[k] === "number" ? Math.round((box[k] as number) * 100) / 100 : null);
  const med = pick("median");
  const p90 = pick("p90");
  const max = pick("max");
  if (med === null && p90 === null && max === null) return null;
  const parts = [
    med !== null ? `중앙값 ${med}${unit}` : null,
    p90 !== null ? `p90 ${p90}${unit}` : null,
    max !== null ? `최대 ${max}${unit}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** `LAB-00 §7` — 표본 30 미만은 순위 없음. */
const MIN_SAMPLE = 30;

/** FCE 온체인 리포트가 낸 값. 랩이 계산하지 않는다. */
const WHALE_OWN_WIN_PCT = 65.8;

/**
 * 여섯 탭의 조립본을 **읽어서 만든다.** 쓰지는 않는다.
 *
 * 쓰기와 가른 이유는 타입이다 — 화면이 같은 모양을 보게 `Payloads` 를 여기서
 * 뽑아 내보낸다. 서버가 한 칸을 바꾸면 화면 쪽 타입이 같이 깨진다.
 */
export async function assemblePayloads() {
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

  const sync: SyncSeed = {
    lastAt: lastOk?.at.toISOString() ?? null,
    lastError: lastFail?.error ? { at: lastFail.at.toISOString(), error: lastFail.error } : null,
  };

  const openResearch = research.filter((r) => r.status === "open" || r.status === "testing");

  const strategyRows = board.tracks.map((t) => ({
    key: t.key,
    label: t.label,
    returnPct: t.returnPct,
    mddPct: t.mddPct,
    // 낙폭이 0 이면 나눌 수 없다 — **`Infinity` 를 만들지 않는다.**
    returnOverMdd:
      t.returnPct !== null && t.mddPct !== null && Math.abs(t.mddPct) > 1e-9
        ? t.returnPct / Math.abs(t.mddPct)
        : null,
    trades: t.trades,
    winRatePct: t.winRatePct,
    profitFactor: t.profitFactor,
    leverage: t.leverage,
    status: t.status,
    statusReason: t.statusReason,
    sampleNote: t.sampleNote,
    benchmarkLabel: t.benchmarkLabel,
    benchmarkReturnPct: t.benchmarkReturnPct,
    elapsedDays: t.elapsedDays,
    calendarDays: t.calendarDays,
    ranked: (t.trades ?? 0) >= MIN_SAMPLE,
    beatsBenchmark:
      t.returnPct !== null && t.benchmarkReturnPct !== null
        ? t.returnPct > t.benchmarkReturnPct
        : null,
  }));

  const measurable = board.positions.filter(
    (p) => p.netReturnPct !== null && p.marginUsdt !== null
  );
  const unrealized = measurable.reduce(
    (sum, p) => sum + ((p.marginUsdt ?? 0) * (p.netReturnPct ?? 0)) / 100,
    0
  );

  const overview = {
    portfolio,
    series: series.filter((s) => s.points.length > 0),
    research: { open: openResearch.length, items: openResearch.slice(0, 5) },
    positions: board.positions.length,
    freshness: board.freshness,
  };

  const strategies = {
    rows: strategyRows,
    beatCount: strategyRows.filter((r) => r.beatsBenchmark === true).length,
    rankableCount: strategyRows.filter((r) => r.ranked).length,
    minSample: MIN_SAMPLE,
    portfolio,
    // 전략 상세(`/strategies/[id]`)가 자본 곡선을 그린다. **API 를 두 번 부르지 않게**
    // 여기 같이 싣는다(UI-02 F — 화면 하나에 필요한 걸 한 번에).
    series: series.filter((s) => s.points.length > 0),
  };

  const positions = {
    positions: board.positions,
    unrealizedUsdt: measurable.length > 0 ? unrealized : null,
    measurable: measurable.length,
    total: board.positions.length,
    liquidationLevel: board.positions.filter((p) => p.liquidationLevel).length,
    caveat:
      "손익은 증거금 대비다. FCE 에 청산 모델이 없어 −100% 아래로 갈 수 있다 — 실제 거래소였으면 그 전에 증거금이 없어진다.",
  };

  const whales = board.whale
    ? {
        whale: board.whale,
        winRates: {
          whaleOwn: {
            value: WHALE_OWN_WIN_PCT,
            measures: "그 지갑의 온체인 체결 전부 — 고래의 자본·판단·출구",
          },
          ourFollow: {
            value: board.whale.followWinPct,
            trades: board.whale.followTrades,
            measures: "우리가 따라 들어간 거래 — 우리 사이징·우리 출구",
          },
          /** **빼면 안 된다.** 화면이 이 값을 보고 뺄셈을 막는다. */
          subtractable: false as const,
          note: "다른 모집단이다. 33.4%p 는 갭이 아니라 서로 다른 질문의 답 두 개다.",
        },
        causes: [
          {
            axis: "청산 규칙",
            measured: "고래 청산을 그대로 따랐다면 −49.58 (75건)" as string | null,
            verdict: "원인 아님 — 따라가면 더 나빴다",
          },
          { axis: "진입 지연", measured: describeDist(board.whale.latency, "분"), verdict: "중앙값이 1분 안 — 약한 후보" },
          {
            axis: "진입 가격 드리프트",
            measured: describeDist(board.whale.drift, "%"),
            verdict: "손절폭 대비. p90 구간을 따로 볼 것",
          },
          { axis: "사이징", measured: null, verdict: "미측정" },
          { axis: "지갑 선정", measured: null, verdict: "미측정 — 리더보드에 재료 있음" },
        ],
      }
    : { whale: null, winRates: null, causes: [] };

  const researchPayload = {
    items: research,
    open: openResearch.length,
    blocked: research.filter((r) => r.status === "blocked").length,
    closed: research.filter((r) => r.status === "closed").length,
    blockers: research
      .filter((r) => r.status === "blocked" && r.blocks)
      .map((r) => ({ no: r.no, title: r.title, blocks: r.blocks })),
  };

  const journal = {
    ...ledger,
    countNote:
      ledger.boardCount !== null && ledger.boardCount !== ledger.total.count
        ? "전광판은 검증 창 안에서 닫힌 거래만 센다. 이 표는 랩이 받아 쌓은 전부다. 두 수를 빼서 쓰지 않는다."
        : null,
  };

  return {
    payloads: {
      overview,
      strategies,
      positions,
      whales,
      research: researchPayload,
      journal,
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
export async function buildSnapshots(): Promise<SnapshotKey[]> {
  const { payloads, sync } = await assemblePayloads();
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
