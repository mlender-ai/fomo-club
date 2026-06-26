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
      setError(e instanceof Error ? e.message : "문제가 생겼어요. 다시 시도해주세요.");
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
              <p className="text-sm leading-6 text-muted">로그인 상태예요. 취향이 계정에 기억되고 있어요.</p>
              <button
                onClick={async () => {
                  try {
                    await logout();
                    onClose();
                    window.location.reload();
                  } catch {
                    setError("로그아웃 처리에 실패했어요.");
                  }
                }}
                className="rounded-lg border border-hairline px-4 py-3 text-sm text-whiteout"
              >
                로그아웃
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm("정말 탈퇴할까요? 쌓인 취향 데이터도 함께 삭제돼요.")) return;
                  try {
                    await deleteAccount();
                    onClose();
                    window.location.reload();
                  } catch {
                    setError("탈퇴 처리에 실패했어요.");
                  }
                }}
                className="rounded-lg px-4 py-3 text-sm text-muted"
              >
                탈퇴(데이터 삭제)
              </button>
              {error && <p className="text-[12px] text-[#ff5a5f]">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* 브랜드 헤드라인 */}
              <div className="mb-2">
                <p className="font-pixel text-xs font-bold tracking-widest text-neon">FOMO CLUB</p>
                <h1 className="mt-3 text-[2.25rem] font-bold leading-tight text-whiteout">
                  당신을 위한<br />
                  <span className="text-neon">취향투자</span> 클럽
                </h1>
                <p className="mt-3 text-[13px] leading-5 text-muted">
                  멈춰 보게 되는 종목이 당신의 기준이다.
                </p>
              </div>

              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-hairline bg-surface px-3 py-3 text-sm text-whiteout outline-none focus:border-whiteout/30"
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
                className="rounded-full bg-neon px-4 py-3 text-sm font-bold text-black disabled:opacity-50"
              >
                {busy ? "처리 중…" : mode === "login" ? "발견 이어가기" : "취향 기록 시작하기"}
              </button>
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
                className="text-[12px] text-muted"
              >
                {mode === "login" ? "처음이세요? 가입하기" : "이미 계정이 있으세요? 로그인"}
              </button>
              <p className="text-[11px] leading-5 text-muted">
                가입하면 <a href="/privacy" target="_blank" className="underline">개인정보 처리방침</a>에 동의하는 거예요.
                취향 신호(관심/덜관심·열람)만 모으고, 언제든 탈퇴 시 전부 삭제돼요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
