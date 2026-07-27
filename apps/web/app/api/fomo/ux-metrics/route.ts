import { NextRequest, NextResponse } from "next/server";
import { corsJson, withCors, kstDate } from "@/lib/fomo";
import { appendUxEvents, normalizeSessionId, readUxBaseline, UX_EVENTS, type UxEventInput } from "@/lib/ux-telemetry";

/**
 * WO-SUB-00 §4-2 — 행동 계측 수집(POST) / 기준선 조회(GET).
 *
 * 제품 동작을 바꾸지 않는다 — 순수 계측이다. 실패해도 화면 흐름을 막지 않도록
 * 클라이언트는 fire-and-forget 으로 보낸다.
 */

export const dynamic = "force-dynamic";

const MAX_BATCH = 60;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

function parseEvent(value: unknown): UxEventInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.event !== "string" || !(UX_EVENTS as readonly string[]).includes(v.event)) return null;
  const num = (x: unknown): number | undefined =>
    typeof x === "number" && Number.isFinite(x) ? x : undefined;
  const entryPoint = v.entryPoint === "tap" || v.entryPoint === "button" ? v.entryPoint : undefined;
  return {
    event: v.event as UxEventInput["event"],
    ...(num(v.position) !== undefined ? { position: num(v.position)! } : {}),
    ...(num(v.durationMs) !== undefined ? { durationMs: num(v.durationMs)! } : {}),
    ...(num(v.maxRatio) !== undefined ? { maxRatio: num(v.maxRatio)! } : {}),
    ...(num(v.cardsConsumed) !== undefined ? { cardsConsumed: num(v.cardsConsumed)! } : {}),
    ...(entryPoint ? { entryPoint } : {}),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { sessionId?: unknown; events?: unknown };
    const sessionId = normalizeSessionId(body.sessionId);
    if (!sessionId) return corsJson({ error: "sessionId 형식 오류" }, { status: 400 });
    const raw = Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH) : [];
    const events = raw.map(parseEvent).filter((e): e is UxEventInput => e !== null);
    if (events.length === 0) return corsJson({ appended: 0 });
    const appended = await appendUxEvents(sessionId, events);
    return corsJson({ appended });
  } catch (error) {
    console.warn("[ux-metrics] append failed", error);
    // 계측 실패가 사용자 흐름을 막으면 안 된다 — 200 으로 삼킨다.
    return corsJson({ appended: 0 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const date = request.nextUrl.searchParams.get("date")?.trim() || kstDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return corsJson({ error: "date 형식 오류" }, { status: 400 });
  try {
    return corsJson(await readUxBaseline(date), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.warn("[ux-metrics] read failed", error);
    return corsJson({ error: "기준선 조회 실패" }, { status: 500 });
  }
}
