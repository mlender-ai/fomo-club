"use client";

import { useState, useMemo } from "react";
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
  calendarStats,
  personalLine,
  prevDay,
  FEATURE_EMOTION_VOTE,
  FEATURE_EMOTION_JOURNAL,
  FEATURE_HISTORY_TAB,
  FEATURE_FEED_EMOTION_TABS,
  type EmotionType,
} from "@fomo/core";
import { FomoFace } from "@/components/FomoFace";
import { RollingBanner } from "@/components/RollingBanner";
import { EmotionCalendar } from "@/components/EmotionCalendar";
import { SignupGate } from "@/components/SignupGate";
import { VoiceFeed } from "@/components/VoiceFeed";
import { FomoIndexSkeleton, TallySkeleton } from "@/components/SkeletonLoader";
import { stateGlow } from "@/lib/fomoVisual";
import type {
  FomoIndexResponse,
  TallyResponse,
  CalendarResponse,
  BannerItem,
  VoiceItem,
} from "@/lib/fomoApi";

type Tab = "home" | "feed" | "calendar";

// 방향 전환(docs/PIVOT_FEED_FIRST.md): 기록 탭은 flag로 숨김 — 기본 [오늘/피드] 2탭.
const TABS: { key: Tab; label: string }[] = [
  { key: "home", label: "오늘" },
  ...(FEATURE_FEED_EMOTION_TABS || FEATURE_EMOTION_JOURNAL
    ? [{ key: "feed" as Tab, label: "피드" }]
    : []),
  ...(FEATURE_HISTORY_TAB ? [{ key: "calendar" as Tab, label: "기록" }] : []),
];

/**
 * 메인 홈 — 하단 탭 바로 메인/캘린더 분기.
 * 향후 탭 추가 시 TABS 배열에만 항목 추가하면 됨.
 */
export function HomeView({
  index,
  tally,
  banner,
  calendar,
  voices,
  mine,
  onReopenGate,
  loggedIn,
  onLoggedIn,
}: {
  index: FomoIndexResponse | null;
  tally: TallyResponse | null;
  banner: BannerItem[];
  calendar: CalendarResponse | null;
  voices: VoiceItem[] | null;
  mine: EmotionType | null;
  onReopenGate: () => void;
  loggedIn: boolean;
  onLoggedIn: () => void;
}) {
  const [tab, setTab] = useState<Tab>("home");

  const state = index ? scoreToState(index.score) : null;
  const marketFace = index ? scoreToFace(index.score) : "curious";
  // 액션 제로: 감정 투표가 꺼져 있으면 항상 시장의 포모만 보여준다.
  const stage: "market" | "mine" = FEATURE_EMOTION_VOTE && mine ? "mine" : "market";
  // 연속 기록 — 캘린더와 같은 계산(calendarStats)·같은 문구로 홈에도 살짝 (전략: 리텐션 = BM의 전제)
  const streak = calendar
    ? calendarStats(calendar.month, calendar.days as Record<string, EmotionType>, calendar.today).streak
    : 0;
  // 포모의 기억 — 어제의 감정·연속 기록을 기억하는 멘트가 있으면 우선, 없으면 기존 한마디 폴백
  const memory =
    mine && calendar
      ? personalLine({
          yesterdayEmotion: (calendar.days[prevDay(calendar.today)] ?? null) as EmotionType | null,
          todayEmotion: mine,
          streak,
        })
      : null;
  const line =
    stage === "mine" && mine ? (memory ?? mineLine(mine)) : state ? marketLine(state) : "";

  // FomoFace props 메모이제이션 — 불필요한 리렌더 방지 (이슈 #410)
  const fomoFaceGlow = useMemo(
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

            {/* 주인공: 포모 */}
            <p className="mb-2 text-xs text-muted">{stage === "market" ? "오늘의 포모" : "나의 포모"}</p>
            <FomoFace
              face={stage === "market" ? marketFace : "calm"}
              size={84}
              {...(fomoFaceGlow !== undefined ? { glow: fomoFaceGlow } : {})}
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
                  {FEATURE_EMOTION_VOTE && streak >= 2 && (
                    <p className="mt-1.5 font-pixel text-[11px]" style={{ color: EMOTION_COLORS.conviction }}>
                      {streak}일째 함께
                    </p>
                  )}
                </>
              ) : (
                <FomoIndexSkeleton />
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

            {/* 오늘의 너 — 게이트에서 고른 감정 요약 + 다시 고르기 [HIDDEN: FEATURE_EMOTION_VOTE] */}
            {FEATURE_EMOTION_VOTE && mine && (
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

            {/* 집계 — 정직한 숫자. 로딩 중이면 스켈레톤(이슈 #409). [HIDDEN: FEATURE_EMOTION_VOTE] */}
            {FEATURE_EMOTION_VOTE &&
            (tally ? (
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
            ) : (
              <TallySkeleton />
            ))}

            {/* 면책 — 담담하게. 상담 안내 한 줄 = "여긴 등쳐먹는 곳이 아니다"의 증명 */}
            <p className="mt-7 text-center text-[11px] leading-5 text-muted">
              FOMO Index는 감정 체감 지표예요. 투자 조언이 아니에요.
              <br />
              도박문제로 힘들 땐 <span className="text-whiteout">1336</span>
              (한국도박문제예방치유원)에서 무료로 상담할 수 있어요.
            </p>
          </>
        )}

        {tab === "feed" && (
          <div className="w-full">
            {/* 한마디 피드(VoiceFeed)는 감정 기록과 한 몸 — flag로 숨김 [HIDDEN: FEATURE_EMOTION_JOURNAL] */}
            {FEATURE_EMOTION_JOURNAL && <VoiceFeed items={voices} />}
          </div>
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

      {/* 하단 탭 바 — TABS 배열(flag 필터)로 렌더 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#1E1E1E] bg-black">
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <TabButton
              key={t.key}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
              label={t.label}
            />
          ))}
        </div>
      </nav>
    </>
  );
}

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
