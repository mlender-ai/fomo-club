"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { fomoCardView, computeFomoScore, selectFomoHook, selectMultiAxisHook, sparklinePath } from "@fomo/core";
import type {
  AxisSignal,
  CardFrontSignals,
  FomoScoreResult,
  FomoCardView,
  MultiAxisHookSelection,
  TaFact,
} from "@fomo/core";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { fetchStockFront, recordTaste } from "@/lib/fomoApi";
import type { FeedSignalPoint } from "@/lib/fomoApi";
import { recordStockInterest } from "@/lib/stockInterest";
import { upsertWatch } from "@/lib/watchlist";
import type { DeckStock } from "@/lib/discoveryDeck";
import { whyShown } from "@/lib/whyShown";
import { dedupeCardCopy } from "@/lib/cardCopyDedupe";
import { recordDiscoveryEvent } from "@/lib/discoveryMetrics";
import { FlameIcon, GemIcon, StarIcon, CaretUpIcon, CaretDownIcon, UndoIcon, HeartIcon, XMarkIcon } from "@/components/icons";

/**
 * 공통 종목 무한 스와이프 덱.
 * TodayDiscoveryDeck/SectorStockDeck 이 같은 손맛과 lazy hydrate 정책을 공유한다.
 * stock-front 는 현재 카드와 다음 카드만 lazy hydrate 한다.
 */
const THRESHOLD = 90;
const UP_THRESHOLD = 90; // 위로 끌어 슈퍼관심(강한 관심)
const EXIT_MS = 320;
// DESIGN.md §2 브랜드 액센트(역할 인코딩). 오렌지=주목 열기/강도, 네온=발견·💎·CTA. 등락엔 절대 금지.
const NEON = "#D8FF3A";

/** 포모 점수 로드 전 placeholder(빈 입력 → silent·점수 보류). */
const EMPTY_FOMO = computeFomoScore({});

/** 종목별 앞면 데이터(stock-front 응답 캐시). 포모 점수(척추)·스파크라인·가격. */
export type FrontEntry = {
  signals: CardFrontSignals;
  fomo: FomoScoreResult;
  taFact?: TaFact;
  sparkline: number[];
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  feedBull?: FeedSignalPoint;
  feedBear?: FeedSignalPoint;
  axisSignals?: AxisSignal[];
  axisHook?: MultiAxisHookSelection;
};

type UndoEntry = {
  idx: number;
  dir: "left" | "right";
  stock: DeckStock;
};

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
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-8 w-full shrink-0" aria-hidden>
      <path d={paths.line} fill="none" stroke="rgba(250,250,250,0.52)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ChartSlot({ series, supported }: { series?: number[] | undefined; supported: boolean }) {
  if (series && series.length >= 2) return <Sparkline series={series} />;
  return (
    <div className="mt-2 flex h-8 w-full shrink-0 items-center justify-center rounded-lg border border-hairline bg-white/[0.03]">
      <span className="font-pixel text-[10px] text-muted">
        {supported ? "차트 불러오는 중" : "차트 데이터 없음"}
      </span>
    </div>
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

function clampStyle(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden",
  };
}

function compactEvidenceLine(text: string | undefined): string | undefined {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > 58 ? `${clean.slice(0, 57)}…` : clean;
}

function compactReasonHeadlineSeed(text: string | undefined): string | undefined {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > 38 ? `${clean.slice(0, 37)}…` : clean;
}

function FeedSignalStrip({
  bull,
  bear,
}: {
  bull?: FeedSignalPoint | undefined;
  bear?: FeedSignalPoint | undefined;
}) {
  if (!bull && !bear) return null;
  const rows = [
    bull ? { label: "강세", tone: "#FF4D4D", point: bull } : undefined,
    bear ? { label: "약세", tone: "#3B82F6", point: bear } : undefined,
  ].filter((row): row is { label: string; tone: string; point: FeedSignalPoint } => !!row);
  return (
    <div className="mt-2 grid shrink-0 gap-1 rounded-lg border border-hairline bg-black/10 px-3 py-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 items-center gap-2 text-xs leading-4">
          <span className="shrink-0 font-pixel" style={{ color: row.tone }}>
            {row.label}
          </span>
          <span className="min-w-0 flex-1 text-muted" style={clampStyle(1)}>
            {row.point.text}
          </span>
          <span className="shrink-0 text-[10px] text-muted/80">{row.point.source}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 종목 카드 앞면 — 포모 점수(척추 ②, 단일 출처)로 점수·라벨·헤드라인·톤. 휴리스틱 대체.
 * 정체성 / 현재가 / 포모점수+라벨 / 테마태그 / 헤드라인 / 스파크라인 / 재료. 점수=주목도(품질 아님), 예측 0.
 */
function StockCardFace({
  stock,
  view,
  themeLabel,
  priceText,
  changeText,
  changeDir,
  rankLabel,
  sparkline,
  chartSupported,
  subLine,
  feedBull,
  feedBear,
  why,
  progress,
}: {
  stock: DeckStock;
  view: FomoCardView;
  themeLabel?: string | undefined;
  priceText?: string | undefined;
  changeText?: string | undefined;
  changeDir?: "up" | "down" | "flat" | undefined;
  rankLabel?: string | undefined;
  sparkline?: number[] | undefined;
  chartSupported: boolean;
  subLine?: string | undefined;
  feedBull?: FeedSignalPoint | undefined;
  feedBear?: FeedSignalPoint | undefined;
  why?: string | undefined;
  progress?: string | undefined;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 1행 — 정체성: 로고 + 종목명 + 시장·시총순위 */}
      <div className="flex shrink-0 items-center gap-2.5">
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
        <div className="mt-2.5 flex shrink-0 items-baseline gap-2">
          <span className="text-lg font-bold text-whiteout">{priceText}</span>
          {changeText && (
            <span className="inline-flex items-center gap-1 font-number text-sm font-medium tabular-nums" style={{ color: DIR_COLOR[changeDir ?? "flat"] }}>
              {changeDir === "up" && <CaretUpIcon size={11} />}
              {changeDir === "down" && <CaretDownIcon size={11} />}
              {changeText}
            </span>
          )}
        </div>
      )}

      {/* 포모 점수 + 강도 미터 + 라벨 (척추) — 숫자=픽셀 디스플레이(라틴), 한글 라벨=Pretendard. 주목도(품질 아님). */}
      {view.scoreText && (
        <div className="mt-3.5 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-text-secondary">포모</span>
            <span className="font-number text-3xl font-bold leading-none" style={{ color: NEON }}>
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
        <span className="mt-2.5 inline-flex w-fit shrink-0 items-center rounded-full border border-hairline-soft bg-white/[0.04] px-2.5 py-1 text-xs text-whiteout">
          # {themeLabel}
        </span>
      )}

      {/* 헤드라인 = 종목별 후킹 사실 1개. 색 강조는 점수/미터/CTA에만 둔다. */}
      <p className="mt-3 shrink-0 text-lg font-bold leading-7 text-whiteout" style={clampStyle(2)}>
        {view.isLeading && <GemIcon size={18} className="mr-1 inline-block align-[-2px]" />}
        {view.headline}
      </p>

      {why && (
        <div className="mt-2.5 flex shrink-0 items-start gap-2 rounded-lg border border-hairline bg-white/[0.035] px-3 py-1.5">
          <span className="shrink-0 text-[10px] leading-5 text-muted">이유</span>
          <span className="min-w-0 flex-1 text-sm leading-5 text-whiteout" style={clampStyle(1)}>
            {why}
          </span>
        </div>
      )}

      <FeedSignalStrip bull={feedBull} bear={feedBear} />

      {subLine && !feedBull && !feedBear && (
        <div className="mt-2 shrink-0 rounded-lg border border-hairline bg-black/10 px-3 py-1.5">
          <span className="text-sm leading-5 text-muted" style={clampStyle(1)}>
            {subLine}
          </span>
        </div>
      )}

      {/* 미니 스파크라인(최근 흐름) — lite 응답도 짧은 라인차트를 싣는다. */}
      <ChartSlot series={sparkline} supported={chartSupported} />

      <div className="mt-auto flex shrink-0 items-center justify-between pt-2">
        <span className="font-pixel text-[11px] text-muted">더보기 →</span>
        {progress && <span className="font-pixel text-[11px] text-muted">{progress}</span>}
      </div>
    </div>
  );
}

function StockCardLoadingFace({
  stock,
  themeLabel,
  progress,
}: {
  stock: DeckStock;
  themeLabel?: string | undefined;
  progress?: string | undefined;
}) {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <LogoBadge name={stock.canonical} code={stock.naverCode} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-2xl font-bold text-whiteout">{stock.canonical}</span>
            {stock.marquee && <StarIcon size={14} className="shrink-0 text-text-secondary" />}
          </div>
          <span className="font-pixel text-xs text-muted">{MARKET_LABEL[stock.market] ?? stock.market}</span>
        </div>
      </div>

      {themeLabel && (
        <span className="mt-5 inline-flex w-fit items-center rounded-full border border-hairline-soft bg-white/[0.04] px-2.5 py-1 text-xs text-whiteout">
          # {themeLabel}
        </span>
      )}

      <div className="mt-7 rounded-lg border border-hairline bg-white/[0.035] px-3 py-3">
        <span className="block text-[10px] text-muted">카드 준비 중</span>
        <span className="mt-1 block text-sm leading-6 text-whiteout">
          가격·수급·언급 근거를 맞춰 불러오고 있어요.
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-3 w-5/6 animate-pulse rounded-full bg-white/10" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
        <div className="h-11 animate-pulse rounded-lg border border-hairline bg-white/[0.03]" />
      </div>

      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="font-pixel text-[11px] text-muted">신호 확인 중</span>
        {progress && <span className="font-pixel text-[11px] text-muted">{progress}</span>}
      </div>
    </div>
  );
}

interface StockSwipeDeckProps {
  stocks: DeckStock[];
  initialFronts?: Record<string, FrontEntry>;
  contextLabel?: string | undefined;
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

export function StockSwipeDeck({
  stocks,
  initialFronts,
  contextLabel,
  loggedIn,
  onRequireLogin,
}: StockSwipeDeckProps) {
  // 무한: 풀을 순환(modulo)해 끝나지 않는다(§7 "무한히 풀만큼").
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right" | "up">(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreStart, setRestoreStart] = useState<null | "left" | "right">(null);
  const [restorePrimed, setRestorePrimed] = useState(false);
  const [selected, setSelected] = useState<DeckStock | null>(null);
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const moved = useRef(false);
  const lastSeenStock = useRef<string | null>(null);
  const firstCardRecorded = useRef(false);
  const hydratedRecorded = useRef<Set<string>>(new Set());

  // 앞면 FOMO 신호 — ④ 정렬 때 풀 전체를 이미 받아 seed(initialFronts). 빠진 종목만 도달 시 lazy 보강.
  const [front, setFront] = useState<Record<string, FrontEntry>>(initialFronts ?? {});
  const inflight = useRef<Set<string>>(new Set());

  const at = (i: number) => stocks[((i % stocks.length) + stocks.length) % stocks.length]!;

  const ensureFront = useCallback(
    (stock: DeckStock) => {
      const key = stock.canonical;
      if (front[key] || inflight.current.has(key)) return;
      if (!stock.naverCode) {
        setFront((prev) => ({
          ...prev,
          [key]: { signals: {}, fomo: EMPTY_FOMO, sparkline: [] },
        }));
        return;
      }
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
              ...(d.feedBull ? { feedBull: d.feedBull } : {}),
              ...(d.feedBear ? { feedBear: d.feedBear } : {}),
              ...(d.axisSignals ? { axisSignals: d.axisSignals } : {}),
              ...(d.axisHook ? { axisHook: d.axisHook } : {}),
            },
          }))
        )
        .catch((err) => console.warn("[StockSwipeDeck] stock-front failed", key, err))
        .finally(() => inflight.current.delete(key));
    },
    [front]
  );

  // 카드 표현 — 포모 점수(척추, 단일 출처) → fomoCardView.
  // 긴 원문 재료는 why/depth 로 보내고, 앞면은 잘리지 않는 핵심 독해만 남긴다.
  const cardFor = (stock: DeckStock): { view: FomoCardView; subLine?: string; usedReasonHeadline?: boolean } => {
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
      return { view, subLine: "가격·거래량 신호를 불러오고 있어요." };
    }
    const fomo = e?.fomo ?? EMPTY_FOMO;
    const reasonHeadlineSeed = compactReasonHeadlineSeed(stock.reason);
    const signalsForHook: CardFrontSignals = {
      ...(e?.signals ?? {}),
      ...(!e?.signals.newsEventLabel && reasonHeadlineSeed ? { newsEventLabel: reasonHeadlineSeed } : {}),
    };
    const legacyHook = selectFomoHook({
      fomo,
      signals: signalsForHook,
      ...(e?.taFact ? { taFact: e.taFact } : {}),
    });
    const axisHook =
      stock.axisHook ??
      e?.axisHook ??
      (e?.axisSignals ? selectMultiAxisHook(e.axisSignals) : undefined);
    const baseView = fomoCardView(fomo, { sector: stock.sector, ...(stock.reason ? { reason: stock.reason } : {}) });
    const view = { ...baseView, headline: axisHook?.hookText ?? legacyHook.headline };
    const usedReasonHeadline = !!reasonHeadlineSeed && !e?.signals.newsEventLabel && !axisHook && legacyHook.kind === "news_event";
    const evidenceLine = usedReasonHeadline ? undefined : compactEvidenceLine(stock.reason);
    return {
      view,
      ...(evidenceLine || legacyHook.subLine ? { subLine: evidenceLine ?? legacyHook.subLine } : {}),
      ...(usedReasonHeadline ? { usedReasonHeadline } : {}),
    };
  };
  const rankLabelFor = (stock: DeckStock): string | undefined => {
    const r = front[stock.canonical]?.signals.marketCapRank;
    return r ? `시총 ${r.rank}위` : undefined; // 시장명은 1행에 이미 있음(중복 방지)
  };
  const whyFor = (stock: DeckStock): string => {
    const e = front[stock.canonical];
    return whyShown({
      stock,
      fomoLabel: e?.fomo.label,
      signals: e?.signals,
    });
  };
  const axisHeadlineFor = (stock: DeckStock): string | undefined =>
    stock.axisHook?.hookText ?? front[stock.canonical]?.axisHook?.hookText;
  const saveDiscovery = (stock: DeckStock) => {
    upsertWatch(stock.canonical, Date.now(), { sector: stock.sector, reason: whyFor(stock) });
  };
  const renderFace = (stock: DeckStock, progress?: string) => {
    const e = front[stock.canonical];
    if (!e) {
      return <StockCardLoadingFace stock={stock} themeLabel={stock.sector} progress={progress} />;
    }
    const { view, subLine, usedReasonHeadline } = cardFor(stock);
    const deduped = dedupeCardCopy({
      headline: view.headline,
      why: whyFor(stock),
      feedBull: e?.feedBull,
      feedBear: e?.feedBear,
      preserveGroundedReason: !!stock.reason && !usedReasonHeadline,
    });
    return (
      <StockCardFace
        stock={stock}
        view={view}
        themeLabel={stock.sector}
        priceText={e?.priceText}
        changeText={e?.changeText}
        changeDir={e?.changeDir}
        rankLabel={rankLabelFor(stock)}
        sparkline={e?.sparkline}
        chartSupported={!!stock.naverCode}
        subLine={subLine}
        feedBull={deduped.feedBull}
        feedBear={deduped.feedBear}
        why={deduped.why}
        progress={progress}
      />
    );
  };

  const flingNext = useCallback((dir: "left" | "right" | "up") => {
    if (prefersReducedMotion()) {
      setDx(0);
      setDy(0);
      setIdx((i) => i + 1);
      return;
    }
    setExiting(dir);
    window.setTimeout(() => {
      setExiting(null);
      setDx(0);
      setDy(0);
      setIdx((i) => i + 1);
    }, EXIT_MS);
  }, []);

  const advance = useCallback(
    (dir: "left" | "right") => {
      const stock = at(idx);
      setUndoEntry({ idx, dir, stock });
      if (dir === "right") saveDiscovery(stock);
      recordDiscoveryEvent("swipe", { direction: dir, hydrated: !!front[stock.canonical] });
      recordStockInterest(stock.canonical, dir === "right" ? "more" : "less", Date.now());
      recordTaste("stock", stock.canonical, dir === "right" ? "more" : "less"); // 트랙 B 적재
      flingNext(dir);
    },
    [idx, stocks, flingNext, front]
  );

  const undoLast = useCallback(() => {
    if (!undoEntry || exiting) return;
    setExiting(null);
    setDx(0);
    setIdx(undoEntry.idx);
    setUndoEntry(null);
    if (prefersReducedMotion()) {
      setRestoreStart(null);
      setRestorePrimed(false);
      setRestoring(false);
      return;
    }
    setRestoring(true);
    setRestorePrimed(true);
    setRestoreStart(undoEntry.dir);
    window.setTimeout(() => {
      setRestorePrimed(false);
      setRestoreStart(null);
    }, 20);
    window.setTimeout(() => setRestoring(false), EXIT_MS + 40);
  }, [undoEntry, exiting]);

  // 슈퍼관심(위로) — 강한 관심. 기존 "more" 신호 재사용(새 데이터 없음), 위로 날리는 연출만 추가.
  const superLike = useCallback(() => {
    const stock = at(idx);
    setUndoEntry({ idx, dir: "right", stock }); // 되돌리기 가능(강한 관심=right 연출로 복구)
    saveDiscovery(stock);
    recordDiscoveryEvent("swipe", { direction: "right", hydrated: !!front[stock.canonical] }); // 메트릭상 강한 관심=right
    recordStockInterest(stock.canonical, "more", Date.now());
    recordTaste("stock", stock.canonical, "more");
    flingNext("up");
  }, [idx, stocks, flingNext, front]);

  const openDepth = (stock: DeckStock, source: "card" | "interest_button" = "card") => {
    if (!loggedIn && onRequireLogin) {
      onRequireLogin();
      return;
    }
    if (source === "interest_button") {
      saveDiscovery(stock);
      recordDiscoveryEvent("interest_button");
    }
    recordDiscoveryEvent("depth_open");
    recordStockInterest(stock.canonical, "view_depth", Date.now());
    recordTaste("stock", stock.canonical, "view_depth"); // 강한 관심
    setSelected(stock);
  };
  const closeDepth = () => {
    if (selected) setUndoEntry({ idx, dir: "left", stock: selected });
    setSelected(null);
    window.setTimeout(() => flingNext("left"), 40);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting || restoring) return;
    if (!front[at(idx).canonical]) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = e.clientX - startX.current;
    const v = e.clientY - startY.current;
    if (Math.abs(d) > 6 || Math.abs(v) > 6) moved.current = true;
    setDx(d);
    setDy(v);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    // 위로 크게 끌면 슈퍼관심(좌우보다 우선). 아니면 좌우 임계.
    if (dy < -UP_THRESHOLD && Math.abs(dy) > Math.abs(dx)) superLike();
    else if (dx > THRESHOLD) advance("right");
    else if (dx < -THRESHOLD) advance("left");
    else {
      setDx(0);
      setDy(0);
    }
  };

  // 보이는 카드(+다음 1장)의 신호를 미리 채운다 — 도달 종목만(비용 방어).
  useEffect(() => {
    ensureFront(at(idx));
    ensureFront(at(idx + 1));
  }, [idx, ensureFront]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    recordDiscoveryEvent("deck_mount");
  }, [contextLabel]);

  useEffect(() => {
    setUndoEntry(null);
  }, [stocks]);

  useEffect(() => {
    const stock = at(idx).canonical;
    if (!firstCardRecorded.current) {
      firstCardRecorded.current = true;
      recordDiscoveryEvent("first_card_display");
    }
    if (lastSeenStock.current === stock) return;
    lastSeenStock.current = stock;
    recordStockInterest(stock, "seen", Date.now());
  }, [idx, stocks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stock = at(idx).canonical;
    if (!front[stock] || hydratedRecorded.current.has(stock)) return;
    hydratedRecorded.current.add(stock);
    recordDiscoveryEvent("card_hydrate");
  }, [idx, front, stocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = at(idx);
  const flingTransform = (dir: "left" | "right") =>
    `translateX(${dir === "right" ? 140 : -140}%) rotate(${dir === "right" ? 16 : -16}deg)`;
  const topTransform = restoreStart
    ? flingTransform(restoreStart)
    : exiting
      ? exiting === "up"
        ? "translateY(-140%) scale(0.96)"
        : flingTransform(exiting)
      : `translate(${dx}px, ${dy}px) rotate(${dx * 0.04}deg)`;
  const topTransition = dragging.current || restorePrimed ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.22,1,0.36,1)`;
  const topReady = !!front[top.canonical];

  return (
    <div className="w-full">
      <div className="relative mx-auto h-[60svh] min-h-[460px] max-h-[580px] w-full select-none sm:min-h-[500px]">
        {/* 다음 카드 — 뒤에 살짝 드러나는 스택(틴더식 peek). 위 카드가 불투명이라 body 통과 비침은 없음. */}
        {stocks.length > 1 && (
          <div
            aria-hidden
            className="absolute inset-0 overflow-hidden rounded-2xl border border-hairline-soft bg-surface-raised px-6 py-7"
            style={{ transform: "translateY(14px) scale(0.95)", opacity: 0.6, zIndex: 0 }}
          >
            {renderFace(at(idx + 1))}
          </div>
        )}

        {/* 위 카드 — 불투명(뒤 카드 body 비침 차단). 슬라이드하면 뒤 카드가 드러난다. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (topReady && !moved.current && !exiting && !restoring) openDepth(top, "card");
          }}
          className="absolute inset-0 z-10 cursor-pointer overflow-hidden rounded-2xl border border-hairline-soft bg-surface-raised px-6 py-7"
          style={{ transform: topTransform, transition: topTransition }}
        >
          {/* 드래그 스탬프(틴더식 아이콘) — 거리에 비례해 또렷·확대. 우=관심(하트)·좌=패스(X)·위=슈퍼관심(별). */}
          <span
            className="pointer-events-none absolute right-6 top-7 z-20"
            style={{ color: NEON, opacity: Math.max(0, Math.min(1, dx / THRESHOLD)), transform: `rotate(18deg) scale(${0.8 + 0.25 * Math.max(0, Math.min(1, dx / THRESHOLD))})` }}
          >
            <HeartIcon size={76} />
          </span>
          <span
            className="pointer-events-none absolute left-6 top-7 z-20"
            style={{ color: "#E2E8F0", opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)), transform: `rotate(-18deg) scale(${0.8 + 0.25 * Math.max(0, Math.min(1, -dx / THRESHOLD))})` }}
          >
            <XMarkIcon size={76} />
          </span>
          <span
            className="pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2"
            style={{ color: NEON, opacity: Math.max(0, Math.min(1, -dy / UP_THRESHOLD)), transform: `translateX(-50%) scale(${0.8 + 0.25 * Math.max(0, Math.min(1, -dy / UP_THRESHOLD))})` }}
          >
            <StarIcon size={72} />
          </span>
          {renderFace(top, `${(idx % stocks.length) + 1} / ${stocks.length}`)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={undoLast}
          disabled={!!exiting || restoring || !undoEntry}
          aria-label={undoEntry ? `${undoEntry.stock.canonical} 카드로 돌아가기` : "이전 카드 없음"}
          title={undoEntry ? `${undoEntry.stock.canonical} 다시 보기` : "이전 카드 없음"}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-hairline-soft bg-surface-raised text-muted transition-colors hover:text-whiteout disabled:opacity-30"
        >
          <UndoIcon size={24} />
        </button>
        <button
          onClick={() => advance("left")}
          disabled={!!exiting || restoring || !topReady}
          aria-label="덜 관심"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-hairline-soft bg-surface-raised text-xl text-muted transition-colors hover:text-whiteout disabled:opacity-40"
        >
          ✕
        </button>
        <button
          onClick={() => openDepth(top, "interest_button")}
          disabled={!!exiting || restoring || !topReady}
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
          context={{
            fromTheme: selected.sector,
            reason: whyFor(selected),
            ...(axisHeadlineFor(selected) ? { axisHeadline: axisHeadlineFor(selected) } : {}),
          }}
          onClose={closeDepth}
        />
      )}
    </div>
  );
}
