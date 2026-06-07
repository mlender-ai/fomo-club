"use client";

import { useMemo } from "react";
import {
  buildCalendar,
  calendarStats,
  EMOTION_COLORS,
  EMOTION_LABELS,
  scoreToState,
  type EmotionType,
} from "@fomo/core";
import type { CalendarResponse } from "@/lib/fomoApi";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 감정 캘린더 (M2 — 매일 돌아올 이유). docs/IDENTITY_AND_MILESTONES.md §M2.
 * 한 달을 색으로 칠하는 픽셀 그리드 + 빈 칸 채우기 + 스트릭 심리.
 * 시장 FOMO Index 흐름을 옅게 겹쳐(셀 외곽 점) 자기 패턴을 인식하게 한다.
 * 색·토큰은 @fomo/core 단일 소스 — 하드코딩 금지.
 */
export function EmotionCalendar({ data }: { data: CalendarResponse }) {
  const days = data.days as Record<string, EmotionType>;

  const cells = useMemo(
    () => buildCalendar(data.month, days, data.market, data.today),
    [data.month, days, data.market, data.today]
  );
  const stats = useMemo(
    () => calendarStats(data.month, days, data.today),
    [data.month, days, data.today]
  );

  const [year, month] = data.month.split("-");

  return (
    <section className="mt-8 w-full">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-whiteout">
          {Number(month)}월의 마음
        </h2>
        <span className="font-pixel text-xs text-muted">
          {year}.{month}
        </span>
      </div>

      {/* 빈 칸 채우기 + 스트릭 심리 — 담담하게 */}
      <p className="mb-3 mt-0.5 text-xs text-muted">
        {stats.filled > 0 ? (
          <>
            이번 달 <span className="font-pixel text-whiteout">{stats.filled}</span>
            칸을 칠했어요
            {stats.streak >= 2 ? (
              <>
                {" "}· <span style={{ color: EMOTION_COLORS.conviction }}>{stats.streak}일째</span> 함께
              </>
            ) : (
              ""
            )}
          </>
        ) : (
          "오늘 마음을 남기면 첫 칸이 칠해져요."
        )}
      </p>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-center text-[10px] text-muted">
            {w}
          </span>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {cells.map((cell, i) => {
          if (!cell.date) return <span key={`pad-${i}`} className="aspect-square" />;
          const day = Number(cell.date.slice(8, 10));
          const color = cell.emotion ? EMOTION_COLORS[cell.emotion] : null;
          // 시장 흐름을 옅게 겹침: 그날 FOMO Index가 높으면 칸 외곽에 옅은 링
          const hot = cell.marketScore != null && cell.marketScore >= 61;
          return (
            <div
              key={cell.date}
              title={
                cell.emotion
                  ? `${day}일 · ${EMOTION_LABELS[cell.emotion]}` +
                    (cell.marketScore != null ? ` · 시장 ${scoreToState(cell.marketScore)}` : "")
                  : `${day}일`
              }
              className="relative flex aspect-square items-center justify-center rounded-md text-[10px] transition-all duration-300"
              style={{
                backgroundColor: color ? color + "26" : "#141414",
                border: `1px solid ${
                  cell.isToday ? "#FAFAFA" : color ? color : "#222"
                }`,
                boxShadow: color ? `inset 0 0 10px ${color}40` : "none",
              }}
            >
              <span
                className="font-pixel"
                style={{ color: color ?? (cell.isToday ? "#FAFAFA" : "#6A6A6A") }}
              >
                {day}
              </span>
              {hot && (
                <span
                  className="absolute right-1 top-1 h-1 w-1 rounded-full"
                  style={{ backgroundColor: EMOTION_COLORS.fomo, opacity: 0.7 }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 범례 — 감정 5색 + 시장 점 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {(Object.keys(EMOTION_LABELS) as EmotionType[]).map((e) => (
          <span key={e} className="flex items-center gap-1 text-[10px] text-muted">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: EMOTION_COLORS[e] }}
            />
            {EMOTION_LABELS[e]}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px] text-muted">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: EMOTION_COLORS.fomo, opacity: 0.7 }}
          />
          시장 달아오름
        </span>
      </div>
    </section>
  );
}
