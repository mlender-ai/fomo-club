"use client";

import { useState, useCallback } from "react";
import { FomoFace } from "@/components/FomoFace";
import { getSessionId } from "@/lib/session";
import { loginWithKakao } from "@/lib/kakao";
import { loginKakao, linkSession } from "@/lib/fomoApi";

/**
 * 기록(캘린더) 탭 가입 게이트 — 비로그인 시 캘린더 대신 표시.
 * 감정선택·홈은 익명 통과, 자기 기록을 쌓고 지키고 싶은 순간에만 가입을 유도(정체성 §스트릭 심리).
 * 카카오 로그인 → 타로 인증 백엔드 재활용 → 익명 sessionId 기록을 내 계정으로 연결.
 */
export function SignupGate({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await loginWithKakao();
      await loginKakao(accessToken);
      // 가입 전 익명 기록을 내 계정으로 연결(실패해도 로그인은 성공 처리).
      try {
        await linkSession(getSessionId());
      } catch {
        /* 연결 실패는 캘린더 OR 조회가 보완 — 치명적 아님 */
      }
      onLoggedIn();
    } catch {
      setError("로그인에 실패했어. 잠깐 뒤에 다시 시도해줄래?");
      setBusy(false);
    }
  }, [busy, onLoggedIn]);

  return (
    <div className="fomo-phase-in mt-10 flex flex-col items-center px-2 text-center">
      <FomoFace face="calm" size={84} />

      <h2 className="mt-6 text-base font-semibold text-whiteout">너만의 한 달 지도</h2>
      <p className="mt-2 max-w-xs text-sm leading-6 text-muted">
        여기 칠한 칸은 너만의 감정 지도야.
        <br />
        저장하고 이어가려면 가입하자. 오늘 고른 마음은 그대로 남아.
      </p>

      <button
        onClick={handleLogin}
        disabled={busy}
        className="mt-7 flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3.5 font-medium text-[#191600] transition-opacity disabled:opacity-60"
      >
        {busy ? "잠깐만…" : "카카오로 시작하기"}
      </button>

      {error && <p className="mt-3 text-xs text-[#FF9AA2]">{error}</p>}

      <p className="mt-5 text-[11px] leading-5 text-muted">
        가입은 기록 저장·이어보기에만 써. 감정 선택과 홈은 가입 없이도 그대로야.
      </p>
    </div>
  );
}
