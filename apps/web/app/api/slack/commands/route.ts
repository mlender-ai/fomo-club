import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import { dispatchCommand } from "@/lib/slack/commands";

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

  const [command, ...rest] = fullCommand.split(/\s+/);
  const args = rest.join(" ");

  const response = await dispatchCommand(
    command || "help",
    args,
    userId,
    channelId
  );

  return NextResponse.json({
    response_type: "in_channel",
    text: response,
  });
}
