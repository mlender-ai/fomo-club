import { NextRequest, NextResponse } from "next/server";

// 임시 진단 엔드포인트 — Gemini API 연결 검증용
export async function GET(req: NextRequest) {
  const pw = req.nextUrl.searchParams.get("pw");
  if (pw !== "taro-diag-2026") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const AI_API_KEY = process.env.AI_API_KEY;
  if (!AI_API_KEY) {
    return NextResponse.json({ error: "AI_API_KEY not set" }, { status: 500 });
  }

  const model = req.nextUrl.searchParams.get("model") || "gemini-2.0-flash-lite";
  const useOpenAI = req.nextUrl.searchParams.get("compat") === "1";

  let url: string;
  let body: string;
  let headers: Record<string, string>;

  if (useOpenAI) {
    url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    headers = { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` };
    body = JSON.stringify({ model, messages: [{ role: "user", content: "Respond with exactly: OK" }], max_tokens: 10 });
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_API_KEY}`;
    headers = { "Content-Type": "application/json" };
    body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Respond with exactly: OK" }] }], generationConfig: { maxOutputTokens: 10 } });
  }

  try {
    const res = await fetch(url, { method: "POST", headers, body });

    const responseBody = await res.text();
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, body: responseBody }, { status: 200 });
    }

    const data = JSON.parse(responseBody);
    const reply = useOpenAI
      ? (data.choices?.[0]?.message?.content ?? "(empty)")
      : (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(empty)");
    return NextResponse.json({ ok: true, reply, model, compat: useOpenAI });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
