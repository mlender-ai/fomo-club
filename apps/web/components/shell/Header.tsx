"use client";

/**
 * 상단 헤더 (UI-03 PART C).
 *
 * ```
 * [■ FOMO LAB]   Overview  전략  포지션  고래  연구  복기        ● 실시간 · 2분 전
 * ```
 *
 * ## 탭은 진짜 링크다
 *
 * `next/link` 라 `<a href>` 로 나간다. 새 탭 열기·주소 복사·키보드 이동이 다 된다.
 * 선택된 탭은 `aria-current="page"` 를 단다 — 색만 바꾸면 스크린 리더는 모른다.
 *
 * 탭이 "안 눌리던" 것은 링크 문제가 아니었다. 눌렸는데 화면이 4~12.8초 동안 안
 * 바뀌었다(`docs/ui/SHELL.md` §1). 그건 화면 쪽에서 고쳤다.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSync } from "./SyncProvider";

export const TABS = [
  { href: "/", label: "Overview" },
  { href: "/strategies", label: "전략" },
  { href: "/positions", label: "포지션" },
  { href: "/whales", label: "고래" },
  { href: "/research", label: "연구" },
  { href: "/journal", label: "복기" },
] as const;

/** `/` 는 정확히 같을 때만, 나머지는 하위 경로까지(`/research/04` → 연구). */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const pathname = usePathname() ?? "/";
  const { sync, unreachable } = useSync();

  const level = unreachable ? "broken" : (sync?.level ?? "loading");
  const label = unreachable
    ? "랩 서버에 닿지 못함"
    : sync
      ? sync.label
      : "동기화 확인 중";

  return (
    <header className="sh-header">
      <div className="sh-header-inner">
        <Link href="/" className="sh-brand" aria-label="FOMO LAB — Overview">
          <span className="sh-brand-mark" aria-hidden />
          FOMO LAB
        </Link>

        <nav className="sh-tabs" aria-label="주요 화면">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`sh-tab${active ? " is-on" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <p className={`sh-sync is-${level}`} role="status" title={sync?.lastError?.error ?? undefined}>
          <span className="sh-sync-dot" aria-hidden />
          <span className="sh-sync-label">{label}</span>
        </p>
      </div>
    </header>
  );
}
