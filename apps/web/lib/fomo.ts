import { NextResponse } from "next/server";
import {
  EMOTION_TYPES,
  type EmotionType,
  type EmotionTally,
  computeFomoIndex,
  scoreToColor,
  scoreToDescription,
  type FomoIndex,
} from "@fomo/core";
import { prisma } from "./prisma";
import { createLogger } from "./logger";

const log = createLogger("fomo");

/** Asia/Seoul 기준 YYYY-MM-DD. 파이프라인(scripts/fomo-index-pipeline.ts)과 동일 기준. */
export function kstDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export function isEmotionType(v: unknown): v is EmotionType {
  return typeof v === "string" && (EMOTION_TYPES as readonly string[]).includes(v);
}

/** 당일 감정 투표 집계 → {tally, total}. */
export async function todayTally(date = kstDate()): Promise<{ tally: EmotionTally; total: number }> {
  const rows = await prisma.emotionVote.groupBy({
    by: ["emotion"],
    where: { votedDate: date },
    _count: { _all: true },
  });
  const tally: EmotionTally = {};
  let total = 0;
  for (const r of rows) {
    if (isEmotionType(r.emotion)) {
      tally[r.emotion] = r._count._all;
      total += r._count._all;
    }
  }
  return { tally, total };
}

/**
 * 스냅샷 미존재 시 라이브 계산 — market/community/whale은 폴백 중립값 사용.
 * 각 Heat 컴포넌트 폴백 여부를 로그에 기록한다(정직한 숫자 원칙).
 */
export async function computeLiveFomoIndex(date: string): Promise<FomoIndex> {
  let tally: EmotionTally = {};
  try {
    const result = await todayTally(date);
    tally = result.tally;
    if (result.total === 0) {
      log.debug("emotion tally empty — using fallback neutral", { date });
    }
  } catch (err) {
    log.warn("emotion tally fetch failed — fallback to empty tally", {
      date,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const idx = computeFomoIndex({ emotion: tally }, date);

  // 각 Heat가 폴백 기본값(15/15/15/0)인지 감지해 로그
  for (const c of idx.components) {
    const neutral = c.key === "whale" ? 0 : 15;
    if (c.score === neutral) {
      log.debug("heat using fallback neutral", { heat: c.key, score: c.score, date });
    }
  }

  return idx;
}

/** FOMO Index 응답 공통 직렬화 — zoneColor·zoneDescription 포함. */
export function serializeFomoIndex(
  idx: FomoIndex,
  extra: {
    aiSummary?: string;
    prevDayDelta?: number;
    avg30Delta?: number;
    live: boolean;
  }
) {
  const comp = (k: string) => idx.components.find((c) => c.key === k)?.score ?? 0;
  return {
    date: idx.date,
    score: idx.score,
    state: idx.state,
    zoneColor: scoreToColor(idx.score),
    zoneDescription: scoreToDescription(idx.score),
    components: {
      market:    comp("market"),
      community: comp("community"),
      emotion:   comp("emotion"),
      whale:     comp("whale"),
    },
    aiSummary:    extra.aiSummary    ?? "",
    prevDayDelta: extra.prevDayDelta ?? 0,
    avg30Delta:   extra.avg30Delta   ?? 0,
    live: extra.live,
  };
}

/** 무가입 웹 교차 출처 허용 — 익명 공개 데이터. CORS 헤더를 응답에 부착. */
export function withCors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export function corsJson(body: unknown, init?: ResponseInit): NextResponse {
  return withCors(NextResponse.json(body, init));
}
