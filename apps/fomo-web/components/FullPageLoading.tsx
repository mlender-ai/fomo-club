"use client";

import { useEffect, useState } from "react";

/**
 * 전체 화면 로딩 — 추정 프로그레스 바 + 단계 텍스트 (LOADING PROGRESS HANDOFF C안).
 *
 * 스켈레톤·빈 박스 대신 콘텐츠 영역을 통째로 덮어 "죽은 듯한 중간 상태"를 없앤다.
 * 메인/뎁스/종목 세 화면이 공유(추정시간·단계 텍스트만 prop 으로).
 *
 * 정직성:
 *  - LLM 은 정확한 진척을 안 주므로 *추정* 바(평균 소요 기준 차오름). 90%에서 멈춰 가짜 100% 금지.
 *  - 실제 완료는 부모가 loading=false 로 이 컴포넌트를 언마운트하며 콘텐츠로 전환.
 *  - 추정 초과 시 마지막 단계("거의 다 됐어")로 안내.
 * warm(캐시 적중): REVEAL_DELAY_MS 이내 완료면 로딩 화면 자체를 안 그려 깜빡임 방지.
 *
 * 카피·바 디자인 최종본은 광혁 영역 — 여기선 상태·추정시간만 정확히 표현.
 */
const REVEAL_DELAY_MS = 150; // 이 시간 내 완료(warm)면 로딩 화면이 아예 안 뜸
const TICK_MS = 100;
const MAX_RATIO = 0.9; // 가짜 100% 금지 — 추정 바는 90%에서 정지

export function FullPageLoading({
  estimateMs,
  steps,
}: {
  estimateMs: number;
  steps: readonly string[];
}) {
  const [elapsed, setElapsed] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const reveal = window.setTimeout(() => setShown(true), REVEAL_DELAY_MS);
    const tick = window.setInterval(() => setElapsed(Date.now() - start), TICK_MS);
    return () => {
      window.clearTimeout(reveal);
      window.clearInterval(tick);
    };
  }, []);

  if (!shown) return null;

  const ratio = Math.min(MAX_RATIO, estimateMs > 0 ? elapsed / estimateMs : MAX_RATIO);
  const pct = Math.round(ratio * 100);
  // 단계 — 진척 비율로 인덱스. 추정 초과면 마지막 단계 고정("거의 다 됐어").
  const overEstimate = elapsed >= estimateMs;
  const idx = overEstimate
    ? steps.length - 1
    : Math.min(steps.length - 1, Math.floor((elapsed / estimateMs) * steps.length));
  const label = steps[idx] ?? "";

  return (
    <div
      className="fomo-phase-in flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 px-10"
      aria-busy="true"
      role="status"
    >
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-whiteout transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm leading-6 text-muted">{label}</p>
    </div>
  );
}

/** 화면별 추정시간·단계 텍스트(임시 카피 — 광혁 조정). 캐시 적중 시엔 안 보임. */
export const LOADING_PRESETS = {
  main: {
    estimateMs: 8_000,
    steps: ["오늘 뭐에 쏠렸는지 모으는 중…", "키워드 정리하는 중…", "거의 다 됐어"] as const,
  },
  theme: {
    estimateMs: 15_000,
    steps: ["원문 읽는 중…", "강세·약세 정리하는 중…", "거의 다 됐어"] as const,
  },
  stock: {
    estimateMs: 80_000,
    steps: ["원문 읽는 중…", "강세·약세 정리하는 중…", "거의 다 됐어"] as const,
  },
} as const;
