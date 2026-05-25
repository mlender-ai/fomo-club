import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import { postMessage } from "@/lib/slack/client";
import { dispatchCommand } from "@/lib/slack/commands";

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

  // app_mention: @taro-bot <command> <args>
  if (event.type === "app_mention" && event.text && event.channel) {
    const channel = event.channel;
    const threadTs = event.ts;

    // 봇 멘션 제거 후 커맨드 파싱
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
    const [command, ...rest] = text.split(/\s+/);
    const cmdName = (command || "help").toLowerCase();
    const args = rest.join(" ");

    // 즉시 ACK
    void handleMentionAsync(cmdName, args, event.user || "", channel, threadTs);
  }

  return NextResponse.json({ ok: true });
}

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
