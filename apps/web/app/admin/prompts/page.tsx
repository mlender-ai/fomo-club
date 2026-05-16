import { prisma } from "../../../lib/prisma";
import { PromptManager } from "./PromptManager";

export const dynamic = "force-dynamic";

async function getPrompts() {
  return prisma.tarotPromptVersion.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export default async function PromptsPage() {
  const prompts = await getPrompts();

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>프롬프트 관리</h1>
          <p className="admin-page-desc">타로 해석 LLM 프롬프트 버전 관리 및 롤백</p>
        </div>
      </header>

      <PromptManager prompts={prompts} />
    </div>
  );
}
