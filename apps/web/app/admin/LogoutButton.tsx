"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/admin/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      router.replace("/admin/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="admin-nav-link"
      style={{ background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}
    >
      {loading ? "..." : "← 로그아웃"}
    </button>
  );
}
