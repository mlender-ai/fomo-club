import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function login(formData: FormData) {
  "use server";

  const password = String(formData.get("password") ?? "");

  if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
    redirect("/login?error=1");
  }

  cookies().set("dashboard_session", password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  redirect("/");
}

export default function LoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">Personal dashboard</p>
        <h1>Paper trading access</h1>
        <p>개인용 봇 대시보드입니다. 비밀번호로만 보호합니다.</p>
        <form action={login as unknown as string} className="login-form">
          <input name="password" type="password" placeholder="Dashboard password" required />
          <button type="submit">Enter dashboard</button>
        </form>
        {searchParams?.error ? <p className="error-text">비밀번호가 올바르지 않습니다.</p> : null}
      </section>
    </main>
  );
}

