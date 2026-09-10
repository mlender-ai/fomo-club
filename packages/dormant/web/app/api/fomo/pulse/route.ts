import { NextResponse } from "next/server";
import { computeFomoIndex, scoreToEmoji, EMOTION_LABELS, type EmotionType } from "@fomo/core";
import { prisma } from "../../../../lib/prisma";
import { kstDate, todayTally, corsJson, withCors } from "../../../../lib/fomo";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// GET /api/fomo/pulse — Market Pulse 롤링 배너(🚨 형식) 데이터.
// 스냅샷 insights가 있으면 사용, 없으면 당일 지수/투표로 생성.
export async function GET() {
  const date = kstDate();
  try {
    const snap = await prisma.fomoIndexSnapshot.findUnique({ where: { date } });
    const { tally, total } = await todayTally(date);

    if (snap && Array.isArray(snap.insights) && snap.insights.length > 0) {
      return corsJson({ items: snap.insights });
    }

    const idx = snap
      ? { score: snap.score, state: snap.state }
      : (() => {
          const c = computeFomoIndex({ emotion: tally }, date);
          return { score: c.score, state: c.state };
        })();

    const items: string[] = [`${scoreToEmoji(idx.score)} 오늘 FOMO 지수 ${idx.score} · ${idx.state}`];
    if (total > 0) {
      const top = (Object.entries(tally) as [EmotionType, number][]).sort(
        (a, b) => (b[1] ?? 0) - (a[1] ?? 0)
      )[0];
      if (top) items.push(`👥 오늘 ${total}명 참여 · 최다 「${EMOTION_LABELS[top[0]]}」`);
    } else {
      items.push("👥 오늘의 첫 감정을 남겨보세요");
    }
    return corsJson({ items });
  } catch (err) {
    console.warn("[fomo/pulse] error", err);
    return corsJson({ items: [] });
  }
}
