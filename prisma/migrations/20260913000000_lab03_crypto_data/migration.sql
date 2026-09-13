-- CreateEnum
CREATE TYPE "CandleInterval" AS ENUM ('H1', 'D1');

-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(30,10) NOT NULL,
    "high" DECIMAL(30,10) NOT NULL,
    "low" DECIMAL(30,10) NOT NULL,
    "close" DECIMAL(30,10) NOT NULL,
    "volume" DECIMAL(30,10) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funding" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "rate" DECIMAL(20,12) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "Funding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LatestPrice" (
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(30,10) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "LatestPrice_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "WhalePosition" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DECIMAL(30,10) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "WhalePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataGap" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "fromAt" TIMESTAMP(3) NOT NULL,
    "toAt" TIMESTAMP(3) NOT NULL,
    "missing" INTEGER NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "detail" JSONB,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candle_symbol_interval_at_idx" ON "Candle"("symbol", "interval", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_symbol_interval_at_key" ON "Candle"("symbol", "interval", "at");

-- CreateIndex
CREATE INDEX "Funding_symbol_at_idx" ON "Funding"("symbol", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Funding_symbol_at_key" ON "Funding"("symbol", "at");

-- CreateIndex
CREATE INDEX "LatestPrice_fetchedAt_idx" ON "LatestPrice"("fetchedAt");

-- CreateIndex
CREATE INDEX "WhalePosition_symbol_at_idx" ON "WhalePosition"("symbol", "at");

-- CreateIndex
CREATE INDEX "WhalePosition_at_idx" ON "WhalePosition"("at");

-- CreateIndex
CREATE UNIQUE INDEX "WhalePosition_address_symbol_at_key" ON "WhalePosition"("address", "symbol", "at");

-- CreateIndex
CREATE INDEX "DataGap_symbol_interval_fromAt_idx" ON "DataGap"("symbol", "interval", "fromAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataGap_symbol_interval_fromAt_key" ON "DataGap"("symbol", "interval", "fromAt");

-- CreateIndex
CREATE INDEX "CollectionRun_job_finishedAt_idx" ON "CollectionRun"("job", "finishedAt");

