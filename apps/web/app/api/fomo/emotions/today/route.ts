import { NextResponse } from "next/server";
import { EMOTION_TYPES } from "@fomo/core";
import { kstDate, todayTally, corsJson, withCors } from "../../../../../lib/fomo";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// GET /api/fomo/emotions/today — 오늘 감정 투표 집계 (비율 + 총 N명).
// 정직한 숫자: total은 항상 실제 집계값. 0이어도 그대로.
// fallback: true → 아직 투표 데이터 없음 (클라이언트에서 "집계 준비 중" 표시 기준).
export async function GET() {
  const date = kstDate();
  try {
    const { tally, total } = await todayTally(date);
    const counts = Object.fromEntries(EMOTION_TYPES.map((e) => [e, tally[e] ?? 0]));
    const ratios = Object.fromEntries(
      EMOTION_TYPES.map((e) => [e, total > 0 ? Math.round(((tally[e] ?? 0) / total) * 100) : 0])
    );
    const confidence = total === 0 ? "fallback" : total >= 50 ? "high" : total >= 10 ? "medium" : "low";
    return corsJson({ date, total, counts, ratios, fallback: total === 0, confidence });
  } catch (err) {
    console.warn("[fomo/emotions/today] error", err);
    const counts = Object.fromEntries(EMOTION_TYPES.map((e) => [e, 0]));
    const ratios = Object.fromEntries(EMOTION_TYPES.map((e) => [e, 0]));
    return corsJson({ date, total: 0, counts, ratios, fallback: true, confidence: "fallback" });
  }
}
