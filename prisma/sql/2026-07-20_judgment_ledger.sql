-- WO-M1 Judgment Ledger bootstrap.
-- Run before `prisma db push`: PostgreSQL cannot turn an ordinary table into a partitioned table in place.
-- YYYY-MM-DD is lexically sortable, so RANGE partitioning on the text date key is deterministic.

CREATE TABLE IF NOT EXISTS "JudgmentLedger" (
  "id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "asset" TEXT NOT NULL,
  "canonical" TEXT NOT NULL,
  "symbol" TEXT,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "priceAt" DECIMAL(30,10) NOT NULL,
  "actor" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  CONSTRAINT "JudgmentLedger_pkey" PRIMARY KEY ("id", "date"),
  CONSTRAINT "JudgmentLedger_priceAt_positive" CHECK ("priceAt" > 0),
  CONSTRAINT "JudgmentLedger_kind_valid" CHECK (
    "kind" IN ('signal', 'verdict', 'score', 'selection', 'user_action', 'outcome')
  ),
  CONSTRAINT "JudgmentLedger_actor_valid" CHECK (
    "actor" IN ('engine', 'committee') OR "actor" LIKE 'user:%'
  )
) PARTITION BY RANGE ("date");

-- A default partition prevents a date-boundary outage. Monthly partitions keep the hot path bounded;
-- the default remains append-only and can be split during routine maintenance.
CREATE TABLE IF NOT EXISTS "JudgmentLedger_default"
  PARTITION OF "JudgmentLedger" DEFAULT;

DO $$
DECLARE
  month_start DATE := DATE '2025-01-01';
  month_end DATE;
  partition_name TEXT;
BEGIN
  WHILE month_start < (CURRENT_DATE + INTERVAL '18 months')::DATE LOOP
    month_end := (month_start + INTERVAL '1 month')::DATE;
    partition_name := 'JudgmentLedger_' || TO_CHAR(month_start, 'YYYY_MM');
    EXECUTE FORMAT(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "JudgmentLedger" FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      TO_CHAR(month_start, 'YYYY-MM-DD'),
      TO_CHAR(month_end, 'YYYY-MM-DD')
    );
    month_start := month_end;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "JudgmentLedger_idempotencyKey_date_key"
  ON "JudgmentLedger" ("idempotencyKey", "date");
CREATE INDEX IF NOT EXISTS "JudgmentLedger_date_kind_idx"
  ON "JudgmentLedger" ("date", "kind");
CREATE INDEX IF NOT EXISTS "JudgmentLedger_canonical_date_idx"
  ON "JudgmentLedger" ("canonical", "date");
CREATE INDEX IF NOT EXISTS "JudgmentLedger_actor_date_idx"
  ON "JudgmentLedger" ("actor", "date");

CREATE OR REPLACE FUNCTION fomo_reject_judgment_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'JudgmentLedger is append-only: % is forbidden', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS "JudgmentLedger_append_only" ON "JudgmentLedger";
CREATE TRIGGER "JudgmentLedger_append_only"
BEFORE UPDATE OR DELETE ON "JudgmentLedger"
FOR EACH ROW EXECUTE FUNCTION fomo_reject_judgment_ledger_mutation();

ALTER TABLE "JudgmentLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JudgmentLedger" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "JudgmentLedger_select" ON "JudgmentLedger";
CREATE POLICY "JudgmentLedger_select" ON "JudgmentLedger"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "JudgmentLedger_insert" ON "JudgmentLedger";
CREATE POLICY "JudgmentLedger_insert" ON "JudgmentLedger"
  FOR INSERT WITH CHECK (
    "priceAt" > 0
    AND ("actor" IN ('engine', 'committee') OR "actor" LIKE 'user:%')
  );

REVOKE UPDATE, DELETE, TRUNCATE ON "JudgmentLedger" FROM PUBLIC;

COMMENT ON TABLE "JudgmentLedger" IS
  'Append-only Judgment Ledger. UPDATE/DELETE are rejected by trigger; all entries require priceAt.';
