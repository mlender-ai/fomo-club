import { NextResponse } from "next/server";
import {
  EMOTION_TYPES,
  type EmotionType,
  type EmotionTally,
  computeFomoIndex,
  scoreToColor,
  scoreToDescription,
  type FomoIndex,
  // @author 안티그래비티 — 1-A: Reddit 커뮤니티 시그널 수집
  fetchRedditSignals,
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
 * 스냅샷 미존재 시 라이브 계산.
 *
 * @author 안티그래비티
 * - 1-A: Reddit 커뮤니티 시그널을 병렬 수집하여 Community Heat에 반영
 * - 1-B: 각 Heat 컴포넌트의 confidence 메타를 로그에 기록 (정직한 숫자 원칙)
 *
 * 모든 외부 데이터 소스 실패 시에도 중립 폴백으로 안전하게 반환한다.
 */
export async function computeLiveFomoIndex(date: string): Promise<FomoIndex> {
  // ── 병렬 페치: 감정 투표 + Reddit 시그널 ──
  const [tallyResult, redditResult] = await Promise.allSettled([
    todayTally(date),
    fetchRedditSignals(),
  ]);

  // 감정 투표
  let tally: EmotionTally = {};
  if (tallyResult.status === "fulfilled") {
    tally = tallyResult.value.tally;
    if (tallyResult.value.total === 0) {
      log.debug("emotion tally empty — using fallback neutral", { date });
    }
  } else {
    log.warn("emotion tally fetch failed — fallback to empty tally", {
      date,
      err: tallyResult.reason instanceof Error ? tallyResult.reason.message : String(tallyResult.reason),
    });
  }

  // Reddit 커뮤니티 시그널 (1-A)
  let reddit: import("@fomo/core").RedditSignal[] = [];
  if (redditResult.status === "fulfilled") {
    reddit = redditResult.value;
    log.debug("reddit signals fetched", {
      date,
      count: reddit.length,
      subreddits: reddit.map((r) => r.subreddit),
    });
  } else {
    log.warn("reddit signals fetch failed — community heat will use fallback", {
      date,
      err: redditResult.reason instanceof Error ? redditResult.reason.message : String(redditResult.reason),
    });
  }

  const inputs: import("@fomo/core").FomoIndexInputs = { emotion: tally };
  if (reddit.length > 0) {
    inputs.community = { reddit };
  }
  const idx = computeFomoIndex(inputs, date);

  // 1-B: 각 Heat 컴포넌트 신뢰도 로깅
  for (const c of idx.components) {
    const confidence = c.meta?.confidence ?? "fallback";
    if (confidence === "fallback") {
      log.info("heat using fallback", {
        heat: c.key,
        score: c.score,
        confidence,
        date,
      });
    } else {
      log.debug("heat computed", {
        heat: c.key,
        score: c.score,
        confidence,
        sourcesAvailable: c.meta?.sourcesAvailable,
        sourcesTotal: c.meta?.sourcesTotal,
        date,
      });
    }
  }

  return idx;
}

/**
 * FOMO Index 응답 공통 직렬화 — zoneColor·zoneDescription 포함.
 *
 * @author 안티그래비티 — 1-B: confidence 메타데이터 추가
 */
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
  const confidence = (k: string) => idx.components.find((c) => c.key === k)?.meta?.confidence ?? "fallback";
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
    /** @author 안티그래비티 — 1-B: 각 Heat 데이터 신뢰도 (정직한 숫자 원칙) */
    confidence: {
      market:    confidence("market"),
      community: confidence("community"),
      emotion:   confidence("emotion"),
      whale:     confidence("whale"),
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
