-- LAB-BRIDGE — FCE 거울 표 넷.
--
-- **DROP 문이 하나도 없다.** 전부 새 표다. 기존 데이터를 건드리지 않는다.
-- (이 레포의 마이그레이션 규약: `docs/lab/DATA_MODEL.md` · `lab-migrate.yml`)

CREATE TABLE "FceUpload" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "tracks" INTEGER NOT NULL DEFAULT 0,
    "positions" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "ms" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FceUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FceUpload_at_idx" ON "FceUpload"("at");

CREATE TABLE "FceTrack" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "startingCapital" DECIMAL(30,10) NOT NULL,
    "currentCapital" DECIMAL(30,10),
    "realized" DECIMAL(30,10),
    "unrealized" DECIMAL(30,10),
    "returnPct" DOUBLE PRECISION,
    "trades" INTEGER,
    "winRatePct" DOUBLE PRECISION,
    "profitFactor" DOUBLE PRECISION,
    "mddPct" DOUBLE PRECISION,
    "sampleNote" TEXT,
    "status" TEXT NOT NULL,
    "statusReason" TEXT,
    "leverage" DOUBLE PRECISION,
    "benchmarkLabel" TEXT,
    "benchmarkStart" DOUBLE PRECISION,
    "benchmarkCurrent" DOUBLE PRECISION,
    "benchmarkReturnPct" DOUBLE PRECISION,
    "evidenceNote" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FceTrack_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "FcePosition" (
    "id" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "leverage" DOUBLE PRECISION,
    "marginUsdt" DOUBLE PRECISION,
    "netReturnPct" DOUBLE PRECISION,
    "healthScore" INTEGER,
    "entryAt" TIMESTAMP(3),
    "entryPrice" DOUBLE PRECISION,
    "asOf" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FcePosition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FcePosition_trackKey_asOf_idx" ON "FcePosition"("trackKey", "asOf");

CREATE TABLE "FceWhale" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "walletsTotal" INTEGER NOT NULL,
    "eligible" INTEGER NOT NULL,
    "rejected" JSONB NOT NULL,
    "passers" JSONB NOT NULL,
    "followWinPct" DOUBLE PRECISION,
    "followTrades" INTEGER,
    "followPf" DOUBLE PRECISION,
    "followNetUsdt" DOUBLE PRECISION,
    "latency" JSONB,
    "drift" JSONB,
    "asOf" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FceWhale_pkey" PRIMARY KEY ("id")
);
