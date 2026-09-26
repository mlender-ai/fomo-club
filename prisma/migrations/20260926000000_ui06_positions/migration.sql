-- UI-06 포지션 — 페이퍼 포지션의 현재가·수량·비용·가격선 · 캔들 차트
ALTER TABLE "FcePosition"
  ADD COLUMN "markPrice" DOUBLE PRECISION,
  ADD COLUMN "quantity" DOUBLE PRECISION,
  ADD COLUMN "notionalUsdt" DOUBLE PRECISION,
  ADD COLUMN "costsUsdt" DOUBLE PRECISION,
  ADD COLUMN "unrealizedUsdt" DOUBLE PRECISION,
  ADD COLUMN "timeframe" TEXT,
  ADD COLUMN "stance" TEXT,
  ADD COLUMN "invalidationPrice" DOUBLE PRECISION,
  ADD COLUMN "stopPrice" DOUBLE PRECISION,
  ADD COLUMN "takeProfitPrice" DOUBLE PRECISION,
  ADD COLUMN "takeProfit2Price" DOUBLE PRECISION,
  ADD COLUMN "invalidationDistancePct" DOUBLE PRECISION,
  ADD COLUMN "takeProfitDistancePct" DOUBLE PRECISION;

CREATE TABLE "FcePositionChart" (
  "symbol" TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "candles" JSONB NOT NULL,
  "asOf" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FcePositionChart_pkey" PRIMARY KEY ("symbol", "timeframe")
);
