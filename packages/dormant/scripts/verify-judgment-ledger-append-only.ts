import { appendJudgmentLedger, ledgerKey } from "../apps/web/lib/judgment-ledger";
import { kstDate } from "../apps/web/lib/fomo";
import { prisma } from "../apps/web/lib/prisma";

async function mustReject(label: string, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/append-only|forbidden|permission denied|row-level security/i.test(message)) return;
    throw new Error(`${label} failed for an unexpected reason: ${message}`);
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function main() {
  const date = kstDate();
  const canonical = "__LEDGER_APPEND_ONLY_PROBE__";
  await appendJudgmentLedger([{
    date,
    subject: { asset: "macro", canonical },
    kind: "signal",
    payload: { probe: true, purpose: "append-only production verification" },
    priceAt: 1,
    actor: "engine",
    idempotencyKey: ledgerKey("append-only-probe", date),
  }]);
  await mustReject("UPDATE", () => prisma.$executeRawUnsafe(
    `UPDATE "JudgmentLedger" SET "priceAt" = 2 WHERE "canonical" = $1`, canonical
  ));
  await mustReject("DELETE", () => prisma.$executeRawUnsafe(
    `DELETE FROM "JudgmentLedger" WHERE "canonical" = $1`, canonical
  ));
  console.log(JSON.stringify({ ok: true, updateRejected: true, deleteRejected: true, probeRetained: true }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
