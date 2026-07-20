-- WO-M3 Quality SLO Ledger bootstrap.
-- One immutable daily row is appended from the published daily-30 snapshot.

CREATE TABLE IF NOT EXISTS "QualityLedger" (
  "id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "actor" TEXT NOT NULL DEFAULT 'engine',
  CONSTRAINT "QualityLedger_pkey" PRIMARY KEY ("id", "date"),
  CONSTRAINT "QualityLedger_actor_valid" CHECK ("actor" = 'engine'),
  CONSTRAINT "QualityLedger_key_valid" CHECK (
    "idempotencyKey" = ('quality:' || "date") OR "idempotencyKey" = '__QUALITY_LEDGER_PROBE__'
  )
) PARTITION BY RANGE ("date");

CREATE TABLE IF NOT EXISTS "QualityLedger_default"
  PARTITION OF "QualityLedger" DEFAULT;

DO $$
DECLARE
  month_start DATE := DATE '2025-01-01';
  month_end DATE;
  partition_name TEXT;
BEGIN
  WHILE month_start < (CURRENT_DATE + INTERVAL '18 months')::DATE LOOP
    month_end := (month_start + INTERVAL '1 month')::DATE;
    partition_name := 'QualityLedger_' || TO_CHAR(month_start, 'YYYY_MM');
    EXECUTE FORMAT(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "QualityLedger" FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      TO_CHAR(month_start, 'YYYY-MM-DD'),
      TO_CHAR(month_end, 'YYYY-MM-DD')
    );
    month_start := month_end;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QualityLedger_idempotencyKey_date_key"
  ON "QualityLedger" ("idempotencyKey", "date");
CREATE INDEX IF NOT EXISTS "QualityLedger_date_idx"
  ON "QualityLedger" ("date");

CREATE OR REPLACE FUNCTION fomo_reject_quality_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'QualityLedger is append-only: % is forbidden', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS "QualityLedger_append_only" ON "QualityLedger";
CREATE TRIGGER "QualityLedger_append_only"
BEFORE UPDATE OR DELETE ON "QualityLedger"
FOR EACH ROW EXECUTE FUNCTION fomo_reject_quality_ledger_mutation();

ALTER TABLE "QualityLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualityLedger" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "QualityLedger_select" ON "QualityLedger";
CREATE POLICY "QualityLedger_select" ON "QualityLedger"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "QualityLedger_insert" ON "QualityLedger";
CREATE POLICY "QualityLedger_insert" ON "QualityLedger"
  FOR INSERT WITH CHECK (
    "actor" = 'engine'
    AND ("idempotencyKey" = ('quality:' || "date") OR "idempotencyKey" = '__QUALITY_LEDGER_PROBE__')
  );

REVOKE UPDATE, DELETE, TRUNCATE ON "QualityLedger" FROM PUBLIC;

COMMENT ON TABLE "QualityLedger" IS
  'Append-only daily quality SLO ledger. UPDATE/DELETE are rejected by trigger.';
