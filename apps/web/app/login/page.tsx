import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PasswordInput from "./PasswordInput";


async function login(formData: FormData) {
  "use server";

  const password = String(formData.get("password") ?? "");

  if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
    redirect("/login?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set("dashboard_session", password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  redirect("/admin");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">Personal dashboard</p>
        <h1>Paper trading access</h1>
        <p>개인용 봇 대시보드입니다. 비밀번호로만 보호합니다.</p>
        <form action={login as unknown as string} className="login-form">
          <PasswordInput />
          <button type="submit">Enter dashboard</button>
        </form>
        {query?.error ? <p className="error-text">비밀번호가 올바르지 않습니다.</p> : null}
      </section>
    </main>
  );
}
