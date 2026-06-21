"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildCardFrontHook, signalsFromBasics } from "@fomo/core";
import type { KeywordCard, SectorStock, StockSector, CardFrontHook, CardFrontSignals } from "@fomo/core";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { fetchSectorStocks, fetchKeywords, fetchStockBasics, recordTaste } from "@/lib/fomoApi";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";

/**
 * 섹터 종목 무한 스와이프 덱 — SECTOR_STRUCTURE_HANDOFF §1·§4 (Stage ③·④ 구조 배선).
 *
 * 섹터 칩을 고르면: 그 섹터의 종목 풀(/api/fomo/sector-stocks?baseline=1 → 빈 카드 방지)을
 * 무한히(풀만큼 순환) 스와이프한다. 오른쪽=관심/왼쪽=덜관심 → recordTaste("stock", …) 적재(트랙 B).
 * 탭 → 종목 뎁스(StockInsightView: baseline+이해 레이어를 *도달 시* lazy 로드 = 비용 방어).
 *
 * ④ 발굴 결합: 그날 그 섹터에서 발굴된 숨은 수혜주(keywords API 의 surpriseStock)를 풀에 섞고,
 *   "왜 이 종목"(grounded 근거)을 카드에 유지(#560). 대장주만 나오면 발굴 가치 0 → 발굴주를 노출 우선.
 *
 * 비주얼(카드 디자인·국기/시장 라벨·요약 리치 등)은 광혁 — 여기선 구조/동작만(§4).
 * 정렬은 @fomo/core sortStocksForFeed(콜드스타트 기본) — 개인화는 다음 트랙이 seam 에 끼움.
 */
const THRESHOLD = 90;
const EXIT_MS = 320;
const UP = "#FF5A36";
const DOWN = "#64748B";

/** 덱 카드 — 섹터 풀 종목 + 발굴 근거(있으면 "주목 종목"으로 노출). */
type DeckStock = SectorStock & { reason?: string };

/**
 * 섹터 풀 + 그날 발굴 종목 병합(④). 발굴 근거(reason)를 풀 종목에 붙이고, 풀에 없던 발굴주는 추가.
 * 노출 순서: 대표 대장주 먼저 → 발굴(근거 있는) 종목 → 나머지(결정적 — 캐시·새로고침 안정).
 */
function mergeDiscovered(
  pool: readonly SectorStock[],
  cards: readonly KeywordCard[],
  sector: StockSector
): DeckStock[] {
  const reasons = new Map<string, string>();
  for (const c of cards) {
    if (c.keyword !== sector) continue;
    const s = c.surpriseStock;
    if (s?.reason) reasons.set(s.canonical, s.reason);
  }
  const have = new Set(pool.map((s) => s.canonical));
  const out: DeckStock[] = pool.map((s) => {
    const r = reasons.get(s.canonical);
    return r ? { ...s, reason: r } : s;
  });
  // 풀(국내 baseline)에 없던 발굴주(예: 글로벌)도 추가 — 뎁스(StockInsightView)가 근거를 채운다.
  for (const c of cards) {
    if (c.keyword !== sector) continue;
    const s = c.surpriseStock;
    if (!s?.reason || have.has(s.canonical)) continue;
    have.add(s.canonical);
    out.push({ canonical: s.canonical, market: s.market, country: s.country, marquee: false, sector, reason: s.reason });
  }
  out.sort(
    (a, b) =>
      Number(b.marquee) - Number(a.marquee) ||
      Number(!!b.reason) - Number(!!a.reason) || // 발굴(근거 있는) 우선 노출
      a.canonical.localeCompare(b.canonical)
  );
  return out;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

const MARKET_LABEL: Record<string, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  NASDAQ: "나스닥",
  NYSE: "NYSE",
  COIN: "코인",
};

/**
 * 종목 카드 앞면 — 이름 + 시장 라벨 + 그날 가장 센 객관 신호 후킹(PHASE0 §4).
 * 2행 헤드라인(가격>거래량>수급>뉴스>잠잠) · 3행 쉬운 번역 · 4행 균형(있으면). 점수·판정 없이 사실만.
 * 비주얼 디테일(국기·리치 등)은 광혁 — 여기선 구조/문구만.
 */
/** 강도별 헤드라인 색 — 강도 비례 톤(§3). high=코랄, medium=주황, calm=그레이. */
const INTENSITY_COLOR: Record<string, string> = { high: UP, medium: "#F59E0B", calm: "#94A3B8" };

/** 로고 폴백 — 종목명 첫 글자 원형(외부 이미지는 후속, 게이트). */
function InitialBadge({ name }: { name: string }) {
  const ch = name.trim().slice(0, 1) || "·";
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
      style={{ backgroundColor: "rgba(255,90,54,0.18)", color: UP }}
      aria-hidden
    >
      {ch}
    </span>
  );
}

/**
 * 종목 카드 앞면 — FOMO 후킹 구조(rev2 §4): 정체성 / 테마태그 / 후킹 / 다가오는 재료 / baseline.
 * 강도에 비례한 톤(§3) — 핫한 종목은 세게, 조용한 종목은 차분하게. 점수·판정·예측 없음.
 * 로고 이미지·미니차트·시총순위는 후속(배포 복구 후 서버 페치) — 지금은 이니셜/태그/텍스트 골격.
 */
function StockCardFace({
  stock,
  hook,
  changePct,
  progress,
}: {
  stock: DeckStock;
  hook: CardFrontHook;
  changePct?: number | undefined;
  progress?: string | undefined;
}) {
  const color = INTENSITY_COLOR[hook.intensity] ?? "#94A3B8";
  // 6행 baseline(위생) — 헤드라인이 이미 등락을 말하는 가격/quiet 앵글은 생략(중복 방지).
  const showBaseline = ["named", "dday", "big", "surprise"].includes(hook.angle) && typeof changePct === "number";
  const baseline = showBaseline
    ? `오늘 ${changePct! > 0 ? "+" : changePct! < 0 ? "-" : ""}${Math.abs(changePct!).toFixed(1)}%`
    : undefined;
  return (
    <div className="flex h-full flex-col">
      {/* 1행 — 정체성: 로고(이니셜) + 종목명 + 시장 */}
      <div className="flex items-center gap-2.5">
        <InitialBadge name={stock.canonical} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-2xl font-bold text-whiteout">{stock.canonical}</span>
            {stock.marquee && <span className="text-base" aria-hidden>⭐</span>}
          </div>
          <span className="font-pixel text-xs text-muted">{MARKET_LABEL[stock.market] ?? stock.market}</span>
        </div>
      </div>

      {/* 2행 — 테마 태그 */}
      {hook.themeLabel && (
        <span
          className="mt-4 inline-flex w-fit items-center rounded-full px-2.5 py-1 font-pixel text-xs"
          style={{ backgroundColor: "rgba(255,90,54,0.12)", color: UP }}
        >
          # {hook.themeLabel}
        </span>
      )}

      {/* 3행 — FOMO 후킹(강도 비례 톤) */}
      <p className="mt-4 text-xl font-bold leading-8" style={{ color }}>
        {hook.headline}
      </p>

      {/* 5행 — 다가오는 재료(구체·일정) */}
      {hook.catalysts.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {hook.catalysts.map((c, i) => (
            <li key={i} className="flex gap-2 text-sm leading-6 text-whiteout">
              <span aria-hidden style={{ color: UP }}>•</span>
              <span>
                {c.when && <span className="font-pixel text-muted">{c.when} · </span>}
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-6">
        {/* 6행 — baseline(위생 요소, 후킹 아님) */}
        {baseline && <p className="font-pixel text-[11px] text-muted">{baseline}</p>}
        <div className="mt-2 flex items-center justify-between">
          <span className="font-pixel text-[11px] text-muted">더보기 →</span>
          {progress && <span className="font-pixel text-[11px] text-muted">{progress}</span>}
        </div>
      </div>
    </div>
  );
}

/** 오늘(KST) "M/D" — 후킹 헤드라인 시점 라벨(§4 시점 명시). */
function kstTodayLabel(): string {
  try {
    const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return `${kst.getMonth() + 1}/${kst.getDate()}`;
  } catch {
    return "";
  }
}

interface SectorDeckProps {
  sector: StockSector;
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

export function SectorStockDeck({ sector, loggedIn, onRequireLogin }: SectorDeckProps) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ready"; stocks: DeckStock[] }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    // 풀(baseline 보장 — 빈 카드 방지) + 그날 발굴주(keywords) 병렬. 발굴 실패해도 풀로 진행.
    Promise.all([
      fetchSectorStocks(sector, true),
      fetchKeywords().catch(() => null), // 발굴은 보강 — 실패 무시
    ])
      .then(([poolRes, kwRes]) => {
        if (!alive) return;
        if (!poolRes.stocks?.length) {
          setState({ kind: "error" });
          return;
        }
        const stocks = mergeDiscovered(poolRes.stocks, kwRes?.cards ?? [], sector);
        setState({ kind: "ready", stocks });
      })
      .catch((err) => {
        console.warn("[SectorStockDeck] fetch failed", err);
        if (alive) setState({ kind: "error" });
      });
    return () => {
      alive = false;
    };
  }, [sector]);

  if (state.kind === "loading")
    return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;
  if (state.kind === "error")
    return (
      <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout">
        이 섹터는 지금 보여줄 종목이 잠깐 비었어요.
        <br />
        다른 섹터를 둘러봐 주세요.
      </div>
    );
  return <SectorDeckInner stocks={state.stocks} loggedIn={loggedIn} onRequireLogin={onRequireLogin} />;
}

function SectorDeckInner({
  stocks,
  loggedIn,
  onRequireLogin,
}: { stocks: DeckStock[] } & Omit<SectorDeckProps, "sector">) {
  // 무한: 풀을 순환(modulo)해 끝나지 않는다(§7 "무한히 풀만큼").
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [selected, setSelected] = useState<DeckStock | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  // 앞면 후킹 신호 — 도달하는 카드의 baseline(가격·52주 등)을 lazy 로 불러 규칙기반 후킹(비용 방어 §5).
  // 국내(naverCode) 종목만 가격 도출 — 없으면 발굴 근거/잠잠으로. 캐시(canonical 키)로 재방문 즉시.
  const [signals, setSignals] = useState<Record<string, CardFrontSignals>>({});
  const inflight = useRef<Set<string>>(new Set());
  const asOf = useRef<string>(kstTodayLabel()).current;

  const at = (i: number) => stocks[((i % stocks.length) + stocks.length) % stocks.length]!;

  const ensureSignals = useCallback(
    (stock: DeckStock) => {
      const key = stock.canonical;
      if (!stock.naverCode || signals[key] || inflight.current.has(key)) return;
      inflight.current.add(key);
      fetchStockBasics(key)
        .then((b) => setSignals((prev) => ({ ...prev, [key]: signalsFromBasics(b) })))
        .catch((err) => console.warn("[SectorStockDeck] basics signal failed", key, err))
        .finally(() => inflight.current.delete(key));
    },
    [signals]
  );

  // 종목별 신호 조립 — basics(가격·52주) + 테마 태그(섹터) + 발굴 근거(named catalyst).
  // 라이브 수급 streak·거래량·시총순위·일정은 후속(서버 페치, 배포 복구 후) — 엔진은 채워지면 자동 반영.
  const signalsFor = (stock: DeckStock): CardFrontSignals => {
    const sig: CardFrontSignals = { ...(signals[stock.canonical] ?? {}), asOf, themeLabel: stock.sector };
    if (stock.reason) sig.catalysts = [{ label: stock.reason, kind: "news" }];
    return sig;
  };
  const hookFor = (stock: DeckStock): CardFrontHook => buildCardFrontHook(signalsFor(stock));
  const pctOf = (stock: DeckStock): number | undefined => signals[stock.canonical]?.changePct;

  const flingNext = useCallback((dir: "left" | "right") => {
    if (prefersReducedMotion()) {
      setDx(0);
      setIdx((i) => i + 1);
      return;
    }
    setExiting(dir);
    window.setTimeout(() => {
      setExiting(null);
      setDx(0);
      setIdx((i) => i + 1);
    }, EXIT_MS);
  }, []);

  const advance = useCallback(
    (dir: "left" | "right") => {
      recordTaste("stock", at(idx).canonical, dir === "right" ? "more" : "less"); // 트랙 B 적재
      flingNext(dir);
    },
    [idx, stocks, flingNext]
  );

  const openDepth = (stock: DeckStock) => {
    if (!loggedIn && onRequireLogin) {
      onRequireLogin();
      return;
    }
    recordTaste("stock", stock.canonical, "view_depth"); // 강한 관심
    setSelected(stock);
  };
  const closeDepth = () => {
    setSelected(null);
    window.setTimeout(() => flingNext("left"), 40);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = e.clientX - startX.current;
    if (Math.abs(d) > 6) moved.current = true;
    setDx(d);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dx > THRESHOLD) advance("right");
    else if (dx < -THRESHOLD) advance("left");
    else setDx(0);
  };

  // 보이는 카드(+다음 1장)의 신호를 미리 채운다 — 도달 종목만(비용 방어).
  useEffect(() => {
    ensureSignals(at(idx));
    ensureSignals(at(idx + 1));
  }, [idx, ensureSignals]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = at(idx);
  const topTransform = exiting
    ? `translateX(${exiting === "right" ? 140 : -140}%) rotate(${exiting === "right" ? 16 : -16}deg)`
    : `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
  const topTransition = dragging.current ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.22,1,0.36,1)`;
  const behind = [at(idx + 1), at(idx + 2)];

  return (
    <div className="w-full">
      <div className="relative mx-auto h-[56vh] w-full select-none">
        {behind
          .map((stock, i) => ({ stock, i }))
          .reverse()
          .map(({ stock, i }) => (
            <div
              key={`b-${i}-${stock.canonical}`}
              aria-hidden
              className="absolute inset-0 overflow-hidden rounded-2xl border border-hairline bg-surface px-6 py-7"
              style={{
                borderLeft: `2px solid ${UP}`,
                transform: `translateY(${(i + 1) * 12}px) scale(${1 - (i + 1) * 0.04})`,
                opacity: 1 - (i + 1) * 0.18,
                zIndex: 1,
              }}
            >
              <StockCardFace stock={stock} hook={hookFor(stock)} changePct={pctOf(stock)} />
            </div>
          ))}

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (!moved.current && !exiting) openDepth(top);
          }}
          className="absolute inset-0 z-10 cursor-pointer overflow-hidden rounded-2xl border border-hairline bg-surface px-6 py-7"
          style={{ borderLeft: `2px solid ${UP}`, transform: topTransform, transition: topTransition }}
        >
          <span
            className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 font-pixel text-sm"
            style={{ color: UP, borderColor: UP, opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}
          >
            관심 →
          </span>
          <span
            className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 font-pixel text-sm"
            style={{ color: DOWN, borderColor: DOWN, opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}
          >
            ← 덜 관심
          </span>
          <StockCardFace stock={top} hook={hookFor(top)} changePct={pctOf(top)} progress={`${(idx % stocks.length) + 1} / ${stocks.length}`} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={() => advance("left")}
          disabled={!!exiting}
          aria-label="덜 관심"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-hairline bg-surface text-xl text-muted transition-colors hover:text-whiteout disabled:opacity-40"
        >
          ✕
        </button>
        <button
          onClick={() => openDepth(top)}
          disabled={!!exiting}
          aria-label="관심 — 자세히 보기"
          className="flex h-14 flex-1 items-center justify-center rounded-full font-pixel text-sm text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: UP }}
        >
          관심
        </button>
      </div>

      {selected && (
        <StockInsightView
          stock={selected.canonical}
          context={{ fromTheme: selected.sector }}
          onClose={closeDepth}
        />
      )}
    </div>
  );
}
