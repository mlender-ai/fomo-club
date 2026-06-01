import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifySlackRequest } from "@/lib/slack/verify";
import { postMessage, getThreadHistory } from "@/lib/slack/client";
import { dispatchCommand, KNOWN_COMMANDS } from "@/lib/slack/commands";
import {
  getOpenPRs,
  getCEOBriefIssues,
  getWorkflowRuns,
} from "@/lib/slack/github";

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
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

  return NextResponse.json({ ok: true });
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
  const AI_API_KEY = process.env.AI_API_KEY;
  // gemini-1.5-flash 이 API 키에서 404 반환 — 2.0만 유효
  const GEMINI_MODEL = "gemini-2.0-flash";
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  if (!AI_API_KEY) {
    await postMessage(channel, "AI_API_KEY 환경변수가 설정되지 않았습니다.", threadTs);
    return;
  }

  try {
    await postMessage(channel, `🤔 생각 중...`, threadTs);

    // 스레드 히스토리 조회
    const threadHistoryResult = rootThreadTs ? await getThreadHistory(channel, rootThreadTs).catch(() => []) : [];
    const historyContents: { role: string; parts: { text: string }[] }[] = [];
    for (const msg of threadHistoryResult) {
      if (!msg.text || msg.ts === currentMsgTs) continue;
      const cleaned = msg.text.replace(/<@[A-Z0-9]+>/g, "").trim();
      if (!cleaned) continue;
      historyContents.push({
        role: msg.bot_id ? "model" : "user",
        parts: [{ text: cleaned }],
      });
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

    const systemInstruction = `당신은 Trading Taro 프로젝트의 Hermes 에이전트입니다.
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
- 확실하지 않은 것은 솔직하게 모른다고 답변`;

    const res = await fetch(`${GEMINI_URL}?key=${AI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [
          ...historyContents,
          { role: "user", parts: [{ text: question }] },
        ],
        generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(no body)");
      throw new Error(`Gemini API ${res.status} — ${errBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: { content: { parts: { text: string }[] } }[];
      error?: { message: string };
    };

    if (data.error) throw new Error(data.error.message || "Gemini API error");

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!reply) throw new Error("AI 응답이 비어있습니다");

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
