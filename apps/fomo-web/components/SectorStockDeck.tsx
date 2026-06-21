"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sparklinePath, seriesIsUp, fomoCardView, computeFomoScore } from "@fomo/core";
import type { KeywordCard, SectorStock, StockSector, CardFrontSignals, FomoScoreResult, FomoCardView, FomoTone } from "@fomo/core";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { fetchSectorStocks, fetchKeywords, fetchStockFront, recordTaste } from "@/lib/fomoApi";
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

/** 포모 점수 로드 전 placeholder(빈 입력 → silent·점수 보류). */
const EMPTY_FOMO = computeFomoScore({});

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

/** 종목 로고 — 네이버 심볼 이미지(불러와지면), 실패 시 이니셜 원형 폴백. */
function LogoBadge({ name, code }: { name: string; code?: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const ch = name.trim().slice(0, 1) || "·";
  if (code && !failed) {
    return (
      <img
        src={`https://ssl.pstatic.net/imgstock/fn/real/logo/stock/Stock${code}.svg`}
        alt=""
        aria-hidden
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full bg-white object-contain p-1"
      />
    );
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold"
      style={{ backgroundColor: "rgba(255,90,54,0.18)", color: UP }}
      aria-hidden
    >
      {ch}
    </span>
  );
}

/** 3개월 종가 스파크라인 — 인라인 SVG(라이브러리 없음). 추세색: 상승=코랄/하락=블루. */
function Sparkline({ series }: { series: number[] }) {
  const paths = sparklinePath(series, 300, 44);
  if (!paths) return null;
  const up = seriesIsUp(series);
  const stroke = up ? UP : "#60A5FA";
  return (
    <svg viewBox="0 0 300 44" preserveAspectRatio="none" className="mt-4 h-11 w-full" aria-hidden>
      <path d={paths.area} fill={stroke} opacity={0.1} />
      <path d={paths.line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** 등락 방향 색 — 상승 코랄/하락 블루/보합 그레이(국내 관습: 상승 적·하락 청). */
const DIR_COLOR: Record<string, string> = { up: UP, down: "#3B82F6", flat: "#94A3B8" };
const DIR_MARK: Record<string, string> = { up: "▲", down: "▼", flat: "" };

/** 포모 톤 → 색(강도 비례). hot=코랄·incoming=💎보라·warming=주황·calm=그레이·cooling=블루. */
const TONE_COLOR: Record<FomoTone, string> = {
  hot: UP,
  incoming: "#A855F7",
  warming: "#F59E0B",
  calm: "#94A3B8",
  cooling: "#3B82F6",
};

/**
 * 종목 카드 앞면 — 포모 점수(척추 ②, 단일 출처)로 점수·라벨·헤드라인·톤. 휴리스틱 대체.
 * 정체성 / 현재가 / 포모점수+라벨 / 테마태그 / 헤드라인 / 스파크라인 / 재료. 점수=주목도(품질 아님), 예측 0.
 */
function StockCardFace({
  stock,
  view,
  themeLabel,
  catalysts,
  priceText,
  changeText,
  changeDir,
  rankLabel,
  sparkline,
  progress,
}: {
  stock: DeckStock;
  view: FomoCardView;
  themeLabel?: string | undefined;
  catalysts?: string[] | undefined;
  priceText?: string | undefined;
  changeText?: string | undefined;
  changeDir?: "up" | "down" | "flat" | undefined;
  rankLabel?: string | undefined;
  sparkline?: number[] | undefined;
  progress?: string | undefined;
}) {
  const tone = TONE_COLOR[view.tone] ?? "#94A3B8";
  return (
    <div className="flex h-full flex-col">
      {/* 1행 — 정체성: 로고 + 종목명 + 시장·시총순위 */}
      <div className="flex items-center gap-2.5">
        <LogoBadge name={stock.canonical} code={stock.naverCode} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-2xl font-bold text-whiteout">{stock.canonical}</span>
            {stock.marquee && <span className="text-base" aria-hidden>⭐</span>}
          </div>
          <span className="font-pixel text-xs text-muted">
            {MARKET_LABEL[stock.market] ?? stock.market}
            {rankLabel && <span> · {rankLabel}</span>}
          </span>
        </div>
      </div>

      {/* 현재가 — 시총순위줄과 포모 점수 사이(시장 readout, 후킹 아님) */}
      {priceText && (
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-lg font-bold text-whiteout">{priceText}</span>
          {changeText && (
            <span className="font-pixel text-sm" style={{ color: DIR_COLOR[changeDir ?? "flat"] }}>
              {DIR_MARK[changeDir ?? "flat"]} {changeText}
            </span>
          )}
        </div>
      )}

      {/* 포모 점수 + 라벨 (척추) — "포모 72 · 🔥 지금 한복판". 주목도 명시(품질 아님). */}
      {view.scoreText && (
        <div
          className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold"
          style={{ backgroundColor: `${tone}22`, color: tone }}
        >
          <span>{view.scoreText}</span>
          <span className="opacity-70">·</span>
          <span>
            {view.emoji && <span aria-hidden>{view.emoji} </span>}
            {view.badge}
          </span>
        </div>
      )}

      {/* 테마 태그 */}
      {themeLabel && (
        <span
          className="mt-3 inline-flex w-fit items-center rounded-full px-2.5 py-1 font-pixel text-xs"
          style={{ backgroundColor: "rgba(255,90,54,0.12)", color: UP }}
        >
          # {themeLabel}
        </span>
      )}

      {/* 헤드라인 = 라벨 기반 한 줄(강도 비례 톤). 💎는 특별 강조. */}
      <p className="mt-4 text-xl font-bold leading-8" style={{ color: tone }}>
        {view.isLeading && <span aria-hidden>💎 </span>}
        {view.headline}
      </p>

      {/* 미니 스파크라인(최근 3개월) */}
      {sparkline && sparkline.length >= 2 && <Sparkline series={sparkline} />}

      {/* 다가오는 재료(있으면) */}
      {catalysts && catalysts.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {catalysts.map((c, i) => (
            <li key={i} className="flex gap-2 text-sm leading-6 text-whiteout">
              <span aria-hidden style={{ color: UP }}>•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="font-pixel text-[11px] text-muted">더보기 →</span>
        {progress && <span className="font-pixel text-[11px] text-muted">{progress}</span>}
      </div>
    </div>
  );
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

  // 앞면 FOMO 신호 — 도달하는 카드의 stock-front(가격·52주·라이브 수급 streak·시총순위·3개월 종가)를
  // lazy 로 서버에서 조립해 받는다(비용 방어 §5). 캐시(canonical 키)로 재방문 즉시.
  type FrontEntry = {
    signals: CardFrontSignals;
    fomo: FomoScoreResult;
    sparkline: number[];
    priceText?: string;
    changeText?: string;
    changeDir?: "up" | "down" | "flat";
  };
  const [front, setFront] = useState<Record<string, FrontEntry>>({});
  const inflight = useRef<Set<string>>(new Set());

  const at = (i: number) => stocks[((i % stocks.length) + stocks.length) % stocks.length]!;

  const ensureFront = useCallback(
    (stock: DeckStock) => {
      const key = stock.canonical;
      if (!stock.naverCode || front[key] || inflight.current.has(key)) return;
      inflight.current.add(key);
      fetchStockFront(key)
        .then((d) =>
          setFront((prev) => ({
            ...prev,
            [key]: {
              signals: d.signals,
              fomo: d.fomo,
              sparkline: d.sparkline,
              ...(d.priceText ? { priceText: d.priceText } : {}),
              ...(d.changeText ? { changeText: d.changeText } : {}),
              ...(d.changeDir ? { changeDir: d.changeDir } : {}),
            },
          }))
        )
        .catch((err) => console.warn("[SectorStockDeck] stock-front failed", key, err))
        .finally(() => inflight.current.delete(key));
    },
    [front]
  );

  // 카드 표현 — 포모 점수(척추, 단일 출처) → fomoCardView. 로드 전엔 EMPTY(근거 있으면 그게 헤드라인).
  // 헤드라인으로 쓰인 근거는 재료 리스트에서 빼서 중복 방지.
  const cardFor = (stock: DeckStock): { view: FomoCardView; catalysts: string[] } => {
    const fomo = front[stock.canonical]?.fomo ?? EMPTY_FOMO;
    const view = fomoCardView(fomo, { sector: stock.sector, ...(stock.reason ? { reason: stock.reason } : {}) });
    const catalysts = stock.reason && view.headline !== stock.reason ? [stock.reason] : [];
    return { view, catalysts };
  };
  const rankLabelFor = (stock: DeckStock): string | undefined => {
    const r = front[stock.canonical]?.signals.marketCapRank;
    return r ? `시총 ${r.rank}위` : undefined; // 시장명은 1행에 이미 있음(중복 방지)
  };
  const renderFace = (stock: DeckStock, progress?: string) => {
    const { view, catalysts } = cardFor(stock);
    const e = front[stock.canonical];
    return (
      <StockCardFace
        stock={stock}
        view={view}
        catalysts={catalysts}
        themeLabel={stock.sector}
        priceText={e?.priceText}
        changeText={e?.changeText}
        changeDir={e?.changeDir}
        rankLabel={rankLabelFor(stock)}
        sparkline={e?.sparkline}
        progress={progress}
      />
    );
  };

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
    ensureFront(at(idx));
    ensureFront(at(idx + 1));
  }, [idx, ensureFront]); // eslint-disable-line react-hooks/exhaustive-deps

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
              {renderFace(stock)}
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
          {renderFace(top, `${(idx % stocks.length) + 1} / ${stocks.length}`)}
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
