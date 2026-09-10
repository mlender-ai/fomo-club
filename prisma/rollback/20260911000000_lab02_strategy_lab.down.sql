-- LAB-02 롤백. 완료 확인 8 — "마이그레이션이 실행되고 롤백도 확인됐다".
--
-- Prisma 는 down 마이그레이션을 만들지 않는다. 그래서 손으로 쓰고
-- 실제로 돌려서 확인한다 (`npm run lab:migrate:verify`).
--
-- `prisma/migrations/` 안에 두지 않은 이유: 그 디렉터리는 적용된 마이그레이션의
-- 불변 이력이고(레포 훅이 쓰기를 막는다), 이 파일은 이력이 아니라 되돌리는 손잡이다.
--
-- 순서가 중요하다 — FK 를 가진 쪽을 먼저 지운다.
-- **레거시 테이블은 지우지 않는다. 개명만 되돌린다.**

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 랩 테이블 제거 (자식 → 부모)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "Metric";
DROP TABLE IF EXISTS "Equity";
DROP TABLE IF EXISTS "Trade";
DROP TABLE IF EXISTS "Run";
DROP TABLE IF EXISTS "Strategy";
DROP TABLE IF EXISTS "Benchmark";

DROP TYPE IF EXISTS "ExitReason";
DROP TYPE IF EXISTS "TradeSide";
DROP TYPE IF EXISTS "RunKind";
DROP TYPE IF EXISTS "StrategyState";
DROP TYPE IF EXISTS "Market";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 레거시 개명 되돌리기 — 데이터는 손대지 않는다
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "LegacyTrade" RENAME CONSTRAINT "LegacyTrade_sessionId_fkey" TO "Trade_sessionId_fkey";
ALTER TABLE "LegacyTrade" RENAME CONSTRAINT "LegacyTrade_positionId_fkey" TO "Trade_positionId_fkey";
ALTER TABLE "LegacyTrade" RENAME CONSTRAINT "LegacyTrade_strategyId_fkey" TO "Trade_strategyId_fkey";
ALTER TABLE "LegacyTrade" RENAME CONSTRAINT "LegacyTrade_botId_fkey" TO "Trade_botId_fkey";
ALTER INDEX "LegacyTrade_sessionId_executedAt_idx" RENAME TO "Trade_sessionId_executedAt_idx";
ALTER INDEX "LegacyTrade_positionId_idx" RENAME TO "Trade_positionId_idx";
ALTER INDEX "LegacyTrade_strategyId_idx" RENAME TO "Trade_strategyId_idx";
ALTER INDEX "LegacyTrade_botId_executedAt_idx" RENAME TO "Trade_botId_executedAt_idx";
ALTER INDEX "LegacyTrade_pkey" RENAME TO "Trade_pkey";

ALTER TABLE "LegacyStrategy" RENAME CONSTRAINT "LegacyStrategy_botId_fkey" TO "Strategy_botId_fkey";
ALTER INDEX "LegacyStrategy_botId_key_key" RENAME TO "Strategy_botId_key_key";
ALTER INDEX "LegacyStrategy_pkey" RENAME TO "Strategy_pkey";

ALTER TABLE "LegacyTrade" RENAME TO "Trade";
ALTER TABLE "LegacyStrategy" RENAME TO "Strategy";
