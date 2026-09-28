-- OPS-03 가동 감시 · 유효일 · 평가 자산
CREATE TABLE "LabHeartbeat" (
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    CONSTRAINT "LabHeartbeat_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "LabTickSlot" (
    "track" TEXT NOT NULL,
    "slot" TIMESTAMP(3) NOT NULL,
    "live" BOOLEAN NOT NULL,
    CONSTRAINT "LabTickSlot_pkey" PRIMARY KEY ("track", "slot")
);
CREATE INDEX "LabTickSlot_slot_idx" ON "LabTickSlot"("slot");

CREATE TABLE "LabAlert" (
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabAlert_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "LabNotice" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "key" TEXT,
    "text" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL,
    "error" TEXT,
    CONSTRAINT "LabNotice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LabNotice_kind_at_idx" ON "LabNotice"("kind", "at");

CREATE TABLE "LabEquityPoint" (
    "at" TIMESTAMP(3) NOT NULL,
    "realized" DOUBLE PRECISION NOT NULL,
    "marked" DOUBLE PRECISION NOT NULL,
    "tracks" JSONB NOT NULL,
    CONSTRAINT "LabEquityPoint_pkey" PRIMARY KEY ("at")
);
