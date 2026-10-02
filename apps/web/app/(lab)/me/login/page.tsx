"use client";

/** `/me/login` — 비밀번호 하나. 5회 틀리면 15분 잠금(서버가 센다). */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const res = await fetch("/api/me/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string; left?: number; until?: number };
    setBusy(false);
    if (res.ok) {
      const next = params.get("next");
      router.replace(next && next.startsWith("/me/") ? next : "/me/compare");
      router.refresh();
      return;
    }
    if (body.error === "locked") setMessage(`잠겼다 — ${new Date(body.until ?? 0).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 까지`);
    else if (body.error === "wrong_password") setMessage(body.left ? `틀렸다 · ${body.left}번 남음` : "틀렸다 · 15분 잠금");
    else if (body.error === "not_configured") setMessage("비밀번호가 설정되지 않았다(ME_PASSWORD)");
    else setMessage("지금은 들어갈 수 없다");
  }

  return (
    <form className="me-login" onSubmit={submit}>
      <h1 className="sh-title">나</h1>
      <input name="password" type="password" autoComplete="current-password" placeholder="비밀번호" required aria-label="비밀번호" />
      <button type="submit" disabled={busy}>
        {busy ? "확인 중" : "들어가기"}
      </button>
      {message ? (
        <p className="me-login-msg" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export default function MeLogin() {
  return (
    <div className="sh-page">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
