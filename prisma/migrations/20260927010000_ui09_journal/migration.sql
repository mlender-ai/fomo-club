-- UI-09 복기 — 거래별 진입 근거 · 조건 · 사후 채점 (한 줄)
CREATE TABLE "FceJournal" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "details" JSONB NOT NULL,
  "postExit" JSONB NOT NULL,
  "asOf" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FceJournal_pkey" PRIMARY KEY ("id")
);
