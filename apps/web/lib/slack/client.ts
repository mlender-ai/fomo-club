const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

interface SlackResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  type: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
}

export async function slackApi(
  method: string,
  body: Record<string, unknown>
): Promise<SlackResponse> {
  if (!SLACK_BOT_TOKEN) throw new Error("SLACK_BOT_TOKEN not configured");

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return res.json() as Promise<SlackResponse>;
}

export async function postMessage(channel: string, text: string, threadTs?: string) {
  return slackApi("chat.postMessage", {
    channel,
    text,
    ...(threadTs && { thread_ts: threadTs }),
  });
}

// 스레드 대화 이력 조회 (최대 20개)
export async function getThreadHistory(
  channel: string,
  threadTs: string
): Promise<SlackMessage[]> {
  const res = (await slackApi("conversations.replies", {
    channel,
    ts: threadTs,
    limit: 20,
  })) as SlackResponse & { messages?: SlackMessage[] };

  if (!res.ok || !res.messages) {
    console.warn(`SLACK_REPLIES_ERR=${res.error || "empty"} ch=${channel}`);
    return [];
  }
  return res.messages;
}
