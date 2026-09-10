-- LAB-02 데이터 모델 — 백테스트와 페이퍼가 같은 테이블에 쌓인다.
--
-- 이 파일은 `prisma migrate diff` 출력을 그대로 쓰지 않았다. 개명 블록(1번)은
-- 손으로 썼다 — diff 는 개명을 DROP + CREATE 로 내고, 그러면 레거시 페이퍼 데이터가
-- 날아간다. 2번 이후는 개명이 적용된 DB 에서 diff 를 다시 떠서 붙인 것이라
-- DROP 문이 하나도 없다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 레거시 페이퍼 테이블 개명 — 데이터는 그대로 둔다.
--
-- `Strategy`·`Trade` 라는 이름을 랩이 쓴다. 레거시(apps/api 의 낱개 주문 모델)는
-- 알갱이가 달라서 합칠 수 없다 — 랩의 Trade 는 포지션 하나의 생애이고
-- 레거시 Trade 는 체결 한 건이다.
--
-- Prisma 의 `migrate diff` 는 개명을 인식하지 못해 DROP + CREATE 를 낸다.
-- 그대로 쓰면 레거시 데이터가 날아가므로 이 블록은 손으로 썼다.
-- `ALTER TABLE ... RENAME TO` 는 이 테이블을 가리키는 FK 를 자동으로 따라온다.
-- 제약·인덱스 이름은 따라오지 않으므로 같이 옮긴다.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Strategy" RENAME TO "LegacyStrategy";
ALTER TABLE "Trade" RENAME TO "LegacyTrade";

ALTER INDEX "Strategy_pkey" RENAME TO "LegacyStrategy_pkey";
ALTER INDEX "Strategy_botId_key_key" RENAME TO "LegacyStrategy_botId_key_key";
ALTER TABLE "LegacyStrategy" RENAME CONSTRAINT "Strategy_botId_fkey" TO "LegacyStrategy_botId_fkey";

ALTER INDEX "Trade_pkey" RENAME TO "LegacyTrade_pkey";
ALTER INDEX "Trade_botId_executedAt_idx" RENAME TO "LegacyTrade_botId_executedAt_idx";
ALTER INDEX "Trade_strategyId_idx" RENAME TO "LegacyTrade_strategyId_idx";
ALTER INDEX "Trade_positionId_idx" RENAME TO "LegacyTrade_positionId_idx";
ALTER INDEX "Trade_sessionId_executedAt_idx" RENAME TO "LegacyTrade_sessionId_executedAt_idx";
ALTER TABLE "LegacyTrade" RENAME CONSTRAINT "Trade_botId_fkey" TO "LegacyTrade_botId_fkey";
ALTER TABLE "LegacyTrade" RENAME CONSTRAINT "Trade_strategyId_fkey" TO "LegacyTrade_strategyId_fkey";
ALTER TABLE "LegacyTrade" RENAME CONSTRAINT "Trade_positionId_fkey" TO "LegacyTrade_positionId_fkey";
ALTER TABLE "LegacyTrade" RENAME CONSTRAINT "Trade_sessionId_fkey" TO "LegacyTrade_sessionId_fkey";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 랩 테이블 — Strategy · Run · Trade · Equity · Metric · Benchmark
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('CRYPTO', 'STOCK', 'POLYMARKET');

-- CreateEnum
CREATE TYPE "StrategyState" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "RunKind" AS ENUM ('BACKTEST', 'PAPER', 'LIVE', 'LEGACY');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "ExitReason" AS ENUM ('STOP', 'TARGET', 'TIME', 'SIGNAL', 'MANUAL');

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "market" "Market" NOT NULL,
    "definition" JSONB NOT NULL,
    "status" "StrategyState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "kind" "RunKind" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "initialCapital" DECIMAL(30,10) NOT NULL,
    "dataVersion" TEXT NOT NULL,
    "paramsVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "entryAt" TIMESTAMP(3) NOT NULL,
    "entryPrice" DECIMAL(30,10) NOT NULL,
    "entryReason" TEXT NOT NULL,
    "exitAt" TIMESTAMP(3),
    "exitPrice" DECIMAL(30,10),
    "exitReason" "ExitReason",
    "qty" DECIMAL(30,10) NOT NULL,
    "fee" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "slippage" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "funding" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "pnl" DECIMAL(30,10),
    "pnlPct" DOUBLE PRECISION,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equity" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "equity" DECIMAL(30,10) NOT NULL,
    "cash" DECIMAL(30,10) NOT NULL,
    "unrealized" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "drawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Equity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "runId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cagr" DOUBLE PRECISION,
    "totalReturn" DOUBLE PRECISION,
    "mdd" DOUBLE PRECISION,
    "cagrMdd" DOUBLE PRECISION,
    "sharpe" DOUBLE PRECISION,
    "sortino" DOUBLE PRECISION,
    "trades" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION,
    "profitFactor" DOUBLE PRECISION,
    "avgHoldHours" DOUBLE PRECISION,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(30,10) NOT NULL,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Strategy_status_market_idx" ON "Strategy"("status", "market");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_name_version_key" ON "Strategy"("name", "version");

-- CreateIndex
CREATE INDEX "Run_strategyId_kind_idx" ON "Run"("strategyId", "kind");

-- CreateIndex
CREATE INDEX "Run_kind_createdAt_idx" ON "Run"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Trade_runId_entryAt_idx" ON "Trade"("runId", "entryAt");

-- CreateIndex
CREATE INDEX "Trade_runId_exitAt_idx" ON "Trade"("runId", "exitAt");

-- CreateIndex
CREATE INDEX "Trade_symbol_entryAt_idx" ON "Trade"("symbol", "entryAt");

-- CreateIndex
CREATE INDEX "Equity_runId_at_idx" ON "Equity"("runId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Equity_runId_at_key" ON "Equity"("runId", "at");

-- CreateIndex
CREATE INDEX "Metric_cagrMdd_idx" ON "Metric"("cagrMdd");

-- CreateIndex
CREATE INDEX "Benchmark_symbol_at_idx" ON "Benchmark"("symbol", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_symbol_at_key" ON "Benchmark"("symbol", "at");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equity" ADD CONSTRAINT "Equity_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

