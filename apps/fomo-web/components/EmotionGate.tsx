"use client";

// [HIDDEN] feature flag(FEATURE_EMOTION_VOTE·FEATURE_EMOTION_JOURNAL)로 비활성화. 삭제 금지. docs/PIVOT_FEED_FIRST.md 참조.

import { useState, useCallback } from "react";
import {
  EMOTION_TYPES,
  EMOTION_LABELS,
  EMOTION_COLORS,
  scoreToFace,
  scoreToState,
  marketLine,
  mineLine,
  composeVoice,
  SITUATION_OPTIONS,
  RESOLVE_OPTIONS,
  type EmotionType,
} from "@fomo/core";
import { FomoFace } from "@/components/FomoFace";
import { stateGlow } from "@/lib/fomoVisual";

/**
 * 감정 게이트 — 진입 직후 두 단계 감정 변화가 일어나는 전용 무대 (docs/MASCOT.md §5).
 * 1단계(시장의 포모): FOMO Index 표정·색. 2단계(나의 포모): 감정 선택 시 내 색으로 물들며 멘트.
 * M4: 감정 선택 뒤 [상황 → 의연함] 2-스텝으로 구조화 한마디를 남길 수 있다(opt-in, 스킵 가능).
 * 자유 텍스트 ❌ — 정해진 조각 조합만(§2.2 형태가 곧 윤리).
 */
export function EmotionGate({
  score,
  onVote,
  onVoice,
  onDone,
  reopen = false,
}: {
  /** 오늘 FOMO Index 점수. null이면 집계 준비 중. */
  score: number | null;
  onVote: (e: EmotionType) => Promise<void> | void;
  /** M4 구조화 한마디 저장(감정은 이미 저장됨 — 같은 vote에 키만 추가). */
  onVoice?: (situationKey: string, resolveKey: string) => Promise<void> | void;
  onDone: () => void;
  /** 홈에서 '다시 고르기'로 재진입한 경우 카피를 살짝 바꾼다. */
  reopen?: boolean;
}) {
  const [picked, setPicked] = useState<EmotionType | null>(null);
  const [busy, setBusy] = useState(false);
  type VoiceStep = null | "situation" | "resolve" | "sent";
  const [voiceStep, setVoiceStep] = useState<VoiceStep>(null);
  const [situationKey, setSituationKey] = useState<string | null>(null);

  const state = score != null ? scoreToState(score) : null;
  const marketFace = score != null ? scoreToFace(score) : "curious";
  const stage: "market" | "mine" = picked ? "mine" : "market";

  // 한마디 전송 후엔 조합된 문장이 포모의 멘트 자리를 잠깐 차지한다(love mark).
  const [sentLine, setSentLine] = useState<string | null>(null);
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
      // 감정색 물듦 + 멘트를 잠깐 머금고 → 한마디 작성 스텝으로(스킵 가능)
      setTimeout(() => setVoiceStep("situation"), 1100);
    },
    [busy, onVote]
  );

  const handleResolve = useCallback(
    async (resolveKey: string) => {
      if (!picked || !situationKey) return;
      const text = composeVoice({ emotion: picked, situationKey, resolveKey });
      setSentLine(text);
      setVoiceStep("sent");
      try {
        await onVoice?.(situationKey, resolveKey);
      } catch {
        /* 저장 실패해도 경험은 이어진다 */
      }
      setTimeout(onDone, 1400);
    },
    [picked, situationKey, onVoice, onDone]
  );

  const color = picked ? EMOTION_COLORS[picked] : "#FAFAFA";

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
        size={92}
      />

      {/* FOMO Index (픽셀) */}
      <div className="mt-3 flex flex-col items-center">
        {score != null ? (
          <>
            <p className="text-4xl font-bold leading-none text-whiteout">{score}</p>
            <p className="mt-1.5 font-pixel text-xs text-muted">
              FOMO INDEX · {state}
            </p>
          </>
        ) : (
          <p className="font-pixel text-sm text-muted">FOMO INDEX · 집계 준비 중</p>
        )}
      </div>

      {/* 포모의 담담한 한마디 / 전송된 나의 한마디 */}
      {(sentLine ?? line) && (
        <p
          key={stage + (picked ?? "") + voiceStep}
          className="fomo-rise mt-3 max-w-xs text-center text-sm leading-5 text-whiteout"
        >
          {voiceStep === "sent" && sentLine ? sentLine : line}
        </p>
      )}

      {/* ── 스텝 0: 감정 선택 — 게이트의 본분 ── */}
      {voiceStep === null && (
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
      )}

      {/* ── 스텝 1·2: 구조화 한마디 (M4, opt-in) ── */}
      {(voiceStep === "situation" || voiceStep === "resolve") && (
        <section className="fomo-rise mt-9 w-full">
          <h2 className="text-center text-base font-semibold text-whiteout">
            {voiceStep === "situation" ? "오늘은 어떤 하루였어요?" : "그래도, 지금은요?"}
          </h2>
          <p className="mb-4 mt-1 text-center text-xs text-muted">
            {voiceStep === "situation"
              ? "한마디를 남기면 피드의 누군가가 덜 외로워져요. (안 해도 돼요)"
              : "조각을 고르면 한 줄이 완성돼요."}
          </p>

          <div className="flex flex-col items-stretch gap-2">
            {(voiceStep === "situation" ? SITUATION_OPTIONS : RESOLVE_OPTIONS).map((o) => (
              <button
                key={o.key}
                onClick={() =>
                  voiceStep === "situation"
                    ? (setSituationKey(o.key), setVoiceStep("resolve"))
                    : handleResolve(o.key)
                }
                className="rounded-xl border border-[#2A2A2A] bg-[#0E0E0E] px-4 py-3 text-sm text-whiteout transition-all duration-200 hover:border-[#444]"
                style={{ textAlign: "center" }}
              >
                {o.label}
                {voiceStep === "resolve" ? "" : "…"}
              </button>
            ))}
          </div>

          <button
            onClick={onDone}
            className="mx-auto mt-5 block text-xs text-muted underline-offset-2 transition-colors hover:text-whiteout"
          >
            오늘은 그냥 넘어갈래
          </button>

          {voiceStep === "resolve" && picked && situationKey && (
            <p className="mt-4 text-center text-xs text-muted">
              <span style={{ color }}>{EMOTION_LABELS[picked]}</span>
              {" · "}
              {SITUATION_OPTIONS.find((s) => s.key === situationKey)?.label}, …
            </p>
          )}
        </section>
      )}
    </main>
  );
}
