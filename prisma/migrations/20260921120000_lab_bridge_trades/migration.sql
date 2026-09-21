-- 닫힌 거래 이력. 새 테이블 하나만 만든다 — DROP 이 없다.
--
-- 포지션(`FcePosition`)과 달리 지우고 다시 넣지 않는다. 닫힌 거래는 사실이고,
-- FCE 가 리셋해도 랩에는 남아야 한다.
--
-- 목표가·손절선 칸이 없는 것은 실수가 아니다. FCE 는 주지만 받지 않는다 —
-- `LAB-08` 이 화면에서 막은 값이고, 받아두면 언젠가 샌다.

CREATE TABLE "FceTrade" (
    "id" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "assetClass" TEXT,
    "timeframe" TEXT,
    "leverage" DOUBLE PRECISION,
    "marginUsdt" DOUBLE PRECISION,
    "entryAt" TIMESTAMP(3),
    "entryPrice" DOUBLE PRECISION,
    "exitAt" TIMESTAMP(3),
    "exitPrice" DOUBLE PRECISION,
    "grossPnlUsdt" DOUBLE PRECISION,
    "costsUsdt" DOUBLE PRECISION,
    "netPnlUsdt" DOUBLE PRECISION,
    "netReturnPct" DOUBLE PRECISION,
    "exitReason" TEXT,
    "lossTags" JSONB,
    "holdingBars" INTEGER,
    "asOf" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FceTrade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FceTrade_trackKey_exitAt_idx" ON "FceTrade"("trackKey", "exitAt");
CREATE INDEX "FceTrade_exitAt_idx" ON "FceTrade"("exitAt");
