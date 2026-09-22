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

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const DIR = join(process.cwd(), "docs/lab/research");

const STATUSES = new Set(["open", "testing", "blocked", "closed"]);
const VERDICTS = new Set(["yes", "no", "inconclusive"]);

interface Evidence {
  label: string;
  value: string;
  source: string;
}

interface Note {
  no: string;
  title: string;
  status: string;
  verdict: string | null;
  summary: string;
  hypothesis: string | null;
  method: string | null;
  evidence: Evidence[];
  decision: string | null;
  blocks: string | null;
  openedAt: Date;
  closedAt: Date | null;
  trackKeys: string[];
}

/** 아주 작은 frontmatter 파서. 의존성을 하나 더 들이지 않으려는 것뿐이다. */
function frontmatter(text: string): { meta: Record<string, string>; body: string } {
  if (!text.startsWith("---\n")) throw new Error("frontmatter 가 없다");
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("frontmatter 가 안 닫혔다");
  const meta: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    meta[key] = value;
  }
  return { meta, body: text.slice(end + 5) };
}

/** `## 제목` 아래 본문. 없으면 null — **빈 문자열로 만들지 않는다.** */
function section(body: string, heading: string): string | null {
  const re = new RegExp(`^## ${heading}\\s*$`, "m");
  const m = re.exec(body);
  if (!m) return null;
  const from = m.index + m[0].length;
  const next = body.slice(from).search(/^## /m);
  const text = (next < 0 ? body.slice(from) : body.slice(from, from + next)).trim();
  return text.length > 0 ? text : null;
}

/** `- 라벨 | 값 | 출처` 줄만 근거로 본다. */
function evidence(body: string): Evidence[] {
  const block = section(body, "근거");
  if (!block) return [];
  const out: Evidence[] = [];
  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("-")) continue;
    const parts = line.replace(/^\s*-\s*/, "").split("|");
    if (parts.length < 2) continue;
    out.push({
      label: (parts[0] ?? "").trim(),
      value: (parts[1] ?? "").trim(),
      source: (parts[2] ?? "").trim(),
    });
  }
  return out;
}

function list(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function date(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parse(file: string): Note {
  const { meta, body } = frontmatter(readFileSync(join(DIR, file), "utf8"));
  const no = meta.no ?? "";
  if (!/^\d{2}$/.test(no)) throw new Error(`${file}: no 는 두 자리여야 한다 (받은 값 "${no}")`);
  const status = meta.status ?? "";
  if (!STATUSES.has(status)) throw new Error(`${file}: status 가 ${[...STATUSES].join(" | ")} 중 하나여야 한다`);

  const verdict = meta.verdict && meta.verdict.length > 0 ? meta.verdict : null;
  if (verdict && !VERDICTS.has(verdict)) {
    throw new Error(`${file}: verdict 가 ${[...VERDICTS].join(" | ")} 중 하나여야 한다`);
  }
  // **닫힌 항목은 답이 있어야 한다.** 답 없이 닫으면 기록이 "끝났다" 고만 말한다.
  if (status === "closed" && !verdict) throw new Error(`${file}: closed 인데 verdict 가 없다`);
  if (status !== "closed" && verdict) throw new Error(`${file}: closed 가 아닌데 verdict 가 있다`);

  const openedAt = date(meta.opened_at);
  if (!openedAt) throw new Error(`${file}: opened_at 이 필요하다`);

  return {
    no,
    title: meta.title ?? "",
    status,
    verdict,
    summary: meta.summary ?? "",
    hypothesis: section(body, "가설"),
    method: section(body, "어떻게 확인하나"),
    evidence: evidence(body),
    decision: section(body, "결정"),
    blocks: meta.blocks && meta.blocks.length > 0 ? meta.blocks : null,
    openedAt,
    closedAt: date(meta.closed_at),
    trackKeys: list(meta.tracks),
  };
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
  console.log(`\n연구 항목 ${notes.length}개 · 근거 ${notes.reduce((s, n) => s + n.evidence.length, 0)}줄`);

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
