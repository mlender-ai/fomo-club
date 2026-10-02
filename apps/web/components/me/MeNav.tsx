"use client";

/** `/me` 안의 작은 내비 — 비교 · 매매법 · 나가기. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const ITEMS = [
  { href: "/me/compare", label: "비교" },
  { href: "/me/rules", label: "매매법" },
];

export function MeNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  async function logout() {
    await fetch("/api/me/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }
  return (
    <nav className="me-nav" aria-label="나">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={`me-nav-item${pathname.startsWith(i.href) ? " is-on" : ""}`} aria-current={pathname.startsWith(i.href) ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
      <button type="button" className="me-nav-out" onClick={logout}>
        나가기
      </button>
    </nav>
  );
}
