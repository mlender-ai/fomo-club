import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export function requireAdmin() {
  const session = cookies().get("dashboard_session");
  if (!session || session.value !== process.env.DASHBOARD_PASSWORD) {
    redirect("/login");
  }
}
