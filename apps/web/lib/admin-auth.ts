import { redirect } from "next/navigation";
import { getAdminSession } from "./admin-jwt";

// Server Component용 인증 확인 — 실패 시 로그인으로 리다이렉트
export async function requireAdmin(): Promise<void> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
}
