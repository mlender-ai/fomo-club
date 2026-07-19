import { materializeLedgerOutcomes } from "../apps/web/lib/ledger-track-record";
import { prisma } from "../apps/web/lib/prisma";

materializeLedgerOutcomes(undefined, 1_000)
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
