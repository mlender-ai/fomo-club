"use client";

import { useState } from "react";
import { registerEmail, loginEmail, logout, deleteAccount } from "@/lib/fomoApi";

/**
 * 최소 로그인/가입 시트 — 트랙 B. 이메일+비밀번호. 비로그인 둘러보기는 그대로, 로그인은 "취향 기억"용 선택.
 * ⚠️ 화면·카피·약관 문구는 광혁 직접 영역 — 여기 텍스트/스타일은 임시(기능 우선).
 * 로그인/가입 성공 시 fomoApi 가 토큰 저장 + 익명 취향 연결까지 처리한 뒤 onAuthed() 호출.
 */
export function AuthSheet({
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
    <div className="fixed inset-0 z-[80] flex items-end bg-black/70" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-md rounded-t-2xl border-t border-hairline bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {loggedIn ? (
          // 로그인 상태 — 로그아웃 / 탈퇴(개인정보 삭제)
          <div className="flex flex-col gap-3">
            <p className="font-pixel text-sm text-whiteout">내 계정</p>
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
            <p className="font-pixel text-sm text-whiteout">
              {mode === "login" ? "로그인" : "가입"} · 취향을 기억해줄게
            </p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-hairline bg-black px-3 py-3 text-sm text-whiteout outline-none"
            />
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="비밀번호 (8자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
              className="rounded-lg border border-hairline bg-black px-3 py-3 text-sm text-whiteout outline-none"
            />
            {error && <p className="text-[12px] text-[#ff5a5f]">{error}</p>}
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-[#FF5A36] px-4 py-3 text-sm font-pixel text-white disabled:opacity-50"
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
            <p className="text-[11px] leading-5 text-muted">
              가입하면 <a href="/privacy" target="_blank" className="underline">개인정보 처리방침</a>에 동의하는 거야.
              취향 신호(관심/덜관심·열람)만 모으고, 언제든 탈퇴 시 전부 삭제돼.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
