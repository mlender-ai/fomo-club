"use client";

import { useMemo } from "react";
import type { FeedHubCalendar, FeedHubCalendarStockRef } from "@/lib/fomoApi";
import { getWatchlist } from "@/lib/watchlist";
import { getDiscoverySeen } from "@/lib/discoveryPerformance";

/**
 * 주간 판단 캘린더 (2026-07-15) — 해자: 일정 나열이 아니라 "내 카드의 시험대".
 * 서버는 발견 유니버스 어닝+매크로 일정만 주고, 이 컴포넌트가 로그인 없이 localStorage
 * (담은 카드 fomo_watchlist · 본 카드 fomo_discovery_seen)와 조인해 내 종목을 하이라이트한다.
 * 윤리 가드: 사실 일정만, 공포·재촉·예측 없음 — 프레임은 "미리 알고 보는 복기 준비".
 */

const NEON = "#D8FF3A";

function dayLabel(dateIso: string, todayIso: string): string {
  const [, m, d] = dateIso.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${dateIso}T00:00:00+09:00`).getDay()];
  const diff = Math.round((Date.parse(dateIso) - Date.parse(todayIso)) / 86_400_000);
  const dday = diff === 0 ? "오늘" : `D-${diff}`;
  return `${Number(m)}/${Number(d)} ${weekday} · ${dday}`;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function CalendarCard({ calendar }: { calendar: FeedHubCalendar }) {
  // 내 카드 조인 — 담은(★) 종목과 본 종목. 렌더 시점 1회면 충분(캘린더는 하루 단위 데이터).
  const { mineSet, seenSet } = useMemo(() => {
    const mine = new Set(getWatchlist().map((w) => w.stock));
    const seen = new Set(getDiscoverySeen().map((s) => s.stock));
    return { mineSet: mine, seenSet: seen };
  }, []);

  const today = kstToday();
  const myUpcoming = useMemo(() => {
    const names = new Set<string>();
    for (const day of calendar.days) {
      for (const event of day.events) {
        for (const stock of event.stocks ?? []) {
          if (mineSet.has(stock.canonical) || seenSet.has(stock.canonical)) names.add(stock.canonical);
        }
      }
    }
    return [...names];
  }, [calendar, mineSet, seenSet]);

  const stockChip = (stock: FeedHubCalendarStockRef) => {
    const isMine = mineSet.has(stock.canonical);
    const isSeen = !isMine && seenSet.has(stock.canonical);
    return (
      <span
        key={stock.symbol}
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
        style={
          isMine
            ? { borderColor: NEON, color: NEON }
            : isSeen
              ? { borderColor: "rgba(216,255,58,0.35)", color: "rgba(250,250,250,0.9)" }
              : { borderColor: "var(--hairline, #2a2a2a)", color: "rgba(250,250,250,0.72)" }
        }
      >
        {isMine && <span aria-hidden>★</span>}
        {stock.canonical}
        {stock.session && <span className="text-[10px] opacity-70">{stock.session}</span>}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[10px] uppercase tracking-wide text-muted">WEEKLY CALENDAR</span>
        <span className="text-[10px] text-muted">발견 유니버스 · 공개 일정</span>
      </div>
      <p className="mt-2 text-base font-bold leading-6 text-whiteout">이번 주 시장 일정</p>
      {myUpcoming.length > 0 ? (
        <p className="mt-1 text-xs leading-5" style={{ color: NEON }}>
          내가 본 카드 {myUpcoming.length}장({myUpcoming.slice(0, 3).join("·")}
          {myUpcoming.length > 3 ? " 외" : ""})의 발표가 이번 주에 있어요.
        </p>
      ) : (
        <p className="mt-1 text-xs leading-5 text-muted">카드를 담아두면 그 종목의 발표 일정이 여기서 표시돼요.</p>
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {calendar.days.map((day) => (
          <div key={day.date} className="rounded-xl border border-hairline-soft px-3 py-2.5">
            <p className="text-[11px] font-semibold text-muted">{dayLabel(day.date, today)}</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {day.events.map((event, idx) =>
                event.kind === "macro" ? (
                  <p key={`${day.date}-m-${idx}`} className="text-sm leading-5 text-whiteout">
                    {event.title}
                    {event.detail && <span className="text-xs text-muted"> — {event.detail}</span>}
                  </p>
                ) : (
                  <div key={`${day.date}-e-${idx}`} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm text-whiteout">실적 발표</span>
                    {(event.stocks ?? []).map(stockChip)}
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted">
        미국 확정 일정 기준이에요. 국장 실적 일정은 준비 중 — 발표 당일 공시는 피드 종목 이슈로 올라와요.
      </p>
    </div>
  );
}
