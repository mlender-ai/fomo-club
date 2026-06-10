"use client";

import { memo, useState, useMemo } from "react";
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
import { SignupGate } from "@/components/SignupGate";
import { FomoIndexSkeleton, TallySkeleton } from "@/components/SkeletonLoader";
import { stateGlow } from "@/lib/fomoVisual";
import type {
  FomoIndexResponse,
  TallyResponse,
  CalendarResponse,
  BannerItem,
} from "@/lib/fomoApi";

type Tab = "home" | "calendar";

/**
 * 메인 홈 — 하단 탭 바로 메인/캘린더 분기.
 * 향후 M4(피드) 등 탭 추가 시 TABS 배열에만 항목 추가하면 됨.
 */
export const HomeView = memo(function HomeView({
  index,
  tally,
  banner,
  calendar,
  mine,
  onReopenGate,
  loggedIn,
  onLoggedIn,
  isLoading = false,
}: {
  index: FomoIndexResponse | null;
  tally: TallyResponse | null;
  banner: BannerItem[];
  calendar: CalendarResponse | null;
  mine: EmotionType | null;
  onReopenGate: () => void;
  loggedIn: boolean;
  onLoggedIn: () => void;
  isLoading?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("home");

  const state = useMemo(() => (index ? scoreToState(index.score) : null), [index]);
  const marketFace = useMemo(() => (index ? scoreToFace(index.score) : "curious"), [index]);
  const stage: "market" | "mine" = mine ? "mine" : "market";
  const line = useMemo(
    () => (mine ? mineLine(mine) : state ? marketLine(state) : ""),
    [mine, state]
  );
  const glowColor = useMemo(
    () =>
      stage === "mine" && mine
        ? EMOTION_COLORS[mine]
        : index
          ? stateGlow(index.score)
          : undefined,
    [stage, mine, index]
  );

  return (
    <>
      <main className="fomo-phase-in mx-auto flex min-h-screen max-w-md flex-col items-center px-6 pb-24 pt-5">
        {/* 헤더 */}
        <div className="mb-4 flex w-full items-center justify-between">
          <span className="font-pixel text-base text-whiteout">FOMO CLUB</span>
          <span className="text-xs text-muted">가입 없이 둘러보기</span>
        </div>

        {tab === "home" && (
          <>
            {/* 혼자가 아님의 신호 — 롤링 배너(클릭 시 상세) (M3) */}
            <div className="mb-4 w-full">
              <RollingBanner items={banner} />
            </div>

            {/* 주인공: 포모 (로딩 중엔 스켈레톤) */}
            {isLoading && !index ? (
              <FomoIndexSkeleton />
            ) : (
              <>
                <p className="mb-2 text-xs text-muted">{stage === "market" ? "오늘의 포모" : "나의 포모"}</p>
                <FomoFace
                  face={stage === "market" ? marketFace : "calm"}
                  glow={glowColor}
                  size={84}
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
              </>
            )}

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
                <span className="text-hairline" aria-hidden>·</span>
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
                <span className="mt-0.5 text-sm" aria-hidden>🌙</span>
                <div>
                  <p className="text-xs text-muted">오늘의 쉼</p>
                  <p className="mt-0.5 text-sm leading-5 text-whiteout">{restorativeLine(index.date)}</p>
                </div>
              </div>
            )}

            {/* 집계 — 정직한 숫자 (로딩 중엔 스켈레톤) */}
            {isLoading && !tally ? (
              <section className="mt-7 w-full">
                <TallySkeleton />
              </section>
            ) : tally && (
              <section className="mt-7 w-full">
                <p className="text-xs text-muted">
                  오늘 <span className="font-pixel text-whiteout">{tally.total}</span>명이 마음을 남겼어요
                  {mine ? " · 너도 그 안에 있어" : ""}
                </p>
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

            {/* 면책 — 담담하게 */}
            <p className="mt-7 text-center text-[11px] leading-5 text-muted">
              FOMO Index는 감정 체감 지표예요. 투자 조언이 아니에요.
            </p>
          </>
        )}

        {tab === "calendar" && (
          <div className="w-full">
            {!loggedIn ? (
              <SignupGate onLoggedIn={onLoggedIn} />
            ) : calendar ? (
              <EmotionCalendar data={calendar} />
            ) : (
              <p className="mt-10 text-center text-sm text-muted">불러오는 중…</p>
            )}
          </div>
        )}
      </main>

      {/* 하단 탭 바 — 향후 탭 추가 시 여기에 항목 추가 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#1E1E1E] bg-black">
        <div className="mx-auto flex max-w-md">
          <TabButton active={tab === "home"} onClick={() => setTab("home")} label="오늘" />
          <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} label="기록" />
        </div>
      </nav>
    </>
  );
});

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1 py-3 transition-colors"
    >
      <span
        className="font-pixel text-xs transition-colors"
        style={{ color: active ? "#FAFAFA" : "#555" }}
      >
        {label}
      </span>
      {active && (
        <span className="h-0.5 w-4 rounded-full bg-whiteout" />
      )}
    </button>
  );
}
