import {
  runExpertReviewCommitteeStage,
  type CommitteeStage,
} from "../apps/web/lib/expert-review-committee";
import { prisma } from "../apps/web/lib/prisma";

const stage = process.argv[2] as CommitteeStage | undefined;

async function main() {
  if (!stage || !(["trading", "financial", "editor"] as string[]).includes(stage)) {
    throw new Error("usage: run-expert-committee-stage.ts trading|financial|editor");
  }
  const result = await runExpertReviewCommitteeStage(stage);
  console.log(JSON.stringify(result));
  if (!result.ok) throw new Error(`${stage} failed at ${result.error ?? "unknown step"}`);
  if (stage === "editor" && result.selectedCount < 20) {
    throw new Error(`editor published ${result.selectedCount}/20 cards`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
