const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

interface SlackResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
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
