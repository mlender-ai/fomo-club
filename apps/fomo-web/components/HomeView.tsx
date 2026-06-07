"use client";

import {
  EMOTION_TYPES,
  EMOTION_LABELS,
  EMOTION_COLORS,
  scoreToFace,
  scoreToState,
  marketLine,
  mineLine,
  isCalmDay,
  restorativeLine,
  type EmotionType,
} from "@fomo/core";
import { FomoFace } from "@/components/FomoFace";
import { RollingBanner } from "@/components/RollingBanner";
import { EmotionCalendar } from "@/components/EmotionCalendar";
import { stateGlow } from "@/lib/fomoVisual";
import type {
  FomoIndexResponse,
  TallyResponse,
  CalendarResponse,
} from "@/lib/fomoApi";

/**
 * 메인 홈 — '나의 포모' 상태로 진입(감정은 게이트에서 이미 선택됨).
 * 감정 칩 섹션은 게이트로 이전. 대신 '오늘의 너' 요약 + 다시 고르기.
 * 집계의 '너처럼 N명'(M3)·캘린더(M2)는 유지.
 */
export function HomeView({
  index,
  tally,
  pulse,
  whale,
  calendar,
  mine,
  onReopenGate,
}: {
  index: FomoIndexResponse | null;
  tally: TallyResponse | null;
  pulse: string[];
  whale: string[];
  calendar: CalendarResponse | null;
  mine: EmotionType | null;
  onReopenGate: () => void;
}) {
  const state = index ? scoreToState(index.score) : null;
  const marketFace = index ? scoreToFace(index.score) : "curious";
  const stage: "market" | "mine" = mine ? "mine" : "market";
  const line = mine ? mineLine(mine) : state ? marketLine(state) : "";

  return (
    <main className="fomo-phase-in mx-auto flex min-h-screen max-w-md flex-col items-center px-6 pb-10 pt-5">
      {/* 헤더 */}
      <div className="mb-4 flex w-full items-center justify-between">
        <span className="font-pixel text-base text-whiteout">FOMO CLUB</span>
        <span className="text-xs text-muted">가입 없이 둘러보기</span>
      </div>

      {/* 혼자가 아님의 신호 — 시장 무관 단일 카드 문법 (M3) */}
      <div className="mb-4 w-full">
        <RollingBanner items={[...whale, ...pulse]} />
      </div>

      {/* 주인공: 포모 */}
      <p className="mb-2 text-xs text-muted">{stage === "market" ? "오늘의 포모" : "나의 포모"}</p>
      <FomoFace
        face={stage === "market" ? marketFace : "calm"}
        glow={
          stage === "mine" && mine
            ? EMOTION_COLORS[mine]
            : index
              ? stateGlow(index.score)
              : undefined
        }
        size={120}
      />

      {/* 보조: FOMO Index (픽셀) */}
      <div className="mt-3 flex flex-col items-center">
        {index ? (
          <>
            <p className="font-pixel text-4xl leading-none text-whiteout">{index.score}</p>
            <p className="mt-1.5 font-pixel text-xs text-muted">
              FOMO INDEX · {index.state}
              {index.prevDayDelta
                ? ` · 전일 ${index.prevDayDelta > 0 ? "+" : ""}${index.prevDayDelta}`
                : ""}
            </p>
          </>
        ) : (
          <p className="font-pixel text-sm text-muted">FOMO INDEX · 집계 준비 중</p>
        )}
      </div>

      {/* 포모의 담담한 한마디 */}
      {line && (
        <p
          key={stage + (mine ?? "")}
          className="fomo-rise mt-3 max-w-xs text-center text-sm leading-5 text-whiteout"
        >
          {line}
        </p>
      )}

      {/* 오늘의 너 — 게이트에서 고른 감정 요약 + 다시 고르기 */}
      {mine && (
        <div className="mt-4 flex items-center gap-2.5 rounded-full border border-hairline bg-surface px-4 py-2">
          <span className="text-xs text-muted">오늘의 너</span>
          <span className="font-pixel text-sm" style={{ color: EMOTION_COLORS[mine] }}>
            {EMOTION_LABELS[mine]}
          </span>
          <span className="text-hairline" aria-hidden>
            ·
          </span>
          <button
            onClick={onReopenGate}
            className="text-xs text-muted underline-offset-2 transition-colors hover:text-whiteout"
          >
            다시 고르기
          </button>
        </div>
      )}

      {/* 잔잔한 날 = 치유의 날 (M2) */}
      {state && index && isCalmDay(state) && (
        <div className="fomo-rise mt-4 flex w-full items-start gap-2.5 rounded-xl border border-hairline bg-surface px-4 py-3">
          <span className="mt-0.5 text-sm" aria-hidden>
            🌙
          </span>
          <div>
            <p className="text-xs text-muted">오늘의 쉼</p>
            <p className="mt-0.5 text-sm leading-5 text-whiteout">{restorativeLine(index.date)}</p>
          </div>
        </div>
      )}

      {/* 집계 — 정직한 숫자 */}
      {tally && (
        <section className="mt-7 w-full">
          <p className="text-xs text-muted">
            오늘 <span className="font-pixel text-whiteout">{tally.total}</span>명이 마음을 남겼어요
            {mine ? " · 너도 그 안에 있어" : ""}
          </p>
          {/* 혼자가 아님의 직접 체감 (M3) */}
          {mine && (tally.counts[mine] ?? 0) > 1 && (
            <p key={mine} className="fomo-rise mt-1.5 text-sm leading-5 text-whiteout">
              지금 너처럼{" "}
              <span className="font-pixel" style={{ color: EMOTION_COLORS[mine] }}>
                {EMOTION_LABELS[mine]}
              </span>
              인 사람,{" "}
              <span className="font-pixel" style={{ color: EMOTION_COLORS[mine] }}>
                {tally.counts[mine]}
              </span>
              명. 너만 그런 거 아니야.
            </p>
          )}
          <div className="mt-2.5 flex flex-col gap-1.5">
            {EMOTION_TYPES.map((e) => (
              <div key={e} className="flex items-center gap-2.5">
                <span className="w-10 text-xs" style={{ color: EMOTION_COLORS[e] }}>
                  {EMOTION_LABELS[e]}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${tally.ratios[e] ?? 0}%`, backgroundColor: EMOTION_COLORS[e] }}
                  />
                </div>
                <span className="w-9 text-right font-pixel text-xs text-muted">
                  {tally.ratios[e] ?? 0}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 감정 캘린더 (M2) */}
      {calendar && <EmotionCalendar data={calendar} />}

      {/* 면책 — 담담하게 */}
      <p className="mt-7 text-center text-[11px] leading-5 text-muted">
        FOMO Index는 감정 체감 지표예요. 투자 조언이 아니에요.
      </p>
    </main>
  );
}
