"use client";

import { useState } from "react";
import { registerEmail, loginEmail, logout, deleteAccount } from "@/lib/fomoApi";

/**
 * 로그인/가입 페이지 — 트랙 B(바텀시트 → 페이지 형태). 이메일+비밀번호.
 * 메인에서 카드 탭 시(비로그인) 또는 헤더 "로그인" 으로 진입. 로그인하면 취향이 기억된다.
 * ⚠️ 화면·카피·약관 문구는 광혁 직접 영역 — 텍스트/스타일은 임시(기능 우선).
 * 성공 시 fomoApi 가 토큰 저장 + 익명 취향 연결까지 처리한 뒤 onAuthed() 호출.
 */
export function LoginPage({
  loggedIn,
  onClose,
  onAuthed,
}: {
  loggedIn: boolean;
  onClose: () => void;
  onAuthed: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") await registerEmail(email, password);
      else await loginEmail(email, password);
      onAuthed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "문제가 생겼어. 다시 시도해줘.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black">
      <div className="mx-auto flex h-full max-w-md flex-col">
        {/* 상단 바 */}
        <div className="flex items-center gap-2.5 border-b border-hairline px-6 py-4">
          <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-whiteout" aria-label="뒤로">
            ← 뒤로
          </button>
          <span className="text-lg font-bold text-whiteout">{loggedIn ? "내 계정" : "로그인"}</span>
        </div>

        <div className="flex flex-1 flex-col justify-center px-6 pb-24">
          {loggedIn ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-6 text-muted">로그인 상태야. 취향이 계정에 기억되고 있어.</p>
              <button
                onClick={() => {
                  logout();
                  onClose();
                  window.location.reload();
                }}
                className="rounded-lg border border-hairline px-4 py-3 text-sm text-whiteout"
              >
                로그아웃
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm("정말 탈퇴할래? 쌓인 취향 데이터도 함께 삭제돼.")) return;
                  try {
                    await deleteAccount();
                    onClose();
                    window.location.reload();
                  } catch {
                    setError("탈퇴 처리에 실패했어.");
                  }
                }}
                className="rounded-lg px-4 py-3 text-sm text-muted"
              >
                탈퇴(데이터 삭제)
              </button>
              {error && <p className="text-[12px] text-[#ff5a5f]">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="font-pixel text-base text-whiteout">
                {mode === "login" ? "다시 왔구나" : "취향을 기억해줄게"}
              </p>
              <p className="text-[13px] leading-5 text-muted">
                로그인하면 네가 넘긴 카드가 기억돼서, 다음엔 너에게 맞는 흐름부터 보여줄게.
              </p>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 rounded-lg border border-hairline bg-surface px-3 py-3 text-sm text-whiteout outline-none focus:border-whiteout/30"
              />
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="비밀번호 (8자 이상)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
                className="rounded-lg border border-hairline bg-surface px-3 py-3 text-sm text-whiteout outline-none focus:border-whiteout/30"
              />
              {error && <p className="text-[12px] text-[#ff5a5f]">{error}</p>}
              <button
                onClick={submit}
                disabled={busy}
                className="mt-1 rounded-lg bg-[#FF5A36] px-4 py-3 text-sm font-pixel text-white disabled:opacity-50"
              >
                {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하고 시작"}
              </button>
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
                className="text-[12px] text-muted"
              >
                {mode === "login" ? "처음이야? 가입하기" : "이미 계정이 있어? 로그인"}
              </button>
              <p className="mt-2 text-[11px] leading-5 text-muted">
                가입하면 <a href="/privacy" target="_blank" className="underline">개인정보 처리방침</a>에 동의하는 거야.
                취향 신호(관심/덜관심·열람)만 모으고, 언제든 탈퇴 시 전부 삭제돼.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
