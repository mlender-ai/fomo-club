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
import { useEffect, useRef, useState } from "react";

import type { TrackDot } from "../../lib/lab/watch";

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
  const { sync, collect, tracks, unreachable } = useSync();

  // 헤더 점은 **더 나쁜 쪽**을 따른다. FCE 는 살아 있는데 시세가 끊겼으면 끊김이다.
  const feedBroken = (collect?.staleSymbols.length ?? 0) > 0;
  const level = unreachable ? "broken" : feedBroken ? "broken" : (sync?.level ?? "loading");
  const label = unreachable
    ? "랩 서버에 닿지 못함"
    : sync
      ? `${sync.label}${feedBroken ? " · 시세 끊김" : ""}`
      : "동기화 확인 중";
  // 마우스를 올리면 무엇이 실패 중인지 보인다. 헤더 한 줄에 다 넣으면 폰에서 넘친다.
  const detail = [
    sync?.lastError ? `FCE 마지막 실패: ${sync.lastError.error.slice(0, 120)}` : null,
    feedBroken ? `시세 끊김: ${collect?.staleSymbols.join(", ")}` : null,
    ...(collect?.failing ?? []).map((f) => `${f.job} 실패: ${(f.error ?? "").slice(0, 80)}`),
  ]
    .filter(Boolean)
    .join("\n");

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

        {/* 검색 ⌘K (UI-10 B) — 창은 레이아웃의 `CommandPalette`. 폰은 이 단추. */}
        <button
          type="button"
          className="sh-search"
          onClick={() => window.dispatchEvent(new Event("lab:search"))}
          aria-label="검색 (⌘K)"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sh-search-key">⌘K</span>
        </button>

        {tracks && !unreachable ? (
          <TrackDots tracks={tracks} level={level} label={label} detail={detail} />
        ) : (
          <p className={`sh-sync is-${level}`} role="status" title={detail || undefined}>
            <span className="sh-sync-dot" aria-hidden />
            <span className="sh-sync-label">{label}</span>
          </p>
        )}
      </div>
    </header>
  );
}

const DOT_WORD: Record<TrackDot["level"], string> = { live: "운용중", off: "장외", lagging: "지연", stopped: "멈춤" };

function kstTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(5, 16).replace("T", " ");
}

/**
 * 트랙별 점 (OPS-03 E) — `● ● ● ●` 크립토 · 고래 · KR · US. 초록 운용중 · 회색 장외 · 주황 지연 · 빨강 멈춤.
 * 누르면 트랙별 마지막 틱. 폴리마켓은 뺀다(지역 차단 — 늘 제외다).
 */
function TrackDots({ tracks, level, label, detail }: { tracks: TrackDot[]; level: string; label: string; detail: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const summary = tracks.map((t) => `${t.label} ${DOT_WORD[t.level]}`).join(" · ");
  return (
    <div className="sh-sync-wrap" ref={box}>
      <button
        type="button"
        className={`sh-sync is-${level}`}
        aria-expanded={open}
        aria-label={`${label} — ${summary}`}
        title={detail || undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sh-dots" aria-hidden>
          {tracks.map((t) => (
            <span key={t.key} className={`sh-dot is-${t.level}`} />
          ))}
        </span>
        <span className="sh-sync-label">{label}</span>
      </button>
      {open ? (
        <div className="sh-dots-pop" role="dialog" aria-label="트랙별 상태">
          <ul>
            {tracks.map((t) => (
              <li key={t.key}>
                <span className={`sh-dot is-${t.level}`} aria-hidden />
                <span className="sh-dots-name">{t.label}</span>
                <span className="sh-dots-note">{t.note}</span>
                <span className="sh-dots-at">{kstTime(t.lastAt)}</span>
              </li>
            ))}
          </ul>
          <p className="sh-dots-foot">마지막 틱 · KST</p>
        </div>
      ) : null}
    </div>
  );
}
