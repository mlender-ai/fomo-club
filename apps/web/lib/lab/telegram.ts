/**
 * 텔레그램 (OPS-03) — 랩이 직접 보낸다. FCE 리포트와 별개다.
 *
 * `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` (Vercel 환경변수 · FCE 와 같은 이름). 없으면 **보내지 않고 기록만** 남긴다 —
 * 조용히 성공한 척하지 않는다. 보낸 것 · 못 보낸 것 전부 `LabNotice` 에 남는다(시험 증거).
 */
import { prisma } from "../prisma";

export interface SendResult {
  sent: boolean;
  error: string | null;
}

export async function sendTelegram(text: string, fetcher: typeof fetch = fetch): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { sent: false, error: "TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID 가 없다" };
  try {
    const res = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { sent: true, error: null };
    // 토큰이 URL 에 있으니 응답 본문만 남긴다.
    const body = (await res.text()).slice(0, 200);
    return { sent: false, error: `HTTP ${res.status} ${body}` };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message.replace(token, "***") : "send failed" };
  }
}

/** 보내고 기록한다. */
export async function notify(kind: string, key: string | null, text: string): Promise<SendResult> {
  const result = await sendTelegram(text);
  await prisma.labNotice.create({ data: { kind, key, text, sent: result.sent, error: result.error } });
  return result;
}
