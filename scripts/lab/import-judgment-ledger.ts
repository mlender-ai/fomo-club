/**
 * LAB-02 PART C — 판단 원장을 `Trade` 로 옮긴다.
 *
 * **과거 기록을 버리지 않는다.** `LAB-09` 에서 비교 대상이 된다.
 * 원장 테이블(`JudgmentLedger`)은 **읽기만** 한다 — 지우지 않는다(하지 말 것 3).
 *
 * ## 매핑 (지시서 PART C)
 *
 * | 원장 | Trade |
 * |---|---|
 * | 발행 시각 (`kind=selection` 의 `ts`) | `entryAt` |
 * | 발행 시 가격 (`priceAt`) | `entryPrice` |
 * | 신호 종류 (`payload.signalTypes`) | `entryReason` |
 * | T+N 채점 (`kind=outcome`) | `exitAt` · `exitPrice` · `exitReason=TIME` |
 *
 * ## Run 을 왜 여럿 만드나
 *
 * 지시서는 "별도 Run(kind: legacy)" 이라고 썼다. 그런데 채점 창이 **7·30·90일 셋**이다
 * (`TRACK_WINDOWS`). 셋을 한 Run 에 넣으면 같은 발행이 세 번 겹쳐 들어가 그 Run 의
 * 자산곡선과 지표가 의미를 잃는다. 지표를 지는 단위가 Run 이므로 **창은 Run 에 붙는다.**
 * 자산(kr-stock·us-stock·coin)도 시장이 달라 Strategy 를 나눈다.
 *
 * 그래서: Strategy = 자산별, Run = (자산 × 창). `kind=LEGACY` 라 **순위에서 제외된다.**
 *
 * ## 이 Run 들이 랩 전략과 절대 수익률로 비교되지 않는 이유
 *
 * 원장에는 수량·수수료·슬리피지가 **없다.** 발행과 가격만 있다. 그래서
 * `qty=1`(단위 포지션), `fee=slippage=funding=0` 으로 넣는다. **구멍을 메운 것이
 * 아니라 원장에 없던 것을 0 으로 적은 것이고**, 비용이 0 인 성적은 비용을 물는
 * 랩 전략보다 무조건 좋아 보인다. `kind=LEGACY` 가 순위에서 빠지는 이유가 이것이다.
 *
 * ## 다시 돌려도 안전하다
 *
 * id 를 원장 키에서 결정적으로 만든다(`lg-<selectionId>-<window>`). 재실행은 덮어쓴다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/import-judgment-ledger.ts [--dry]
 */
import { Prisma, PrismaClient } from "@prisma/client";

/** `packages/dormant/web/lib/ledger-track-record.ts` 의 `TRACK_WINDOWS` 와 같아야 한다. */
const TRACK_WINDOWS = [7, 30, 90] as const;

/** 원장 `asset` → 랩 `Market`. `macro` 는 체결 대상이 아니라 제외한다. */
const ASSET_MARKET: Record<string, "STOCK" | "CRYPTO"> = {
  "kr-stock": "STOCK",
  "us-stock": "STOCK",
  coin: "CRYPTO",
};

const DRY = process.argv.includes("--dry");
const prisma = new PrismaClient();

interface SelectionRow {
  id: string;
  date: string;
  ts: Date;
  asset: string;
  canonical: string;
  symbol: string | null;
  priceAt: Prisma.Decimal;
  payload: Prisma.JsonValue;
}

interface OutcomeRow {
  ts: Date;
  priceAt: Prisma.Decimal;
  payload: Prisma.JsonValue;
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 신호 종류 → `entryReason`. **없으면 그렇게 적는다** — 추측하지 않는다. */
function entryReasonOf(payload: Prisma.JsonValue): string {
  const p = asRecord(payload);
  const types = Array.isArray(p.signalTypes)
    ? p.signalTypes.filter((t): t is string => typeof t === "string")
    : [];
  const pickType = typeof p.pickType === "string" ? p.pickType : null;
  const parts: string[] = [];
  if (pickType) parts.push(`pick:${pickType}`);
  parts.push(types.length > 0 ? `signals:${types.join("+")}` : "signals:none-recorded");
  return parts.join(" ");
}

async function main(): Promise<void> {
  const selections = await prisma.$queryRaw<SelectionRow[]>`
    SELECT id, date, ts, asset, canonical, symbol, "priceAt", payload
      FROM "JudgmentLedger"
     WHERE kind = 'selection' AND "priceAt" > 0
     ORDER BY ts ASC
  `;
  const outcomes = await prisma.$queryRaw<OutcomeRow[]>`
    SELECT ts, "priceAt", payload FROM "JudgmentLedger" WHERE kind = 'outcome'
  `;

  console.log(`원장: selection ${selections.length}행 · outcome ${outcomes.length}행`);

  /** `selectionId:windowDays` → 채점 결과. */
  const outcomeBy = new Map<string, OutcomeRow & { returnPct: number | null }>();
  for (const row of outcomes) {
    const p = asRecord(row.payload);
    const selectionId = typeof p.selectionId === "string" ? p.selectionId : null;
    const windowDays = typeof p.windowDays === "number" ? p.windowDays : null;
    if (!selectionId || windowDays === null) continue;
    outcomeBy.set(`${selectionId}:${windowDays}`, {
      ...row,
      returnPct: typeof p.returnPct === "number" ? p.returnPct : null,
    });
  }

  const strategies = new Map<string, { id: string; name: string; market: "STOCK" | "CRYPTO" }>();
  const runs = new Map<string, { id: string; strategyId: string; window: number; start: Date; end: Date }>();
  const trades: Prisma.TradeCreateManyInput[] = [];

  let skippedAsset = 0;
  let open = 0;

  for (const selection of selections) {
    const market = ASSET_MARKET[selection.asset];
    if (!market) {
      skippedAsset += 1;
      continue;
    }
    const strategyId = `lg-strategy-${selection.asset}`;
    if (!strategies.has(strategyId)) {
      strategies.set(strategyId, {
        id: strategyId,
        name: `판단 원장 발행 · ${selection.asset}`,
        market,
      });
    }

    for (const window of TRACK_WINDOWS) {
      const runId = `lg-run-${selection.asset}-t${window}`;
      const existing = runs.get(runId);
      if (!existing) {
        runs.set(runId, {
          id: runId,
          strategyId,
          window,
          start: selection.ts,
          end: selection.ts,
        });
      } else {
        if (selection.ts < existing.start) existing.start = selection.ts;
        if (selection.ts > existing.end) existing.end = selection.ts;
      }

      const outcome = outcomeBy.get(`${selection.id}:${window}`);
      const entryPrice = selection.priceAt;
      const symbol = selection.symbol ?? selection.canonical;

      if (!outcome) {
        // 아직 채점 전이다. 보유중으로 넣는다 — 버리지 않는다.
        open += 1;
        trades.push({
          id: `lg-${selection.id}-t${window}`,
          runId,
          symbol,
          side: "LONG",
          entryAt: selection.ts,
          entryPrice,
          entryReason: entryReasonOf(selection.payload),
          qty: new Prisma.Decimal(1),
        });
        continue;
      }

      const exitPrice = outcome.priceAt;
      // pnl 은 단위 포지션(qty=1) 기준. 원장에 수량이 없어서 그렇게 적는다.
      const pnl = exitPrice.minus(entryPrice);
      trades.push({
        id: `lg-${selection.id}-t${window}`,
        runId,
        symbol,
        side: "LONG",
        entryAt: selection.ts,
        entryPrice,
        entryReason: entryReasonOf(selection.payload),
        exitAt: outcome.ts,
        exitPrice,
        exitReason: "TIME",
        qty: new Prisma.Decimal(1),
        pnl,
        ...(outcome.returnPct === null ? {} : { pnlPct: outcome.returnPct }),
      });
    }
  }

  console.log(
    `만들 것: Strategy ${strategies.size} · Run ${runs.size} · Trade ${trades.length} ` +
      `(보유중 ${open}, 자산 제외 ${skippedAsset})`
  );

  if (DRY) {
    console.log("--dry — 쓰지 않고 끝낸다");
    return;
  }
  if (trades.length === 0) {
    console.log("옮길 것이 없다. 원장이 비었거나 selection 행이 없다.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const strategy of strategies.values()) {
      await tx.strategy.upsert({
        where: { id: strategy.id },
        create: {
          id: strategy.id,
          name: strategy.name,
          version: 1,
          market: strategy.market,
          // 정의가 없다. 원장은 규칙이 아니라 발행 기록이다 — 없는 규칙을 만들지 않는다.
          definition: { source: "judgment-ledger", note: "규칙 정의 없음 — 발행 기록 이전분" },
          status: "STOPPED",
          stopReason: "판단 원장 이전분. 랩 전략이 아니다(LAB-02 PART C).",
        },
        update: { name: strategy.name, market: strategy.market },
      });
    }

    for (const run of runs.values()) {
      await tx.run.upsert({
        where: { id: run.id },
        create: {
          id: run.id,
          strategyId: run.strategyId,
          kind: "LEGACY",
          periodStart: run.start,
          periodEnd: run.end,
          initialCapital: new Prisma.Decimal(0),
          dataVersion: "judgment-ledger",
          paramsVersion: `lab02-import-t${run.window}`,
        },
        update: { periodStart: run.start, periodEnd: run.end },
      });
    }

    // 재실행 시 같은 Run 의 이전분만 갈아낀다. 원장은 건드리지 않는다.
    await tx.trade.deleteMany({ where: { runId: { in: [...runs.keys()] } } });
    const inserted = await tx.trade.createMany({ data: trades, skipDuplicates: true });
    console.log(`Trade ${inserted.count}행 적재`);
  });

  const byRun = await prisma.trade.groupBy({
    by: ["runId"],
    where: { runId: { in: [...runs.keys()] } },
    _count: { _all: true },
  });
  console.log("\nRun 별 건수:");
  for (const row of byRun.sort((a, b) => a.runId.localeCompare(b.runId))) {
    console.log(`  ${row.runId}  ${row._count._all}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
