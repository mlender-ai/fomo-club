import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import { dispatchCommand, SLOW_COMMANDS } from "@/lib/slack/commands";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";

  if (!verifySlackRequest(timestamp, body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(body);
  const fullCommand = params.get("text") || "";
  const userId = params.get("user_id") || "";
  const channelId = params.get("channel_id") || "";
  const responseUrl = params.get("response_url") || "";

  const [command, ...rest] = fullCommand.split(/\s+/);
  const cmdName = (command || "help").toLowerCase();
  const args = rest.join(" ");

  // 느린 커맨드 (GitHub API 다중 호출): 즉시 ACK 후 백그라운드 처리
  if (SLOW_COMMANDS.has(cmdName) && responseUrl) {
    void dispatchAndRespond(cmdName, args, userId, channelId, responseUrl);
    return NextResponse.json({
      response_type: "in_channel",
      text: `⏳ \`/taro ${cmdName}\` 처리 중...`,
    });
  }

  // 빠른 커맨드: 동기 처리
  const response = await dispatchCommand(cmdName, args, userId, channelId);
  return NextResponse.json({ response_type: "in_channel", text: response });
}

async function dispatchAndRespond(
  command: string,
  args: string,
  userId: string,
  channelId: string,
  responseUrl: string
) {
  try {
    const text = await dispatchCommand(command, args, userId, channelId);
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "in_channel", text }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: `❌ 오류: ${msg}`,
      }),
    }).catch(() => {});
  }
}
