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

/** 발화자 정체성 — 축마다 다른 username/아이콘으로 발화 (Agent Team Stage A). */
export interface SlackIdentity {
  username?: string;
  icon_emoji?: string;
}

export async function postMessage(
  channel: string,
  text: string,
  threadTs?: string,
  identity?: SlackIdentity
) {
  return slackApi("chat.postMessage", {
    channel,
    text,
    ...(threadTs && { thread_ts: threadTs }),
    ...(identity?.username && { username: identity.username }),
    ...(identity?.icon_emoji && { icon_emoji: identity.icon_emoji }),
  });
}

// 스레드 대화 이력 조회 (최대 20개)
// conversations.replies는 JSON body를 받지 않으므로 query string(GET)으로 호출
export async function getThreadHistory(
  channel: string,
  threadTs: string
): Promise<SlackMessage[]> {
  if (!SLACK_BOT_TOKEN) throw new Error("SLACK_BOT_TOKEN not configured");

  const params = new URLSearchParams({ channel, ts: threadTs, limit: "20" });
  const r = await fetch(`https://slack.com/api/conversations.replies?${params}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  const res = (await r.json()) as SlackResponse & { messages?: SlackMessage[] };

  if (!res.ok || !res.messages) {
    console.warn("SLACK_REPLIES_ERR=" + (res.error || "empty"));
    return [];
  }
  return res.messages;
}
