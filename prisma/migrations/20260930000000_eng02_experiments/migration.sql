-- ENG-02 자체 연구 루프 — 실험 대장.
CREATE TABLE "LabExperiment" (
    "number" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "param" TEXT NOT NULL,
    "baseline" JSONB NOT NULL,
    "value" JSONB NOT NULL,
    "track" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reportOnly" BOOLEAN NOT NULL DEFAULT false,
    "question" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "fingerprint" TEXT,
    "filter" JSONB,
    "startedAt" TIMESTAMP(3),
    "extended" BOOLEAN NOT NULL DEFAULT false,
    "judgedAt" TIMESTAMP(3),
    "judgment" JSONB,
    "shadowTrades" JSONB,
    "noteNo" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "appliedVersion" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabExperiment_pkey" PRIMARY KEY ("number")
);
CREATE UNIQUE INDEX "LabExperiment_key_key" ON "LabExperiment"("key");

-- 규칙을 코드만이 아니라 DB 에서도 강제한다 (ENG-02 하지 말 것).
--   1 행을 지우지 않는다 — 실패한 실험도 남는다 · 누적 시도 수가 줄어들 수 없다
--   2 시작한 뒤(fingerprint) 바꿀 것 · 값 · 지금 값 · 기준 · 시작 시각 · 번호를 바꿀 수 없다 — 판정 기준을 중간에 못 바꾼다
--   3 동시에 도는 실험(filtering · running · extended)은 3개까지
CREATE OR REPLACE FUNCTION lab_experiment_guard() RETURNS trigger AS $$
DECLARE
  live INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LabExperiment rows are never deleted (ENG-02)';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."number" <> OLD."number" OR NEW."key" <> OLD."key" THEN
      RAISE EXCEPTION 'LabExperiment number/key are immutable (ENG-02)';
    END IF;
    IF OLD."fingerprint" IS NOT NULL AND (
      NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint" OR NEW."criteria" IS DISTINCT FROM OLD."criteria" OR
      NEW."param" IS DISTINCT FROM OLD."param" OR NEW."value" IS DISTINCT FROM OLD."value" OR
      NEW."baseline" IS DISTINCT FROM OLD."baseline" OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
    ) THEN
      RAISE EXCEPTION 'LabExperiment criteria are locked once started (ENG-02)';
    END IF;
  END IF;
  IF NEW."status" IN ('filtering', 'running', 'extended') THEN
    SELECT COUNT(*) INTO live FROM "LabExperiment"
      WHERE "status" IN ('filtering', 'running', 'extended') AND "number" <> NEW."number";
    IF live >= 3 THEN
      RAISE EXCEPTION 'at most 3 experiments at once (ENG-02)';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lab_experiment_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "LabExperiment"
  FOR EACH ROW EXECUTE FUNCTION lab_experiment_guard();
