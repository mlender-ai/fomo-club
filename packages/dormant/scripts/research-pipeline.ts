import { runAndPersistResearchPipeline } from "../apps/web/lib/researchPipelineStore";

async function main() {
  const source = process.env.GITHUB_ACTIONS ? "github-actions" : "local-script";
  const snapshot = await runAndPersistResearchPipeline(undefined, source);

  process.stdout.write(
    [
      `provider=${snapshot.workspace.agentPipeline.runtime.provider}`,
      `source=${snapshot.workspace.agentPipeline.runtime.source}`,
      `headline=${snapshot.workspace.news.headline?.title ?? "none"}`,
      `artifact=${snapshot.workspace.agentPipeline.runtime.artifactPath ?? "generated/research/latest.json"}`
    ].join("\n")
  );

  if (snapshot.warnings.length > 0) {
    process.stdout.write(`\nwarnings=${snapshot.warnings.join(" | ")}`);
  }

  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
