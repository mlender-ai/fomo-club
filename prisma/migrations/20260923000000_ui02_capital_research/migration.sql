-- UI-02 — 자본 시계열과 연구 항목.
--
-- 새 표 둘만 만든다. DROP 이 없다.
--
-- `FceCapitalPoint.source` 가 `fce` 인지 `reconstructed` 인지 구분하는 이유는
-- docs/ui/DATA_SOURCES.md §3 에 있다 — FCE 에 자본 이력이 없어서 거래 이력으로
-- 되만들고, 되만든 곡선은 미실현이 빠진 계단이다. 화면이 그걸 말해야 한다.

CREATE TABLE "FceCapitalPoint" (
    "id" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "capital" DOUBLE PRECISION NOT NULL,
    "benchmark" DOUBLE PRECISION,
    "source" TEXT NOT NULL,

    CONSTRAINT "FceCapitalPoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FceCapitalPoint_trackKey_at_key" ON "FceCapitalPoint"("trackKey", "at");
CREATE INDEX "FceCapitalPoint_trackKey_at_idx" ON "FceCapitalPoint"("trackKey", "at");

CREATE TABLE "Research" (
    "no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verdict" TEXT,
    "summary" TEXT NOT NULL,
    "hypothesis" TEXT,
    "method" TEXT,
    "evidence" JSONB,
    "decision" TEXT,
    "blocks" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "trackKeys" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Research_pkey" PRIMARY KEY ("no")
);

CREATE INDEX "Research_status_idx" ON "Research"("status");
