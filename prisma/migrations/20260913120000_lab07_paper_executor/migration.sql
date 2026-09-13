-- CreateTable
CREATE TABLE "PaperState" (
    "runId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "lastBarAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperState_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "JobLock" (
    "job" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("job")
);

-- CreateIndex
CREATE INDEX "JobLock_expiresAt_idx" ON "JobLock"("expiresAt");

-- AddForeignKey
ALTER TABLE "PaperState" ADD CONSTRAINT "PaperState_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

