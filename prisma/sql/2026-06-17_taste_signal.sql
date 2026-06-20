-- 트랙 B Phase 1 — 취향 학습 적재 테이블(추가형). prod 적용용.
-- 적용: prod DATABASE_URL 환경에서  `npx prisma db push`  (db push 워크플로우)
--   또는  `npx prisma db execute --file prisma/sql/2026-06-17_taste_signal.sql --schema prisma/schema.prisma`
-- 순수 추가형 — 기존 테이블 ALTER/DROP 없음. User FK 는 ON DELETE CASCADE(탈퇴 시 자동 삭제).

CREATE TYPE "TasteSubjectType" AS ENUM ('THEME', 'STOCK');
CREATE TYPE "TasteSignalKind" AS ENUM ('MORE', 'LESS', 'VIEW_DEPTH', 'TAP_RELATED');

CREATE TABLE "TasteSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "subjectType" "TasteSubjectType" NOT NULL,
    "subject" TEXT NOT NULL,
    "signal" "TasteSignalKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TasteSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TasteSignal_userId_createdAt_idx" ON "TasteSignal"("userId", "createdAt");
CREATE INDEX "TasteSignal_sessionId_createdAt_idx" ON "TasteSignal"("sessionId", "createdAt");
CREATE INDEX "TasteSignal_subjectType_subject_idx" ON "TasteSignal"("subjectType", "subject");

ALTER TABLE "TasteSignal" ADD CONSTRAINT "TasteSignal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
