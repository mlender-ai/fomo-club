import type { EmotionType } from "./types";

/**
 * 감정 캘린더 순수 로직 (M2 — 매일 돌아올 이유).
 * docs/IDENTITY_AND_MILESTONES.md §M2: 한 달을 색으로 칠하는 픽셀 그리드 + 빈 칸 채우기 + 스트릭 심리.
 *
 * UI/네트워크 무관. 날짜는 모두 "YYYY-MM-DD"(KST 기준 문자열) 또는 month "YYYY-MM"로 다룬다.
 * 시간대 오프셋 버그를 피하려고 Date 산술 대신 문자열/숫자 분해만 쓴다.
 */

/** 캘린더 한 칸. 빈 칸(앞쪽 패딩)은 date=null. */
export interface CalendarCell {
  /** "YYYY-MM-DD" 또는 패딩 칸이면 null */
  date: string | null;
  /** 그 날 남긴 감정 (없으면 null) */
  emotion: EmotionType | null;
  /** 시장 FOMO Index 점수 0~100 (옅게 겹치기용, 없으면 null) */
  marketScore: number | null;
  /** 오늘 칸 여부 */
  isToday: boolean;
}

/** "YYYY-MM" → { year, month(1~12) } */
export function parseMonth(month: string): { year: number; month: number } {
  const p = month.split("-");
  return { year: Number(p[0]), month: Number(p[1]) };
}

/** "YYYY-MM-DD" → { year, month(1~12), day } */
export function parseDate(date: string): { year: number; month: number; day: number } {
  const p = date.split("-");
  return { year: Number(p[0]), month: Number(p[1]), day: Number(p[2]) };
}

/** 해당 월의 일수. month는 1~12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 해당 월 1일의 요일 (0=일 ~ 6=토). */
export function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * 한 달치 캘린더 그리드 생성.
 * - 앞쪽에 1일의 요일만큼 빈 칸(date=null) 패딩 → 7열 정렬.
 * - days: 세션의 날짜별 감정, market: 날짜별 FOMO Index 점수, today: 오늘 "YYYY-MM-DD".
 */
export function buildCalendar(
  month: string,
  days: Record<string, EmotionType>,
  market: Record<string, number> = {},
  today?: string
): CalendarCell[] {
  const { year, month: m } = parseMonth(month);
  const total = daysInMonth(year, m);
  const pad = firstWeekday(year, m);
  const cells: CalendarCell[] = [];

  for (let i = 0; i < pad; i++) {
    cells.push({ date: null, emotion: null, marketScore: null, isToday: false });
  }
  for (let d = 1; d <= total; d++) {
    const date = `${year}-${pad2(m)}-${pad2(d)}`;
    cells.push({
      date,
      emotion: days[date] ?? null,
      marketScore: market[date] ?? null,
      isToday: today === date,
    });
  }
  return cells;
}

export interface CalendarStats {
  /** 이번 달 감정을 남긴 날 수 */
  filled: number;
  /** 이번 달 총 일수 */
  totalDays: number;
  /** today까지 거슬러 올라간 현재 연속 기록 일수(끊기면 0부터 다시) */
  streak: number;
}

/** "YYYY-MM-DD"에서 하루 전 문자열. 시간대 안전(UTC 분해). */
function prevDay(date: string): string {
  const { year, month, day } = parseDate(date);
  const dt = new Date(Date.UTC(year, month - 1, day - 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * 캘린더 통계. filled는 해당 월 안의 기록 수, streak는 today부터 과거로 끊김 없이 이어진 일수.
 * streak는 월 경계를 넘어도 days에 데이터가 있으면 계속 센다(스트릭 심리 = 연속성).
 */
export function calendarStats(
  month: string,
  days: Record<string, EmotionType>,
  today: string
): CalendarStats {
  const { year, month: m } = parseMonth(month);
  const totalDays = daysInMonth(year, m);
  const prefix = `${year}-${pad2(m)}-`;
  const filled = Object.keys(days).filter((d) => d.startsWith(prefix)).length;

  let streak = 0;
  let cursor = today;
  while (days[cursor]) {
    streak++;
    cursor = prevDay(cursor);
  }
  return { filled, totalDays, streak };
}
