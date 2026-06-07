"use client";

import { useEffect, useState, useCallback } from "react";
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
  type FomoFace as FomoFaceType,
  type FomoState,
} from "@fomo/core";
import { FomoFace } from "@/components/FomoFace";
import { RollingBanner } from "@/components/RollingBanner";
import { EmotionCalendar } from "@/components/EmotionCalendar";
import { getSessionId } from "@/lib/session";
import {
  fetchIndex,
  fetchToday,
  fetchPulse,
  fetchWhale,
  fetchCalendar,
  postVote,
  type FomoIndexResponse,
  type TallyResponse,
  type CalendarResponse,
} from "@/lib/fomoApi";

export default function Home() {
  const [index, setIndex] = useState<FomoIndexResponse | null>(null);
  const [tally, setTally] = useState<TallyResponse | null>(null);
  const [pulse, setPulse] = useState<string[]>([]);
  const [whale, setWhale] = useState<string[]>([]);
  const [mine, setMine] = useState<EmotionType | null>(null);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    const sid = getSessionId();
    Promise.allSettled([
      fetchIndex(),
      fetchToday(),
      fetchPulse(),
      fetchWhale(),
      fetchCalendar(sid),
    ]).then(([i, t, p, w, c]) => {
      if (i.status === "fulfilled") setIndex(i.value);
      if (t.status === "fulfilled") setTally(t.value);
      if (p.status === "fulfilled") setPulse(p.value.items);
      if (w.status === "fulfilled") setWhale(w.value.items);
      if (c.status === "fulfilled") {
        setCalendar(c.value);
        // 오늘 이미 남긴 감정이 있으면 2단계(나의 포모)로 복원
        const todays = c.value.days[c.value.today];
        if (todays) setMine(todays as EmotionType);
      }
      setLoading(false);
    });
  }, []);

  const vote = useCallback(async (e: EmotionType) => {
    setVoting(true);
    setMine(e); // 2단계 즉시 전환(낙관적)
    try {
      const res = await postVote(getSessionId(), e);
      setTally(res);
      // 캘린더 오늘 칸 즉시 반영(낙관적)
      setCalendar((prev) =>
        prev ? { ...prev, days: { ...prev.days, [prev.today]: e } } : prev
      );
    } catch {
      /* 선택 상태 유지 */
    } finally {
      setVoting(false);
    }
  }, []);

  const stage: "market" | "mine" = mine ? "mine" : "market";
  const state: FomoState | null = index ? scoreToState(index.score) : null;
  const marketFace: FomoFaceType = index ? scoreToFace(index.score) : "curious";
  const line = mine ? mineLine(mine) : state ? marketLine(state) : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 pb-10 pt-5">
      {/* 헤더 */}
      <div className="mb-4 flex w-full items-center justify-between">
        <span className="font-pixel text-base text-whiteout">FOMO CLUB</span>
        <span className="text-xs text-muted">가입 없이 둘러보기</span>
      </div>

      {/* 고래/시장 신호 롤링 배너 (실데이터, 하향비교 안도) */}
      <div className="mb-4 w-full">
        <RollingBanner items={whale.length > 0 ? whale : pulse} />
      </div>

      {/* 주인공: 포모 */}
      <p className="mb-2 text-xs text-muted">
        {stage === "market" ? "오늘의 포모" : "나의 포모"}
      </p>
      <FomoFace
        face={stage === "market" ? marketFace : "calm"}
        glow={stage === "mine" && mine ? EMOTION_COLORS[mine] : state ? STATE_GLOW(index!.score) : undefined}
        size={120}
      />

      {/* 보조: FOMO Index (픽셀) */}
      <div className="mt-3 flex flex-col items-center">
        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : index ? (
          <>
            <p className="font-pixel text-4xl leading-none text-whiteout">{index.score}</p>
            <p className="mt-1.5 font-pixel text-xs text-muted">
              FOMO INDEX · {index.state}
              {index.prevDayDelta ? ` · 전일 ${index.prevDayDelta > 0 ? "+" : ""}${index.prevDayDelta}` : ""}
            </p>
          </>
        ) : (
          <p className="font-pixel text-sm text-muted">FOMO INDEX · 집계 준비 중</p>
        )}
      </div>

      {/* 포모의 담담한 한마디 (전환 시 떠오름) */}
      {line && (
        <p key={stage + (mine ?? "")} className="fomo-rise mt-3 max-w-xs text-center text-sm leading-5 text-whiteout">
          {line}
        </p>
      )}

      {/* 잔잔한 날 = 치유의 날 — 변동성 없는 날에도 열 이유 (M2) */}
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

      {/* 오늘의 감정 투표 */}
      <section className="mt-7 w-full">
        <h2 className="text-base font-semibold text-whiteout">오늘 당신의 감정은?</h2>
        <p className="mb-3 text-xs text-muted">하루 한 번, 지금 마음에 가까운 걸로.</p>

        <div className="flex flex-wrap gap-2">
          {EMOTION_TYPES.map((e) => {
            const selected = mine === e;
            return (
              <button
                key={e}
                disabled={voting}
                onClick={() => vote(e)}
                className="rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-200 disabled:opacity-60"
                style={{
                  borderColor: selected ? EMOTION_COLORS[e] : "#2A2A2A",
                  backgroundColor: selected ? EMOTION_COLORS[e] + "20" : "#0E0E0E",
                  color: selected ? EMOTION_COLORS[e] : "#FAFAFA",
                  boxShadow: selected ? `0 0 18px ${EMOTION_COLORS[e]}55` : "none",
                }}
              >
                {EMOTION_LABELS[e]}
              </button>
            );
          })}
        </div>

        {/* 집계 — 정직한 숫자 */}
        {tally && (
          <div className="mt-5">
            <p className="text-xs text-muted">
              오늘 <span className="font-pixel text-whiteout">{tally.total}</span>명이 마음을 남겼어요
              {mine ? " · 너도 그 안에 있어" : ""}
            </p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {EMOTION_TYPES.map((e) => (
                <div key={e} className="flex items-center gap-2.5">
                  <span className="w-10 text-xs" style={{ color: EMOTION_COLORS[e] }}>{EMOTION_LABELS[e]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{ width: `${tally.ratios[e] ?? 0}%`, backgroundColor: EMOTION_COLORS[e] }}
                    />
                  </div>
                  <span className="w-9 text-right font-pixel text-xs text-muted">{tally.ratios[e] ?? 0}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 감정 캘린더 — 매일 돌아올 이유 (M2) */}
      {calendar && <EmotionCalendar data={calendar} />}

      {/* 면책 — 담담하게 */}
      <p className="mt-7 text-center text-[11px] leading-5 text-muted">
        FOMO Index는 감정 체감 지표예요. 투자 조언이 아니에요.
      </p>
    </main>
  );
}

// 시장의 포모: 지수가 높을수록 옅은 따뜻함, 낮으면 차분(무채색에 가깝게)
function STATE_GLOW(score: number): string | undefined {
  if (score >= 61) return EMOTION_COLORS.fomo; // 달아오름
  if (score >= 41) return "#5A5A5A"; // 관심 — 옅은 무채색
  return undefined; // 관망/무관심 — 잔잔, glow 없음
}
