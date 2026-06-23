"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fomoCardView, computeFomoScore, selectFomoHook, sparklinePath } from "@fomo/core";
import type { KeywordCard, SectorStock, StockSector, CardFrontSignals, FomoScoreResult, FomoCardView, TaFact } from "@fomo/core";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { fetchSectorStocks, fetchStockFront, getCachedKeywords, recordTaste, warmKeywords } from "@/lib/fomoApi";
import { getWatchlist } from "@/lib/watchlist";
import { recordStockInterest, stockInterestScore } from "@/lib/stockInterest";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import { FlameIcon, GemIcon, StarIcon, CaretUpIcon, CaretDownIcon } from "@/components/icons";

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
 * 정렬은 즉시 가능한 로컬 신호(취향·발굴 근거·대표주·기존 순서)만 사용한다.
 * stock-front 는 현재 카드와 다음 카드만 lazy hydrate 한다.
 */
const THRESHOLD = 90;
const EXIT_MS = 320;
const DOWN = "#64748B"; // 덜관심(패스) 오버레이 — 중립 그레이
// DESIGN.md §2 브랜드 액센트(역할 인코딩). 오렌지=주목 열기/강도, 네온=발견·💎·CTA. 등락엔 절대 금지.
const NEON = "#D8FF3A";

/** 포모 점수 로드 전 placeholder(빈 입력 → silent·점수 보류). */
const EMPTY_FOMO = computeFomoScore({});

/** 덱 카드 — 섹터 풀 종목 + 발굴 근거(있으면 "주목 종목"으로 노출). */
type DeckStock = SectorStock & { reason?: string };

/** 종목별 앞면 데이터(stock-front 응답 캐시). 포모 점수(척추)·스파크라인·가격. */
type FrontEntry = {
  signals: CardFrontSignals;
  fomo: FomoScoreResult;
  taFact?: TaFact;
  sparkline: number[];
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
};

/**
 * 섹터 풀 + 그날 발굴 종목 병합(④). 발굴 근거(reason)를 풀 종목에 붙이고, 풀에 없던 발굴주는 추가.
 * 순서는 풀 순서를 보존한다. 즉시 렌더 path 에서 다시 정렬한다.
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
  return out;
}

function stockPersonalizationRank(stock: string, nowMs = Date.now()): number {
  const watch = getWatchlist();
  const watchIndex = watch.findIndex((w) => w.stock === stock);
  const watchBoost = watchIndex >= 0 ? 30 + Math.max(0, 10 - watchIndex) : 0;
  return stockInterestScore(stock, nowMs) + watchBoost;
}

function rankInstantStocks(stocks: readonly DeckStock[], nowMs = Date.now()): DeckStock[] {
  return stocks
    .map((stock, index) => ({ stock, index, rank: stockPersonalizationRank(stock.canonical, nowMs) }))
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        Number(!!b.stock.reason) - Number(!!a.stock.reason) ||
        Number(b.stock.marquee) - Number(a.stock.marquee) ||
        a.index - b.index
    )
    .map((row) => row.stock);
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
      style={{ backgroundColor: "rgba(216,255,58,0.14)", color: NEON }}
      aria-hidden
    >
      {ch}
    </span>
  );
}

/** 미니 라인차트 — 가격 흐름만 조용히 보여준다. 프라이머리 컬러는 점수/CTA에만 남긴다. */
function Sparkline({ series }: { series: number[] }) {
  const pts = series.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (pts.length < 2) return null;
  const W = 300;
  const H = 44;
  const paths = sparklinePath(pts, W, H);
  if (!paths) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-4 h-11 w-full" aria-hidden>
      <path d={paths.line} fill="none" stroke="rgba(250,250,250,0.52)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** 포모 강도 미터(DESIGN.md §8 모티프) — 10 도트 세그먼트, 점수만큼 오렌지 fill·나머지 dim. */
function FomoMeter({ score, color }: { score: number; color: string }) {
  const normalized = Math.max(0, Math.min(100, score));
  const filled = normalized > 0 ? Math.max(1, Math.ceil(normalized / 10)) : 0;
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-[1px]"
          style={{ backgroundColor: i < filled ? color : "rgba(255,255,255,0.12)" }}
        />
      ))}
    </span>
  );
}

/** 봉인색 — 등락 데이터 전용(DESIGN.md §2). 브랜드(오렌지/네온)와 분리. 상승 적·하락 청(KR 관습). */
const DIR_COLOR: Record<string, string> = { up: "#FF4D4D", down: "#3B82F6", flat: "#8A8A86" };

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
  subLine,
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
  subLine?: string | undefined;
  progress?: string | undefined;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* 1행 — 정체성: 로고 + 종목명 + 시장·시총순위 */}
      <div className="flex items-center gap-2.5">
        <LogoBadge name={stock.canonical} code={stock.naverCode} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-2xl font-bold text-whiteout">{stock.canonical}</span>
            {stock.marquee && <StarIcon size={14} className="shrink-0 text-text-secondary" />}
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
            <span className="inline-flex items-center gap-1 font-pixel text-sm" style={{ color: DIR_COLOR[changeDir ?? "flat"] }}>
              {changeDir === "up" && <CaretUpIcon size={11} />}
              {changeDir === "down" && <CaretDownIcon size={11} />}
              {changeText}
            </span>
          )}
        </div>
      )}

      {/* 포모 점수 + 강도 미터 + 라벨 (척추) — 숫자=픽셀 디스플레이(라틴), 한글 라벨=Pretendard. 주목도(품질 아님). */}
      {view.scoreText && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-text-secondary">포모</span>
            <span className="font-display text-3xl leading-none" style={{ color: NEON }}>
              {view.scoreText.replace(/[^0-9]/g, "")}
            </span>
          </div>
          <FomoMeter score={Number(view.scoreText.replace(/[^0-9]/g, "")) || 0} color={NEON} />
          <span className="inline-flex items-center gap-1 text-sm font-bold text-whiteout">
            {view.emoji === "🔥" && <FlameIcon size={15} />}
            {view.emoji === "💎" && <GemIcon size={15} />}
            {view.badge}
          </span>
        </div>
      )}

      {/* 테마 태그 */}
      {themeLabel && (
        <span className="mt-3 inline-flex w-fit items-center rounded-full border border-hairline-soft bg-white/[0.04] px-2.5 py-1 text-xs text-whiteout">
          # {themeLabel}
        </span>
      )}

      {/* 헤드라인 = 종목별 후킹 사실 1개. 색 강조는 점수/미터/CTA에만 둔다. */}
      <p className="mt-4 text-xl font-bold leading-8 text-whiteout">
        {view.isLeading && <GemIcon size={18} className="mr-1 inline-block align-[-2px]" />}
        {view.headline}
      </p>

      {subLine && (
        <p className="mt-2 rounded-lg border border-hairline bg-black/10 px-3 py-2 text-sm leading-6 text-muted">
          {subLine}
        </p>
      )}

      {/* 미니 스파크라인(최근 3개월) */}
      {sparkline && sparkline.length >= 2 && <Sparkline series={sparkline} />}

      {/* 다가오는 재료(있으면) */}
      {catalysts && catalysts.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {catalysts.map((c, i) => (
            <li key={i} className="flex gap-2 text-sm leading-6 text-whiteout">
              <span className="text-muted" aria-hidden>•</span>
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
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; stocks: DeckStock[]; fronts: Record<string, FrontEntry> }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    (async () => {
      try {
        // ready 는 섹터 풀만 기다린다. keywords 는 캐시가 있으면 즉시 사용하고, 없으면 다음 전환을 위해 뒤에서 데운다.
        const cachedKeywords = getCachedKeywords();
        if (!cachedKeywords) warmKeywords().catch((err) => console.warn("[SectorStockDeck] keywords warm failed", err));
        const poolRes = await fetchSectorStocks(sector, true);
        if (!alive) return;
        if (!poolRes.stocks?.length) {
          setState({ kind: "error" });
          return;
        }
        const merged = mergeDiscovered(poolRes.stocks, cachedKeywords?.cards ?? [], sector);
        const ranked = rankInstantStocks(merged);
        setState({ kind: "ready", stocks: ranked.length ? ranked : merged, fronts: {} });
      } catch (err) {
        console.warn("[SectorStockDeck] fetch failed", err);
        if (alive) setState({ kind: "error" });
      }
    })();
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
  return (
    <SectorDeckInner
      stocks={state.stocks}
      initialFronts={state.fronts}
      loggedIn={loggedIn}
      onRequireLogin={onRequireLogin}
    />
  );
}

function SectorDeckInner({
  stocks,
  initialFronts,
  loggedIn,
  onRequireLogin,
}: { stocks: DeckStock[]; initialFronts?: Record<string, FrontEntry> } & Omit<SectorDeckProps, "sector">) {
  // 무한: 풀을 순환(modulo)해 끝나지 않는다(§7 "무한히 풀만큼").
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [selected, setSelected] = useState<DeckStock | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  // 앞면 FOMO 신호 — ④ 정렬 때 풀 전체를 이미 받아 seed(initialFronts). 빠진 종목만 도달 시 lazy 보강.
  const [front, setFront] = useState<Record<string, FrontEntry>>(initialFronts ?? {});
  const inflight = useRef<Set<string>>(new Set());

  const at = (i: number) => stocks[((i % stocks.length) + stocks.length) % stocks.length]!;

  const ensureFront = useCallback(
    (stock: DeckStock) => {
      const key = stock.canonical;
      if (!stock.naverCode || front[key] || inflight.current.has(key)) return;
      inflight.current.add(key);
      fetchStockFront(key, { lite: true })
        .then((d) =>
          setFront((prev) => ({
            ...prev,
            [key]: {
              signals: d.signals,
              fomo: d.fomo,
              ...(d.taFact ? { taFact: d.taFact } : {}),
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
  const cardFor = (stock: DeckStock): { view: FomoCardView; catalysts: string[]; subLine?: string } => {
    const e = front[stock.canonical];
    if (!e) {
      const view: FomoCardView = {
        scoreText: "",
        emoji: "",
        badge: "신호 확인 중",
        headline: stock.reason ?? "신호를 확인하는 중이에요.",
        tone: "calm",
        isLeading: false,
      };
      return { view, catalysts: stock.reason ? [] : [], subLine: "가격·거래량 신호를 불러오고 있어요." };
    }
    const fomo = e?.fomo ?? EMPTY_FOMO;
    const hook = selectFomoHook({
      fomo,
      ...(e?.signals ? { signals: e.signals } : {}),
      ...(e?.taFact ? { taFact: e.taFact } : {}),
    });
    const baseView = fomoCardView(fomo, { sector: stock.sector, ...(stock.reason ? { reason: stock.reason } : {}) });
    const view = { ...baseView, headline: hook.headline };
    const catalysts = stock.reason && hook.headline !== stock.reason && hook.subLine !== stock.reason ? [stock.reason] : [];
    return { view, catalysts, ...(hook.subLine ? { subLine: hook.subLine } : {}) };
  };
  const rankLabelFor = (stock: DeckStock): string | undefined => {
    const r = front[stock.canonical]?.signals.marketCapRank;
    return r ? `시총 ${r.rank}위` : undefined; // 시장명은 1행에 이미 있음(중복 방지)
  };
  const renderFace = (stock: DeckStock, progress?: string) => {
    const { view, catalysts, subLine } = cardFor(stock);
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
        subLine={subLine}
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
      const stock = at(idx).canonical;
      recordStockInterest(stock, dir === "right" ? "more" : "less", Date.now());
      recordTaste("stock", stock, dir === "right" ? "more" : "less"); // 트랙 B 적재
      flingNext(dir);
    },
    [idx, stocks, flingNext]
  );

  const openDepth = (stock: DeckStock) => {
    if (!loggedIn && onRequireLogin) {
      onRequireLogin();
      return;
    }
    recordStockInterest(stock.canonical, "view_depth", Date.now());
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

  return (
    <div className="w-full">
      <div className="relative mx-auto h-[56vh] w-full select-none">
        {/* 단일 카드만 렌더 — 글래스모피즘 카드 뒤로 비침 금지(스택 미리보기 제거). */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (!moved.current && !exiting) openDepth(top);
          }}
          className="glass-card absolute inset-0 z-10 cursor-pointer overflow-hidden rounded-2xl px-6 py-7"
          style={{ transform: topTransform, transition: topTransition }}
        >
          <span
            className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 text-sm font-bold"
            style={{ color: NEON, borderColor: NEON, opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}
          >
            관심 →
          </span>
          <span
            className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 text-sm font-bold"
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
          className="flex h-14 w-14 items-center justify-center rounded-full border border-hairline-soft bg-surface-raised text-xl text-muted transition-colors hover:text-whiteout disabled:opacity-40"
        >
          ✕
        </button>
        <button
          onClick={() => openDepth(top)}
          disabled={!!exiting}
          aria-label="관심 — 자세히 보기"
          className="flex h-14 flex-1 items-center justify-center rounded-full text-sm font-bold text-canvas transition-opacity disabled:opacity-40"
          style={{ backgroundColor: NEON }}
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
