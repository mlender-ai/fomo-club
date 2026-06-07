"use client";

import { useState, useCallback } from "react";
import {
  EMOTION_TYPES,
  EMOTION_LABELS,
  EMOTION_COLORS,
  scoreToFace,
  scoreToState,
  marketLine,
  mineLine,
  type EmotionType,
} from "@fomo/core";
import { FomoFace } from "@/components/FomoFace";
import { stateGlow } from "@/lib/fomoVisual";

/**
 * 감정 게이트 — 진입 직후 두 단계 감정 변화가 일어나는 전용 무대 (docs/MASCOT.md §5).
 * 1단계(시장의 포모): FOMO Index 표정·색. 2단계(나의 포모): 감정 선택 시 내 색으로 물들며 멘트.
 * 선택 → onVote(저장) → 2단계 전환 유지 후 onDone()으로 홈 전환.
 */
export function EmotionGate({
  score,
  onVote,
  onDone,
  reopen = false,
}: {
  /** 오늘 FOMO Index 점수. null이면 집계 준비 중. */
  score: number | null;
  onVote: (e: EmotionType) => Promise<void> | void;
  onDone: () => void;
  /** 홈에서 '다시 고르기'로 재진입한 경우 카피를 살짝 바꾼다. */
  reopen?: boolean;
}) {
  const [picked, setPicked] = useState<EmotionType | null>(null);
  const [busy, setBusy] = useState(false);

  const state = score != null ? scoreToState(score) : null;
  const marketFace = score != null ? scoreToFace(score) : "curious";
  const stage: "market" | "mine" = picked ? "mine" : "market";
  const line = picked ? mineLine(picked) : state ? marketLine(state) : "";

  const handlePick = useCallback(
    async (e: EmotionType) => {
      if (busy) return;
      setBusy(true);
      setPicked(e); // 2단계 즉시 전환(낙관적)
      try {
        await onVote(e);
      } catch {
        /* 선택 상태 유지 — 저장 실패해도 경험은 이어진다 */
      }
      // 2단계 전환(감정색 물듦 + 멘트)을 잠깐 머금고 홈으로
      setTimeout(onDone, 1100);
    },
    [busy, onVote, onDone]
  );

  return (
    <main className="fomo-phase-in mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <p className="mb-2 text-xs text-muted">{stage === "market" ? "오늘의 포모" : "나의 포모"}</p>

      <FomoFace
        face={stage === "market" ? marketFace : "calm"}
        glow={
          stage === "mine" && picked
            ? EMOTION_COLORS[picked]
            : score != null
              ? stateGlow(score)
              : undefined
        }
        size={132}
      />

      {/* FOMO Index (픽셀) */}
      <div className="mt-3 flex flex-col items-center">
        {score != null ? (
          <>
            <p className="font-pixel text-4xl leading-none text-whiteout">{score}</p>
            <p className="mt-1.5 font-pixel text-xs text-muted">
              FOMO INDEX · {state}
            </p>
          </>
        ) : (
          <p className="font-pixel text-sm text-muted">FOMO INDEX · 집계 준비 중</p>
        )}
      </div>

      {/* 포모의 담담한 한마디 */}
      {line && (
        <p
          key={stage + (picked ?? "")}
          className="fomo-rise mt-3 max-w-xs text-center text-sm leading-5 text-whiteout"
        >
          {line}
        </p>
      )}

      {/* 감정 선택 — 게이트의 본분 */}
      <section className="mt-9 w-full">
        <h2 className="text-center text-base font-semibold text-whiteout">
          {reopen ? "지금 마음은 어때?" : "오늘 당신의 감정은?"}
        </h2>
        <p className="mb-4 mt-1 text-center text-xs text-muted">
          하루 한 번, 지금 마음에 가까운 걸로.
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          {EMOTION_TYPES.map((e) => {
            const selected = picked === e;
            return (
              <button
                key={e}
                disabled={busy}
                onClick={() => handlePick(e)}
                className="rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 disabled:cursor-default"
                style={{
                  borderColor: selected ? EMOTION_COLORS[e] : "#2A2A2A",
                  backgroundColor: selected ? EMOTION_COLORS[e] + "20" : "#0E0E0E",
                  color: selected ? EMOTION_COLORS[e] : "#FAFAFA",
                  boxShadow: selected ? `0 0 18px ${EMOTION_COLORS[e]}55` : "none",
                  opacity: busy && !selected ? 0.4 : 1,
                }}
              >
                {EMOTION_LABELS[e]}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
