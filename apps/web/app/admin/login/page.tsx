"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState<number | null>(null); // retryAfterSeconds

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "same-origin",
      });

      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        code?: string;
        retryAfterSeconds?: number;
      };

      if (res.status === 429) {
        setRateLimited(data.retryAfterSeconds ?? 900);
        setError(`로그인 시도 횟수를 초과했습니다. ${Math.ceil((data.retryAfterSeconds ?? 900) / 60)}분 후 다시 시도하세요.`);
        return;
      }

      if (!res.ok) {
        setError("비밀번호가 올바르지 않습니다.");
        setPassword("");
        return;
      }

      router.replace("/admin");
    } catch {
      setError("서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.shell}>
      <section style={styles.card}>
        <div style={styles.logoRow}>
          <span style={styles.logoIcon}>🔮</span>
          <span style={styles.logoText}>Trading Taro</span>
        </div>
        <h1 style={styles.heading}>Admin</h1>
        <p style={styles.sub}>관리자 전용 대시보드입니다.</p>

        <form onSubmit={handleSubmit} style={styles.form} autoComplete="off">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            disabled={loading || rateLimited !== null}
            autoFocus
            style={styles.input}
          />
          <button
            type="submit"
            disabled={loading || rateLimited !== null || !password}
            style={{
              ...styles.button,
              opacity: loading || rateLimited !== null || !password ? 0.5 : 1,
            }}
          >
            {loading ? "확인 중..." : "로그인"}
          </button>
        </form>

        {error && (
          <p style={styles.errorText} role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f1117",
  },
  card: {
    background: "#1a1d27",
    border: "1px solid #2a2d3a",
    borderRadius: 12,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 380,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  logoIcon: { fontSize: 22 },
  logoText: { fontSize: 14, color: "#8b8fa8", fontWeight: 600 },
  heading: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: "#f4f5f7",
  },
  sub: {
    margin: 0,
    fontSize: 13,
    color: "#6b7280",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 8,
  },
  input: {
    background: "#0f1117",
    border: "1px solid #2a2d3a",
    borderRadius: 8,
    color: "#f4f5f7",
    fontSize: 15,
    padding: "10px 14px",
    outline: "none",
  },
  button: {
    background: "#3ecf8e",
    border: "none",
    borderRadius: 8,
    color: "#0f1117",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 600,
    padding: "11px 14px",
    transition: "opacity 0.15s",
  },
  errorText: {
    margin: 0,
    fontSize: 13,
    color: "#f87171",
    textAlign: "center",
  },
};
