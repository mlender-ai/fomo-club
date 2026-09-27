-- UI-08 연구 — 왜 · 번호 목록 · 알아낸 것(표시) · 관련 · 실매매 관문
ALTER TABLE "Research"
  ADD COLUMN "why" TEXT,
  ADD COLUMN "hypotheses" JSONB,
  ADD COLUMN "methods" JSONB,
  ADD COLUMN "findings" JSONB,
  ADD COLUMN "related" JSONB,
  ADD COLUMN "liveGate" TEXT;
