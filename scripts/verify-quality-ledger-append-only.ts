import { randomUUID } from "node:crypto";
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
  const date = "1900-01-01";
  const key = "__QUALITY_LEDGER_PROBE__";
  await prisma.qualityLedger.createMany({
    data: [{
      id: randomUUID(),
      date,
      idempotencyKey: key,
      actor: "engine",
      payload: { probe: true, purpose: "append-only production verification" },
    }],
    skipDuplicates: true,
  });
  await mustReject("UPDATE", () => prisma.$executeRawUnsafe(
    `UPDATE "QualityLedger" SET "actor" = 'mutated' WHERE "idempotencyKey" = $1`, key
  ));
  await mustReject("DELETE", () => prisma.$executeRawUnsafe(
    `DELETE FROM "QualityLedger" WHERE "idempotencyKey" = $1`, key
  ));
  console.log(JSON.stringify({ ok: true, updateRejected: true, deleteRejected: true, probeRetained: true }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
