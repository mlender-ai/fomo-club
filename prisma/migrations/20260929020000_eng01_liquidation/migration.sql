-- ENG-01 강제청산 — 포지션 청산가 · 재채점(기록과 따로)
ALTER TABLE "FcePosition" ADD COLUMN "liquidationPrice" DOUBLE PRECISION;

CREATE TABLE "FceRescore" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FceRescore_pkey" PRIMARY KEY ("id")
);
