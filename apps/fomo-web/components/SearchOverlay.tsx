"use client";

import { useEffect, useRef, useState } from "react";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { FlickerSpinner } from "@/components/FlickerSpinner";
import { SearchIcon, XMarkIcon } from "@/components/icons";
import { fetchDaily30, fetchJudgmentHistory, fetchStockFront } from "@/lib/fomoApi";
import { getSessionId } from "@/lib/session";

/**
 * 검색 오버레이 (WO 검색) — 심볼 인덱스 자동완성 + 3분기.
 * ① 오늘 카드 있음 → 표준 뎁스 그대로 ② 인덱스 있음 → 온디맨드 단건 조립(프로브 실패 시 ③)
 * ③ 미존재/실패 → "알림 신청하면 내일 카드로" 큐. 무한 로딩·에러 화면 금지.
 */

const NEON = "#D8FF3A";
const API_BASE = process.env.NEXT_PUBLIC_FOMO_API_BASE?.replace(/\/$/, "") || "https://fomo-club-backend.vercel.app";
const REQUESTS_KEY = "fomo_search_requests";
/** 온디맨드 프로브 타임아웃 — 넘으면 ③ 분기(무한 로딩 금지). */
const PROBE_TIMEOUT_MS = 9_000;

interface SearchResultItem {
  canonical: string;
  englishName?: string;
  symbol: string;
  market: string;
  country: "KR" | "US" | "GLOBAL";
  naverCode?: string;
  sector?: string;
  todayCard: boolean;
}

function marketTag(item: Pick<SearchResultItem, "market" | "country">): string {
  if (item.market === "COIN") return "₿ 코인";
  if (item.country === "US") return `🇺🇸 ${item.market}`;
  return `🇰🇷 ${item.market}`;
}

function savedRequests(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function rememberRequest(query: string): void {
  try {
    const list = [...new Set([query, ...savedRequests()])].slice(0, 20);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(list));
  } catch {
    // 저장 실패는 치명 아님
  }
}

type Branch =
  | { kind: "list" }
  | { kind: "depth"; item: SearchResultItem }
  | { kind: "probing"; item: SearchResultItem }
  | { kind: "request"; query: string; reason: "not-found" | "quote-failed"; sent: boolean };

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [branch, setBranch] = useState<Branch>({ kind: "list" });
  const [popular, setPopular] = useState<Array<{ stock: string; naverCode?: string; symbol?: string }>>([]);
  const [recent, setRecent] = useState<Array<{ stock: string; naverCode?: string; symbol?: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    // 인기 = 오늘 30장 상위(캐시된 daily-30 — 추가 비용 0).
    fetchDaily30()
      .then((d) =>
        setPopular(
          (d.stocks ?? []).slice(0, 6).map((s) => ({
            stock: s.canonical,
            ...(s.naverCode ? { naverCode: s.naverCode } : {}),
            ...(s.symbol ? { symbol: s.symbol } : {}),
          }))
        )
      )
      .catch(() => {});
    fetchJudgmentHistory()
      .then((result) => setRecent(result.items.slice(0, 6).map((item) => ({
        stock: item.stock,
        ...(item.naverCode ? { naverCode: item.naverCode } : {}),
        ...(item.symbol ? { symbol: item.symbol } : {}),
      }))))
      .catch(() => {});
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // 자동완성 — 디바운스 200ms, 캐시된 인덱스 조회라 <1초.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults(null);
      return;
    }
    setSearching(true);
    const seq = (seqRef.current += 1);
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/fomo/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(5_000) })
        .then((res) => res.json())
        .then((data: { results?: SearchResultItem[] }) => {
          if (seqRef.current !== seq) return;
          setResults(data.results ?? []);
          setSearching(false);
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setResults([]);
          setSearching(false);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  /** ②분기 프로브 — 단건 stock-front(캐시됨). 시세도 캔들도 없으면 ③으로(무한 로딩·에러 금지). */
  const openItem = async (item: SearchResultItem) => {
    if (item.todayCard || item.market === "COIN" || item.naverCode) {
      // 오늘 카드·코인(캐시)·KR(네이버 무료)은 조립 신뢰도 높음 — 바로 뎁스.
      setBranch({ kind: "depth", item });
      return;
    }
    setBranch({ kind: "probing", item });
    try {
      const probe = await Promise.race([
        fetchStockFront(item.canonical, { lite: true, ...(item.symbol ? { symbol: item.symbol } : {}) }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT_MS)),
      ]);
      const priced = Boolean(probe?.priceText) || (probe?.sparkline?.length ?? 0) >= 2;
      setBranch(priced ? { kind: "depth", item } : { kind: "request", query: item.canonical, reason: "quote-failed", sent: false });
    } catch {
      setBranch({ kind: "request", query: item.canonical, reason: "quote-failed", sent: false });
    }
  };

  const submitRequest = async (q: string) => {
    rememberRequest(q);
    setBranch((prev) => (prev.kind === "request" ? { ...prev, sent: true } : prev));
    try {
      await fetch(`${API_BASE}/api/fomo/search/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // deviceId = 익명 기기 ID(무로그인 대기함) — 재방문 시 "내 요청"으로 이 기기에서만 노출.
        body: JSON.stringify({ query: q, deviceId: getSessionId() }),
        signal: AbortSignal.timeout(6_000),
      });
    } catch {
      // 저장 실패해도 UI 는 접수 상태 유지 — 다음 방문 시 재시도 여지(무한 대기·에러 화면 금지)
    }
  };

  if (branch.kind === "depth") {
    const item = branch.item;
    return (
      <StockInsightView
        stock={item.canonical}
        context={{
          ...(item.naverCode ? { naverCode: item.naverCode } : {}),
          ...(item.symbol && item.country !== "KR" ? { symbol: item.symbol } : {}),
          market: item.market,
          country: item.country,
          reason: "검색으로 찾은 종목이에요.",
        }}
        onClose={() => setBranch({ kind: "list" })}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-[env(safe-area-inset-bottom)] pt-[calc(1.25rem+env(safe-area-inset-top))]">
        {/* 검색 입력 */}
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-hairline bg-white/[0.04] px-4 py-3">
            <SearchIcon size={16} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setBranch({ kind: "list" });
              }}
              placeholder="종목명·티커로 검색 (예: 메타, META)"
              className="min-w-0 flex-1 bg-transparent text-sm text-whiteout outline-none placeholder:text-muted"
            />
          </div>
          <button type="button" onClick={onClose} aria-label="검색 닫기" className="shrink-0 text-muted">
            <XMarkIcon size={22} />
          </button>
        </div>

        <div className="scrollbar-none mt-4 min-h-0 flex-1 overflow-y-auto pb-10">
          {branch.kind === "probing" && (
            <div className="mt-14 flex flex-col items-center gap-3">
              <FlickerSpinner size={20} />
              <p className="text-sm text-muted">{branch.item.canonical} 데이터를 모으고 있어요…</p>
            </div>
          )}

          {branch.kind === "request" && (
            <div className="mt-10 rounded-2xl border border-hairline bg-surface px-5 py-6 text-center">
              <p className="text-base font-bold text-whiteout">
                {branch.reason === "not-found" ? "아직 준비 안 된 검색어예요" : "지금 실시간 분석이 안 돼요"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                알림 신청하면 <span className="text-whiteout">다음날 카드로 만들어드려요</span>.
                <br />
                이 기기에서 내일 다시 열면 맨 앞에서 기다리고 있을 거예요.
              </p>
              {branch.sent ? (
                <p className="mt-4 font-pixel text-sm" style={{ color: NEON }}>
                  접수됐어요 — 내일 이 기기에서 맨 앞에 보여드릴게요
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => submitRequest(branch.query)}
                  className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-black"
                  style={{ backgroundColor: NEON }}
                >
                  알림 신청
                </button>
              )}
            </div>
          )}

          {branch.kind === "list" && results !== null && (
            <>
              {results.map((item) => (
                <button
                  key={`${item.symbol}:${item.canonical}`}
                  type="button"
                  onClick={() => void openItem(item)}
                  className="flex w-full items-center justify-between gap-3 border-b border-hairline-soft px-1 py-3.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-whiteout">
                      {item.canonical}
                      {item.englishName && <span className="ml-1.5 font-normal text-muted">{item.englishName}</span>}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {marketTag(item)} · {item.symbol}
                    </span>
                  </span>
                  {item.todayCard && (
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-black" style={{ backgroundColor: NEON }}>
                      오늘의 30장
                    </span>
                  )}
                </button>
              ))}
              {results.length === 0 && !searching && (
                <div className="mt-10 text-center">
                  <p className="text-sm text-muted">
                    &ldquo;{query.trim()}&rdquo; 결과를 찾지 못했어요.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBranch({ kind: "request", query: query.trim(), reason: "not-found", sent: false })}
                    className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm text-whiteout"
                  >
                    알림 신청하면 내일 카드로 만들어드려요
                  </button>
                </div>
              )}
            </>
          )}

          {branch.kind === "list" && results === null && (
            <>
              {popular.length > 0 && (
                <section className="mt-2">
                  <p className="font-pixel text-[11px] uppercase tracking-wide text-muted">오늘의 30장에서</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {popular.map((p) => (
                      <button
                        key={p.stock}
                        type="button"
                        onClick={() => setQuery(p.stock)}
                        className="rounded-full border border-hairline px-3 py-1.5 text-sm text-whiteout"
                      >
                        {p.stock}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {recent.length > 0 && (
                <section className="mt-6">
                  <p className="font-pixel text-[11px] uppercase tracking-wide text-muted">최근 본 종목</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recent.map((r) => (
                      <button
                        key={r.stock}
                        type="button"
                        onClick={() => setQuery(r.stock)}
                        className="rounded-full border border-hairline px-3 py-1.5 text-sm text-muted"
                      >
                        {r.stock}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
