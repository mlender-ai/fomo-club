import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { writeFeedContent } from "../../../../../lib/feed-content-store";
import {
  buildBuzzStory,
  buildKrBriefing,
  buildUsBriefing,
  buildWeeklyRecap,
  type FeedBriefingRow,
} from "../../../../../lib/feed-briefing";

/**
 * 피드 콘텐츠 프리웜 크론 (WO 피드 강화) — ?slot=morning|close|weekly
 * - morning: 간밤의 미장 브리핑
 * - close: 오늘의 국장 브리핑 + 버즈 스토리(언급 스냅샷 포함)
 * - weekly: "일주일 전에 샀으면" 주간 회고
 * LLM은 여기(크론)에서만 — 요청 경로는 캐시 읽기 전용. 빌드 후 daily-30 캐시 태그 무효화.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isoWeekOf(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const slot = new URL(request.url).searchParams.get("slot") ?? "";
  const startedAt = Date.now();
  const date = kstDate();
  const written: string[] = [];
  try {
    const save = async (id: string, row: FeedBriefingRow | null) => {
      if (!row) return;
      await writeFeedContent(id, row);
      written.push(id);
    };
    if (slot === "morning") {
      await save(`briefing:us:${date}`, await buildUsBriefing());
    } else if (slot === "close") {
      await save(`briefing:kr:${date}`, await buildKrBriefing());
      await save(`buzz:${date}`, await buildBuzzStory());
    } else if (slot === "weekly") {
      await save(`recap:${isoWeekOf()}`, await buildWeeklyRecap());
    } else {
      return withCors(NextResponse.json({ ok: false, error: "slot must be morning|close|weekly" }, { status: 400 }));
    }
    // daily-30·feed-hub 서버 캐시 즉시 만료 — 다음 요청이 새 콘텐츠를 포함해 재빌드.
    revalidateTag("daily-30", { expire: 0 });
    revalidateTag("feed-hub", { expire: 0 });
    return withCors(
      NextResponse.json(
        { ok: true, slot, written, elapsedMs: Date.now() - startedAt },
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/cron/feed-content] failed", slot, (err as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, slot, written, error: (err as Error)?.message ?? "feed content failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
