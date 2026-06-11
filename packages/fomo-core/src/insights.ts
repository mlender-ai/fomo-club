import type { EmotionType } from "./types";
import { EMOTION_TYPES, EMOTION_LABELS } from "./types";
import { parseDate } from "./calendar";

/**
 * 자기 통찰 미러 (전략 노트 v1.0 §1.3 "깨달음의 순간" v0).
 *
 * 쌓인 감정 기록을 *사실 그대로* 비추는 거울 문장을 만든다.
 * 절대 원칙: 조언·예측·평가 금지(c-emotion-viz) — "다음엔 ~하세요" 류 어휘 0.
 * 앱은 거울만 들고, "아!"는 사용자 몫이다.
 * 정직한 숫자(c-honest-numbers): 실측 집계만, 기록 3일 미만이면 아무것도 비추지 않는다.
 */

/** 시장이 "달아오른" 기준 — 캘린더 핫 링과 동일(61 = FOMO 구간 시작). 단일 의미 유지. */
export const HOT_MARKET_SCORE = 61;

/** "나도 뜨거웠다"로 치는 감정 — FOMO·탐욕. */
const HOT_EMOTIONS: readonly EmotionType[] = ["fomo", "greed"];

export interface InsightStats {
  /** 이번 달(month) 안에서 감정을 남긴 날 수 */
  daysLogged: number;
  /** 이번 달 감정별 일수 */
  emotionCounts: Record<EmotionType, number>;
  /** 시장이 달아올랐던 날(지수 61+) 중 *내가 기록도 남긴* 날 수 — 분모는 정직하게 */
  hotMarketLogged: number;
  /** 그중 나도 뜨거웠던(FOMO·탐욕) 날 수 */
  hotBoth: number;
  /** 제공된 기록 전체에서 가장 길게 이어진 연속 기록 일수(월 경계 무관) */
  longestStreak: number;
}

/** "YYYY-MM-DD" → 그날의 일련 번호(UTC days). 연속성 판정용. */
function dayNumber(date: string): number {
  const { year, month, day } = parseDate(date);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * 기록(days)·시장 점수(market)에서 통찰 통계를 계산한다.
 * month("YYYY-MM")는 월 집계 범위, 캘린더 API 응답(이전 달 포함 가능)을 그대로 받는다.
 */
export function insightStats(
  days: Record<string, EmotionType>,
  market: Record<string, number>,
  month: string
): InsightStats {
  const prefix = `${month}-`;
  const emotionCounts = Object.fromEntries(EMOTION_TYPES.map((e) => [e, 0])) as Record<
    EmotionType,
    number
  >;
  let daysLogged = 0;
  let hotMarketLogged = 0;
  let hotBoth = 0;

  for (const [date, emotion] of Object.entries(days)) {
    if (!emotion) continue;
    if (date.startsWith(prefix)) {
      daysLogged++;
      if (emotion in emotionCounts) emotionCounts[emotion]++;
      const score = market[date];
      if (typeof score === "number" && score >= HOT_MARKET_SCORE) {
        hotMarketLogged++;
        if (HOT_EMOTIONS.includes(emotion)) hotBoth++;
      }
    }
  }

  // 최장 연속 기록 — 전체 기록 기준(월 경계를 넘어도 이어지면 잇는다)
  const nums = Object.keys(days)
    .filter((d) => days[d])
    .map(dayNumber)
    .sort((a, b) => a - b);
  let longestStreak = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of nums) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = n;
  }

  return { daysLogged, emotionCounts, hotMarketLogged, hotBoth, longestStreak };
}

/** 거울을 들 최소 기록 일수 — 이 미만이면 빈 배열(카드 미노출). */
export const MIRROR_MIN_DAYS = 3;

/**
 * 통계 → 거울 문장 최대 3개. 사실 서술만, 조언·평가 어휘 없음.
 *  1) 이번 달 감정 분포(상위 1~2개)
 *  2) 시장이 달아오른 날과 나의 동조(0회면 "한 번도 같이 달아오르지 않았어"도 사실)
 *  3) 최장 연속 기록(2일 이상일 때만)
 */
export function mirrorLines(stats: InsightStats): string[] {
  if (stats.daysLogged < MIRROR_MIN_DAYS) return [];
  const lines: string[] = [];

  const top = EMOTION_TYPES.map((e) => ({ e, n: stats.emotionCounts[e] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2);
  if (top.length === 2) {
    lines.push(
      `이번 달 너는 ${EMOTION_LABELS[top[0]!.e]} ${top[0]!.n}일 · ${EMOTION_LABELS[top[1]!.e]} ${top[1]!.n}일이었어.`
    );
  } else if (top.length === 1) {
    lines.push(`이번 달 너는 ${EMOTION_LABELS[top[0]!.e]} ${top[0]!.n}일이었어.`);
  }

  if (stats.hotMarketLogged >= 2) {
    lines.push(
      stats.hotBoth > 0
        ? `시장이 달아올랐던 ${stats.hotMarketLogged}일 중 ${stats.hotBoth}일, 너도 같이 뜨거웠어.`
        : `시장이 달아올랐던 ${stats.hotMarketLogged}일, 너는 한 번도 같이 달아오르지 않았어.`
    );
  }

  if (stats.longestStreak >= 2) {
    lines.push(`가장 길게 이어진 기록, ${stats.longestStreak}일이야.`);
  }

  return lines.slice(0, 3);
}
