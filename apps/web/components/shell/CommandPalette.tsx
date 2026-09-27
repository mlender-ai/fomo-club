"use client";

/**
 * 검색 ⌘K (UI-10 PART B — FCE 에 있는 기능). 심볼 · 전략 · 포지션 · 거래 · 연구 · 지갑 · 화면.
 *
 * 열 때 한 번 조립본 다섯을 읽는다(전략 · 포지션 · 연구 · 복기 · 고래) — 새 API 를 만들지 않는다. 한 번 읽은 것은
 * 창을 닫아도 들고 있다. 키보드 — ⌘K / Ctrl+K 로 열고 · ↑↓ 로 고르고 · Enter 로 가고 · Esc 로 닫는다.
 * 폰은 헤더의 돋보기를 누른다.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TABS } from "./Header";

export interface SearchItem {
  kind: "화면" | "전략" | "포지션" | "거래" | "연구" | "지갑";
  label: string;
  sub: string;
  href: string;
  /** 매칭에 쓰는 글자(라벨 · 부제 밖의 것 — 트랙 키 · 심볼 약자 등). */
  keys?: string;
}

type Env<T> = { data?: T };

/** 조립본 다섯 → 검색 항목. 순수 함수(테스트가 쓴다). */
export function searchItems(src: {
  strategies?: { rows: { key: string; label: string; leverage: number | null }[] } | null;
  positions?: { positions: { id: string; symbol: string; direction: string; leverage: number | null }[] } | null;
  research?: { items: { no: string; title: string }[] } | null;
  journal?: { rows: { id: string; symbol: string; direction: string; exitAt: string | null; trackLabel: string }[] } | null;
  whales?: { board: { wallets: { key: string; short: string; label: string }[] } | null } | null;
}): SearchItem[] {
  const side = (d: string) => (d === "short" || d === "SHORT" ? "숏" : "롱");
  const items: SearchItem[] = TABS.map((t) => ({ kind: "화면" as const, label: t.label, sub: t.href, href: t.href }));
  for (const r of src.strategies?.rows ?? []) {
    items.push({ kind: "전략", label: r.label, sub: r.leverage ? `${r.leverage}배` : "전략 상세", href: `/strategies/${r.key}`, keys: r.key });
  }
  for (const p of src.positions?.positions ?? []) {
    items.push({ kind: "포지션", label: p.symbol, sub: `보유 · ${side(p.direction)}${p.leverage ? ` · ${p.leverage}배` : ""}`, href: `/positions/${p.id}` });
  }
  for (const r of src.research?.items ?? []) {
    items.push({ kind: "연구", label: `${r.no} ${r.title}`, sub: "연구 노트", href: `/research/${r.no}` });
  }
  for (const w of src.whales?.board?.wallets ?? []) {
    items.push({ kind: "지갑", label: w.short, sub: w.label, href: `/whales/${w.key}` });
  }
  for (const t of src.journal?.rows ?? []) {
    items.push({
      kind: "거래",
      label: t.symbol,
      sub: `${t.trackLabel} · ${side(t.direction)} · ${t.exitAt ? t.exitAt.slice(5, 10) : "—"} 청산`,
      href: `/journal/${t.id}`,
    });
  }
  return items;
}

/** 검색어 → 항목. 빈 칸으로 나눈 낱말이 **전부** 들어 있어야 한다(`eth 고래` → 고래 추종의 ETH 거래). */
export function searchFilter(items: SearchItem[], query: string, limit = 30): SearchItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items.filter((i) => i.kind !== "거래").slice(0, limit);
  const hay = (i: SearchItem) => `${i.kind} ${i.label} ${i.sub} ${i.keys ?? ""}`.toLowerCase();
  return items.filter((i) => words.every((w) => hay(i).includes(w))).slice(0, limit);
}

const SOURCES = ["strategies", "positions", "research", "journal", "whales"] as const;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lab:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lab:search", onOpen);
    };
  }, []);

  // 열 때만 비운다. **자료 도착과 묶지 않는다** — 묶었더니 정규 도메인에서 자료가 오는 순간 쳐 둔 글자가 지워지고
  // Enter 가 첫 항목(Overview)으로 갔다(UI-10 점검에서 발견).
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || items) return;
    let alive = true;
    void Promise.all(
      SOURCES.map((k) =>
        fetch(`/api/lab/${k}`, { cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<Env<unknown>>) : { data: null }))
          .then((b) => b.data ?? null)
          .catch(() => null)
      )
    ).then(([strategies, positions, research, journal, whales]) => {
      if (alive) setItems(searchItems({ strategies, positions, research, journal, whales } as Parameters<typeof searchItems>[0]));
    });
    return () => {
      alive = false;
    };
  }, [open, items]);

  const shown = useMemo(() => searchFilter(items ?? searchItems({}), query), [items, query]);
  const go = useCallback(
    (item: SearchItem | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router]
  );

  if (!open) return null;
  return (
    <div className="sh-cmd" role="presentation" onMouseDown={() => setOpen(false)}>
      <div
        className="sh-cmd-box"
        role="dialog"
        aria-modal="true"
        aria-label="검색"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          className="sh-cmd-input"
          placeholder="심볼 · 전략 · 연구 · 지갑 검색"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(shown.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter") go(shown[cursor]);
          }}
          aria-controls="sh-cmd-list"
        />
        <ul className="sh-cmd-list" id="sh-cmd-list" role="listbox">
          {items === null ? <li className="sh-cmd-empty">불러오는 중…</li> : null}
          {items !== null && shown.length === 0 ? <li className="sh-cmd-empty">찾는 것이 없어요.</li> : null}
          {shown.map((item, i) => (
            <li
              key={`${item.href}-${i}`}
              role="option"
              aria-selected={i === cursor}
              className={`sh-cmd-item${i === cursor ? " is-on" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                go(item);
              }}
            >
              <span className="sh-cmd-kind">{item.kind}</span>
              <span className="sh-cmd-label">{item.label}</span>
              <span className="sh-cmd-sub">{item.sub}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
