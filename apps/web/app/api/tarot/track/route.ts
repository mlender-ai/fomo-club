import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tarot/auth";

export const dynamic = "force-dynamic";

interface TrackEventBody {
  event: string;
  properties?: Record<string, unknown>;
  ts?: number;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json().catch(() => ({})) as Partial<TrackEventBody>;
  const { event, properties, ts } = body;

  if (!event || typeof event !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // 서버 로그에 기록 — 추후 PostHog/Amplitude/BigQuery로 교체 가능
  console.info("[track]", JSON.stringify({
    userId,
    event,
    properties: properties ?? {},
    ts: ts ?? Date.now(),
  }));

  return NextResponse.json({ ok: true });
}
