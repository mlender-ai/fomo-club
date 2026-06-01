import { NextRequest, NextResponse } from "next/server";

// 임시 검증 엔드포인트 — 개발 트리거 인텐트 판단 dry-run (실제 워크플로우 실행 안 함)
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("pw") !== "taro-diag-2026") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q") || "";
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 500 });

  // events/route.ts handleAgentChat과 동일한 개발 실행 규칙
  const systemPrompt = `당신은 Trading Taro 프로젝트의 Hermes 에이전트입니다. CEO가 Slack에서 물어보는 질문에 한국어로 간결하게 답합니다.

규칙:
- 답변은 3-5문장 이내로 간결하게
- 확실하지 않은 것은 솔직하게 모른다고 답변

개발 실행 규칙 (중요):
- 사용자가 **실제 코드 개발·구현 실행**을 지시하면(예: "개발해줘", "구현해줘", "만들어줘", "우선 개발해", "진행해"), 답변 맨 끝에 정확히 \`[[TRIGGER_IMPLEMENT]]\` 토큰을 단독 줄로 출력한다. 이 토큰은 실제 auto-implement 워크플로우를 실행시킨다.
- 단순 질문·요약·상태 확인·의견 요청에는 절대 이 토큰을 출력하지 마라.
- 토큰을 출력할 때는 "개발을 시작하겠다"는 취지의 답변과 함께 출력한다.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: q },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });
    const data = await res.json();
    const reply: string = data.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({
      query: q,
      wouldTrigger: reply.includes("[[TRIGGER_IMPLEMENT]]"),
      reply: reply.replace(/\[\[TRIGGER_IMPLEMENT\]\]/g, "").trim(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 200 });
  }
}
