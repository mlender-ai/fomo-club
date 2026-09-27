-- UI-10 B — 페이퍼 포지션의 FCE 포지션 분석 · 고래 추적군
ALTER TABLE "FcePosition" ADD COLUMN "analysis" JSONB, ADD COLUMN "cohort" JSONB;
