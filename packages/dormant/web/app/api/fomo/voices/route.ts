import { NextResponse } from "next/server";
import { composeVoice, curatedVoices, type EmotionType } from "@fomo/core";
import { prisma } from "../../../../lib/prisma";
import { kstDate, corsJson, withCors, isEmotionType } from "../../../../lib/fomo";

export const dynamic = "force-dynamic";

// M4 — 피드: 타인의 구조화 한마디. docs/M4_EXECUTION_PLAN.md §4.3.
// 오늘 vote 중 상황·의연함을 고른 것만 composeVoice로 서버 조합(자유 텍스트 0).
// 정직한 숫자: 실측 voice가 부족하면 포모 큐레이션으로 보충하되 curated:true로
// 명시(가짜 사용자 ❌) — UI가 "포모가 모아둔 마음"으로 표기한다.

const MAX_REAL = 20;
const MIN_ITEMS = 3;

export interface VoiceItem {
  emotion: EmotionType;
  text: string;
  /** true=포모 큐레이션(폴백) / false=실제 사용자의 조합. */
  curated: boolean;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  const date = kstDate();
  const items: VoiceItem[] = [];

  // 1) 실측 — 오늘, 두 키 모두 채워진 vote만. 최신순.
  try {
    const votes = await prisma.emotionVote.findMany({
      where: { votedDate: date, situationKey: { not: null }, resolveKey: { not: null } },
      orderBy: { createdAt: "desc" },
      take: MAX_REAL,
      select: { emotion: true, situationKey: true, resolveKey: true },
    });
    for (const v of votes) {
      if (!isEmotionType(v.emotion)) continue;
      const text = composeVoice({
        emotion: v.emotion,
        situationKey: v.situationKey!,
        resolveKey: v.resolveKey!,
      });
      if (text) items.push({ emotion: v.emotion, text, curated: false });
    }
  } catch (err) {
    // 컬럼 미반영 등 조회 실패 시에도 피드는 큐레이션으로 살아있게
    console.warn("[fomo/voices] vote query error", err);
  }

  // 2) 부족분 큐레이션 보충(중복 문구 제외)
  try {
    if (items.length < MIN_ITEMS) {
      const seen = new Set(items.map((i) => i.text));
      for (const c of curatedVoices(date, MIN_ITEMS)) {
        if (items.length >= MIN_ITEMS) break;
        if (seen.has(c.text)) continue;
        items.push({ ...c, curated: true });
      }
    }
    return corsJson({ date, items });
  } catch (err) {
    console.warn("[fomo/voices] error", err);
    return corsJson({ error: "피드 조회 실패", code: "VOICES_ERROR" }, { status: 500 });
  }
}
