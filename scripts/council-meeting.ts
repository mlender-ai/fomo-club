/**
 * Slack Agent Team — Stage B 러너: 슬랙 자율 회의 오케스트레이션.
 *
 * docs/AGENT_TEAM_VISION.md §3(B). 한 축이 안건 발화 → 가드레일 통과 검사 → 관련 축만
 * 소집 → 각 축이 LLM 으로 발언(축 정체성으로 슬랙 발화) → 합의 판정 → 실패 시 CEO 호출.
 *
 * 새 인프라 최소화(§5): 기존 순수 로직을 재사용한다.
 *   - 가드레일/참여자/합의: apps/web/lib/slack/meeting.ts
 *   - 축 정체성/페르소나: apps/web/lib/slack/agents.ts
 *   - 금지 게이트: scripts/constraints.ts (checkViolations / loadConstraints)
 *
 * LLM 은 AI_API_URL / AI_API_KEY / AI_MODEL 환경변수 체계 사용(CLAUDE.md 규칙 5).
 * 슬랙은 SLACK_BOT_TOKEN. 시크릿 없이도 로직을 검증하도록 --dry-run 제공.
 *
 * 사용:
 *   tsx scripts/council-meeting.ts "<안건>" [--proposer=pm] [--dry-run] [--channel=C123]
 */

import { join } from "node:path";
import {
  selectParticipants,
  classifyTopic,
  isDuplicateAgenda,
  detectConsensus,
  MAX_REBUTTALS_PER_AXIS,
  type MeetingAxis,
  type AxisStance,
} from "../apps/web/lib/slack/meeting";
import { AXES, type Axis, type AxisId } from "../apps/web/lib/slack/agents";
import { CEO_DECISION_MARKER } from "../apps/web/lib/slack/decision";
import { loadConstraints, activeConstraints, checkViolations } from "./constraints";

const ROOT = join(__dirname, "..");
const AI_API_URL = process.env.AI_API_URL || "https://api.openai.com/v1";
const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";

function axisOf(id: AxisId): Axis {
  const a = AXES.find((x) => x.id === id);
  if (!a) throw new Error(`unknown axis: ${id}`);
  return a;
}

interface Args {
  agenda: string;
  proposer?: MeetingAxis;
  dryRun: boolean;
  channel: string;
}

function parseArgs(argv: string[]): Args {
  const flags = argv.filter((a) => a.startsWith("--"));
  const positional = argv.filter((a) => !a.startsWith("--"));
  const get = (k: string) => flags.find((f) => f.startsWith(`--${k}=`))?.split("=")[1];
  return {
    agenda: (positional[0] || "").trim(),
    proposer: get("proposer") as MeetingAxis | undefined,
    dryRun: flags.includes("--dry-run") || !SLACK_BOT_TOKEN || !AI_API_KEY,
    channel: get("channel") || process.env.SLACK_COUNCIL_CHANNEL || "",
  };
}

/** 슬랙 발화 — 축 정체성(username/icon_emoji)으로. dry-run 이면 콘솔 출력만. */
async function speak(
  axis: Axis,
  channel: string,
  text: string,
  threadTs: string | undefined,
  dryRun: boolean,
): Promise<string | undefined> {
  if (dryRun) {
    console.log(`\n[${axis.username} ${axis.icon_emoji}] ${text}`);
    return threadTs;
  }
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      channel,
      text,
      username: axis.username,
      icon_emoji: axis.icon_emoji,
      ...(threadTs && { thread_ts: threadTs }),
    }),
  });
  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  if (!data.ok) {
    console.warn("SLACK_POST_ERR=" + (data.error || "unknown"));
    return threadTs;
  }
  return threadTs || data.ts;
}

/** 한 축의 발언 생성. oppose 여부를 마지막 줄 [STANCE:agree|oppose] 토큰으로 받는다. */
async function generateStatement(
  axis: Axis,
  agenda: string,
  priorStatements: string,
  dryRun: boolean,
): Promise<{ text: string; oppose: boolean }> {
  if (dryRun) {
    return { text: `(dry-run) ${axis.username}의 ${agenda} 검토 의견`, oppose: false };
  }
  const system = `${axis.personaPrompt}
당신은 슬랙 회의에 참여 중입니다. 안건에 대해 당신 축의 관점에서 3문장 이내로 의견을 냅니다.
반드시 마지막 줄에 단독으로 [STANCE:agree] 또는 [STANCE:oppose] 토큰을 출력하세요(반대=oppose).`;
  const user = `안건: ${agenda}\n\n${priorStatements ? `지금까지의 발언:\n${priorStatements}\n\n` : ""}당신의 의견은?`;
  const res = await fetch(`${AI_API_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 300,
      temperature: 0.4,
    }),
  });
  const data = (await res.json()) as {
    error?: { message: string };
    choices?: { message: { content: string } }[];
  };
  if (data.error) throw new Error(data.error.message);
  const raw = data.choices?.[0]?.message?.content?.trim() || "(빈 응답)";
  const oppose = /\[STANCE:\s*oppose\s*\]/i.test(raw);
  const text = raw.replace(/\[STANCE:[^\]]*\]/gi, "").trim();
  return { text, oppose };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.agenda) {
    console.error('사용: tsx scripts/council-meeting.ts "<안건>" [--proposer=pm] [--dry-run] [--channel=C123]');
    process.exit(1);
  }

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  console.log(`📋 회의 안건: ${args.agenda}`);
  console.log(`   분류: ${classifyTopic(args.agenda)} / dry-run: ${args.dryRun}`);

  // ── 가드레일 1: 금지 영역 (Phase 2.5 게이트 재사용) ──
  const all = loadConstraints(join(ROOT, "constraints", "active.json"));
  const active = activeConstraints(all, today);
  const violations = checkViolations(args.agenda, active, "all");
  if (violations.length > 0) {
    console.log(`🚫 금지 영역 위반 — 회의 폐기. 규칙: ${violations.map((v) => v.constraint.rule).join(" / ")}`);
    return;
  }

  // ── 가드레일 2: 중복 차단 (이미 done/killed 안건 재회의 금지) ──
  // priorTitles 는 SLACK_COUNCIL_PRIOR(줄바꿈 구분) 또는 비어있음(베스트에포트).
  const priorTitles = (process.env.SLACK_COUNCIL_PRIOR || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (isDuplicateAgenda(args.agenda, priorTitles)) {
    console.log("🔁 이미 다룬/킬된 안건과 유사 — 재회의 폐기.");
    return;
  }

  // ── 관련 축만 소집 (노이즈 통제) ──
  const participants = selectParticipants(args.agenda);
  console.log(`👥 소집: ${participants.join(", ")}`);

  // 스레드 시작 (발제자 = proposer 또는 첫 참가자)
  const proposer = args.proposer && participants.includes(args.proposer) ? args.proposer : participants[0]!;
  let threadTs = await speak(
    axisOf(proposer),
    args.channel,
    `🗣️ *회의 안건 발제*\n${args.agenda}`,
    undefined,
    args.dryRun,
  );

  // ── 라운드 1: 각 축 1발언 ──
  const transcript: string[] = [];
  const stances: AxisStance[] = [];
  for (const id of participants) {
    const axis = axisOf(id);
    const { text, oppose } = await generateStatement(axis, args.agenda, transcript.join("\n"), args.dryRun);
    transcript.push(`${axis.username}: ${text}`);
    stances.push({ axis: id, oppose });
    threadTs = await speak(axis, args.channel, text, threadTs, args.dryRun);
  }

  // ── 라운드 2: 반대가 있으면 1반박 ──
  let consensus = detectConsensus(stances);
  if (!consensus.consensus && MAX_REBUTTALS_PER_AXIS > 0) {
    for (const id of participants) {
      if (consensus.opposers.includes(id)) continue; // 반대자는 이미 입장 표명
      const axis = axisOf(id);
      const { text } = await generateStatement(
        axis,
        `${args.agenda} (반박 라운드 — 반대 의견: ${consensus.opposers.join(", ")})`,
        transcript.join("\n"),
        args.dryRun,
      );
      transcript.push(`${axis.username}(반박): ${text}`);
      threadTs = await speak(axis, args.channel, text, threadTs, args.dryRun);
    }
    consensus = detectConsensus(stances); // 반박은 입장 변경 안 함 — 합의 실패 확정
  }

  // ── 합의 판정 → 기록/ CEO 호출 (Stage D 연결) ──
  if (consensus.consensus) {
    await speak(
      axisOf(proposer),
      args.channel,
      `✅ *합의 도달* — 참여 축 전원 동의. 결론을 진행합니다.`,
      threadTs,
      args.dryRun,
    );
  } else {
    await speak(
      axisOf("default"),
      args.channel,
      `⚠️ *합의 실패* — ${consensus.opposers.join(", ")} 축이 반대. <@CEO> 판단이 필요합니다.\n발언 한마디로 결정하면 영구 규칙(standing constraint)으로 반영됩니다. ${CEO_DECISION_MARKER}`,
      threadTs,
      args.dryRun,
    );
  }

  console.log(`\n🏁 회의 종료 — 합의: ${consensus.consensus}`);
}

main().catch((e) => {
  console.error("COUNCIL_MEETING_ERR=" + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
