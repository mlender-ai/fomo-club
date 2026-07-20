import { materializeLedgerOutcomes } from "../apps/web/lib/ledger-track-record";
import { prisma } from "../apps/web/lib/prisma";

async function main() {
  const runs = [];
  for (let round = 0; round < 10; round += 1) {
    const result = await materializeLedgerOutcomes(undefined, 1_000);
    runs.push(result);
    if (result.due === 0 || result.appended === 0) break;
  }
  console.log(JSON.stringify({
    rounds: runs.length,
    due: runs.reduce((sum, run) => sum + run.due, 0),
    priced: runs.reduce((sum, run) => sum + run.priced, 0),
    appended: runs.reduce((sum, run) => sum + run.appended, 0),
    unpricedLastRound: runs.at(-1)?.unpriced ?? 0,
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
