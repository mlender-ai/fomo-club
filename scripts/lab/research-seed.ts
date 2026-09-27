/**
 * 연구 노트 파일 → DB (UI-02 PART E-3).
 *
 * **파일이 정본이다.** `docs/lab/research/*.md` 를 읽어 `Research` 에 넣는다.
 * 편집 UI 는 나중이고, 그때까지는 고치고 이걸 돌린다.
 *
 * ## 지우지 않는다
 *
 * 파일에서 사라진 항목을 DB 에서 지우지 않는다. 연구 노트는 **진 질문이 남아
 * 있어야** 같은 걸 다시 묻지 않는 물건이고, 실수로 파일 하나를 지웠을 때
 * 기록까지 같이 날아가면 안 된다. 정말 없앨 것은 손으로 지운다.
 *
 *   npm run lab:research-seed
 *   npm run lab:research-seed -- --dry
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient, Prisma } from "@prisma/client";

import { parseNote, type ResearchNote } from "../../apps/web/lib/lab/research-note";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const DIR = join(process.cwd(), "docs/lab/research");

function parse(file: string): ResearchNote {
  return parseNote(readFileSync(join(DIR, file), "utf8"), file);
}

async function main(): Promise<void> {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();

  const notes = files.map(parse);
  const seen = new Set<string>();
  for (const n of notes) {
    if (seen.has(n.no)) throw new Error(`번호가 겹친다: ${n.no}`);
    seen.add(n.no);
  }

  for (const n of notes) {
    const open = n.status === "closed" ? "닫힘" : n.status === "blocked" ? "막힘" : "열림";
    console.log(`  ${n.no}  ${open.padEnd(3)} ${n.title}${n.verdict ? ` → ${n.verdict}` : ""}`);
  }
  console.log(
    `\n연구 항목 ${notes.length}개 · 근거 ${notes.reduce((s, n) => s + n.evidence.length, 0)}줄` +
      ` · 알아낸 것 ${notes.reduce((s, n) => s + n.findings.length, 0)}줄`
  );

  if (DRY) {
    console.log("(--dry — 넣지 않았다)");
    return;
  }

  for (const n of notes) {
    const row = {
      title: n.title,
      status: n.status,
      verdict: n.verdict,
      summary: n.summary,
      hypothesis: n.hypothesis,
      method: n.method,
      why: n.why,
      hypotheses: n.hypotheses.length > 0 ? (n.hypotheses as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      methods: n.methods.length > 0 ? (n.methods as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      findings: n.findings.length > 0 ? (n.findings as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      related: n.related.length > 0 ? (n.related as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      liveGate: n.liveGate,
      evidence: n.evidence.length > 0 ? (n.evidence as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      decision: n.decision,
      blocks: n.blocks,
      openedAt: n.openedAt,
      closedAt: n.closedAt,
      trackKeys: n.trackKeys.length > 0 ? (n.trackKeys as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    await prisma.research.upsert({ where: { no: n.no }, create: { no: n.no, ...row }, update: row });
  }
  console.log("넣었다.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
