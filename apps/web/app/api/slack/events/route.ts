import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifySlackRequest } from "@/lib/slack/verify";
import { postMessage, getThreadHistory } from "@/lib/slack/client";
import { dispatchCommand, KNOWN_COMMANDS } from "@/lib/slack/commands";
import {
  getOpenPRs,
  getCEOBriefIssues,
  getWorkflowRuns,
  triggerWorkflow,
} from "@/lib/slack/github";

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    subtype?: string;
    text?: string;
    user?: string;
    channel?: string;
    thread_ts?: string;
    ts?: string;
    bot_id?: string;
  };
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";

  const data: SlackEvent = JSON.parse(body);

  // Slack URL verification challenge (서명 검증 불필요)
  if (data.type === "url_verification") {
    return NextResponse.json({ challenge: data.challenge });
  }

  if (!verifySlackRequest(timestamp, body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = data.event;

  // 봇 자체 메시지 무시 (무한루프 방지)
  if (!event || event.bot_id) {
    return NextResponse.json({ ok: true });
  }

  // app_mention: @taro-bot <text>
  if (event.type === "app_mention" && event.text && event.channel) {
    const channel = event.channel;
    const replyTs = event.thread_ts || event.ts || undefined;
    const rootThreadTs = event.thread_ts || event.ts || "";
    const currentMsgTs = event.ts || "";

    // 봇 멘션 제거 후 파싱
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
    const [first, ...rest] = text.split(/\s+/);
    const cmdName = (first || "help").toLowerCase();
    const args = rest.join(" ");

    // 알려진 커맨드 → 기존 dispatch
    if (KNOWN_COMMANDS.has(cmdName)) {
      waitUntil(handleMentionAsync(cmdName, args, event.user || "", channel, replyTs));
    } else {
      waitUntil(handleAgentChat(text, event.user || "", channel, replyTs, rootThreadTs, currentMsgTs));
    }
  }
  // 스레드 댓글 (멘션 없이) — 봇이 참여한 스레드에서만 이어서 응답
  else if (
    event.type === "message" &&
    event.channel &&
    event.text &&
    event.thread_ts &&
    !event.subtype && // 편집/삭제/봇 메시지 등 제외
    !event.bot_id &&
    !/<@[A-Z0-9]+>/.test(event.text) // 멘션 포함 댓글은 app_mention이 처리하므로 중복 방지
  ) {
    const channel = event.channel;
    const rootThreadTs = event.thread_ts;
    const currentMsgTs = event.ts || "";
    waitUntil(
      handleThreadReply(event.text, event.user || "", channel, rootThreadTs, currentMsgTs)
    );
  }

  return NextResponse.json({ ok: true });
}

// ── 스레드 댓글 처리 — 봇 참여 스레드만 ──────────────────────────────
async function handleThreadReply(
  text: string,
  userId: string,
  channel: string,
  rootThreadTs: string,
  currentMsgTs: string
) {
  // 스레드에 봇 메시지가 있는지 확인 → 봇이 참여한 스레드만 응답
  const history = await getThreadHistory(channel, rootThreadTs).catch(() => []);
  const botInThread = history.some((m) => m.bot_id);
  if (!botInThread) return; // 봇이 없는 스레드는 무시 (다른 사람들 대화에 끼어들지 않음)

  await handleAgentChat(text, userId, channel, rootThreadTs, rootThreadTs, currentMsgTs);
}

// ── 알려진 커맨드 처리 ───────────────────────────────────────────────
async function handleMentionAsync(
  command: string,
  args: string,
  userId: string,
  channel: string,
  threadTs?: string
) {
  try {
    await postMessage(channel, `⏳ 처리 중...`, threadTs);
    const text = await dispatchCommand(command, args, userId, channel);
    await postMessage(channel, text, threadTs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await postMessage(channel, `❌ 오류: ${msg}`, threadTs).catch(() => {});
  }
}

// ── Phase 3: Agent Chat — GPT-4o 자유 대화 ──────────────────────────
async function handleAgentChat(
  question: string,
  _userId: string,
  channel: string,
  threadTs: string | undefined,
  rootThreadTs: string | undefined,
  currentMsgTs: string
) {
  // Groq (무료, OpenAI-compat) — console.groq.com에서 무료 발급
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const AI_URL = "https://api.groq.com/openai/v1/chat/completions";
  const AI_MODEL = "llama-3.3-70b-versatile";

  if (!GROQ_API_KEY) {
    await postMessage(channel, "GROQ_API_KEY 환경변수가 설정되지 않았습니다. console.groq.com에서 무료 발급 후 Vercel에 추가해주세요.", threadTs);
    return;
  }

  try {
    await postMessage(channel, `🤔 생각 중...`, threadTs);

    // 스레드 히스토리 조회
    const threadHistoryResult = rootThreadTs ? await getThreadHistory(channel, rootThreadTs).catch(() => []) : [];
    const historyMessages: { role: "user" | "assistant"; content: string }[] = [];
    for (const msg of threadHistoryResult) {
      if (!msg.text || msg.ts === currentMsgTs) continue;
      const cleaned = msg.text.replace(/<@[A-Z0-9]+>/g, "").trim();
      if (!cleaned) continue;
      historyMessages.push({ role: msg.bot_id ? "assistant" : "user", content: cleaned });
    }

    // 컨텍스트 수집 (병렬)
    const [prs, briefs, runs] = await Promise.allSettled([
      getOpenPRs(5),
      getCEOBriefIssues(3),
      getWorkflowRuns("auto-implement.yml", 5),
    ]);

    const prList = prs.status === "fulfilled"
      ? (prs.value as { number: number; title: string; html_url: string }[])
          .map((p) => `- #${p.number}: ${p.title}`)
          .join("\n")
      : "(조회 실패)";

    const briefList = briefs.status === "fulfilled"
      ? (briefs.value as { number: number; title: string }[])
          .map((b) => `- #${b.number}: ${b.title}`)
          .join("\n")
      : "(조회 실패)";

    const runList = runs.status === "fulfilled"
      ? (
          (runs.value as { workflow_runs: { conclusion: string; created_at: string; head_branch: string }[] })
            .workflow_runs || []
        )
          .map((r) => `- ${r.conclusion || "running"} (${r.head_branch}) — ${r.created_at}`)
          .join("\n")
      : "(조회 실패)";

    const systemPrompt = `당신은 Trading Taro 프로젝트의 Hermes 에이전트입니다.
CEO가 Slack에서 물어보는 질문에 한국어로 간결하게 답합니다.
현재 파이프라인 상태를 바탕으로 구체적이고 actionable한 답변을 제공하세요.

현재 컨텍스트:
## 오픈 PR
${prList || "(없음)"}

## 최근 CEO Brief
${briefList || "(없음)"}

## 최근 auto-implement 실행
${runList || "(없음)"}

규칙:
- 답변은 3-5문장 이내로 간결하게
- Slack mrkdwn 포맷 사용 (*볼드*, _이탤릭_, \`코드\`)
- 확실하지 않은 것은 솔직하게 모른다고 답변

개발 실행 규칙 (중요):
- 사용자가 **실제 코드 개발·구현 실행**을 지시하면(예: "개발해줘", "구현해줘", "만들어줘", "우선 개발해", "진행해"), 답변 맨 끝에 정확히 \`[[TRIGGER_IMPLEMENT]]\` 토큰을 단독 줄로 출력한다. 이 토큰은 실제 auto-implement 워크플로우를 실행시킨다.
- 단순 질문·요약·상태 확인·의견 요청에는 절대 이 토큰을 출력하지 마라.
- 토큰을 출력할 때는 "개발을 시작하겠다"는 취지의 답변과 함께 출력한다.`;

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          { role: "user", content: question },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(no body)");
      throw new Error(`AI API ${res.status} — ${errBody.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      error?: { message: string };
      choices: { message: { content: string } }[];
    };

    if (data.error) throw new Error(data.error.message || "AI API error");

    let reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) throw new Error("AI 응답이 비어있습니다");

    // 개발 실행 인텐트 감지 → 실제 auto-implement 워크플로우 트리거
    if (reply.includes("[[TRIGGER_IMPLEMENT]]")) {
      reply = reply.replace(/\[\[TRIGGER_IMPLEMENT\]\]/g, "").trim();
      const kstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      try {
        await triggerWorkflow("auto-implement.yml", { brief_date: kstDate });
        reply += `\n\n🚀 *auto-implement 워크플로우를 실제로 실행했습니다* (날짜: ${kstDate}).\n진행 상황은 \`@Taro Agent Bot status\` 로 확인하세요.`;
      } catch (e) {
        reply += `\n\n⚠️ 워크플로우 실행 실패: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    await postMessage(channel, reply, threadTs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await postMessage(
      channel,
      `❌ 답변 생성 실패: ${msg}\n커맨드는 \`/taro help\`를 입력하세요.`,
      threadTs
    ).catch(() => {});
  }
}
