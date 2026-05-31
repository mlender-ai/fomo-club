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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${AI_API_KEY}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Respond with exactly: OK" }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, body }, { status: 200 });
    }

    const data = JSON.parse(body);
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(empty)";
    return NextResponse.json({ ok: true, reply, model: "gemini-2.0-flash" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
