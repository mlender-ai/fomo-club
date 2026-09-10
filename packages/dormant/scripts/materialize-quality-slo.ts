import { materializeRecentQualitySnapshots } from "../apps/web/lib/quality-slo-ledger";
import { prisma } from "../apps/web/lib/prisma";

async function main() {
  const limitArg = process.argv.find((value) => value.startsWith("--limit="));
  const parsed = Number(limitArg?.split("=")[1] ?? 2);
  const limit = Number.isInteger(parsed) ? Math.max(1, Math.min(parsed, 30)) : 2;
  const result = await materializeRecentQualitySnapshots(limit);
  if (result.entries.length < limit) {
    throw new Error(`quality SLO snapshots ${result.entries.length}/${limit}`);
  }
  console.log(JSON.stringify({
    ok: true,
    appended: result.appended,
    entries: result.entries.map((entry) => ({
      date: entry.date,
      passed: entry.passed,
      failures: entry.failures,
    })),
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
