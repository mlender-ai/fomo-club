"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fomoCardView, computeFomoScore, selectFomoHook, sparklinePath } from "@fomo/core";
import type {
  AxisSignal,
  CardFrontSignals,
  FomoScoreResult,
  FomoCardView,
  MultiAxisHookSelection,
  TaFact,
} from "@fomo/core";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { ContentCard } from "@/components/ContentCard";
import { NarrativeCard } from "@/components/NarrativeCard";
import { SectorCard } from "@/components/SectorCard";
import { fetchStockFront, recordTaste } from "@/lib/fomoApi";
import type { FeedSignalPoint, StockFrontResponse } from "@/lib/fomoApi";
import { recordStockInterest } from "@/lib/stockInterest";
import { upsertWatch } from "@/lib/watchlist";
import type { DeckStock } from "@/lib/discoveryDeck";
import { stockDeckCards, type DeckCard, type DeckThemeBundle, type DiscoveryDeckCard } from "@/lib/discoveryDeck";
import { whyShown } from "@/lib/whyShown";
import { dedupeCardCopy } from "@/lib/cardCopyDedupe";
import { recordDiscoveryEvent } from "@/lib/discoveryMetrics";
import { isKrStockCode, stockLogoApiSrcForStock } from "@/lib/stockLogo";
import { FlameIcon, GemIcon, StarIcon, CaretUpIcon, CaretDownIcon, UndoIcon, HeartIcon, XMarkIcon } from "@/components/icons";
import { FlickerSpinner } from "@/components/FlickerSpinner";

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
  card: DeckCard;
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

function normalizeChangeText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.replace(/^--+/, "-").replace(/^\+\++/, "+");
}

/** 종목 로고 — 국내는 same-origin 로고 프록시, 미국은 티커 로고(Parqet), 실패 시 이니셜 원형 폴백. */
function LogoBadge({
  name,
  naverCode,
  symbol,
}: {
  name: string;
  naverCode?: string | undefined;
  symbol?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const ch = name.trim().slice(0, 1) || "·";
  const usSymbol = symbol && !isKrStockCode(symbol.trim()) ? symbol : undefined;
  const src =
    stockLogoApiSrcForStock({ naverCode, symbol, name }) ??
    (usSymbol ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(usSymbol)}` : undefined);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
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
    <div className="mt-2 flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white/[0.03]">
      {supported && <FlickerSpinner size={14} />}
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

function cleanServerHeadline(text: string | undefined): string | undefined {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean || undefined;
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

function cardKey(card: DeckCard): string {
  return card.type === "stock" ? card.data.canonical : card.data.id;
}

function cardLabel(card: DeckCard): string {
  if (card.type === "stock") return card.data.canonical;
  if (card.type === "sector") return `${card.data.sector} 섹터`;
  if (card.type === "narrative") return card.data.headline;
  return card.data.headline;
}

function isStockCard(card: DeckCard): card is Extract<DeckCard, { type: "stock" }> {
  return card.type === "stock";
}

function relationLabel(relation: DeckThemeBundle["items"][number]["relation"]): string {
  switch (relation) {
    case "customer":
      return "수요처";
    case "supplier":
      return "공급사";
    case "material":
      return "원재료";
    case "beneficiary":
      return "확산 수혜";
    case "peer":
    default:
      return "비교군";
  }
}

function BundleCardFace({ bundle, progress }: { bundle: DeckThemeBundle; progress?: string | undefined }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <span className="font-pixel text-[10px] uppercase tracking-wide text-muted">THEME BUNDLE</span>
        <h3 className="mt-3 text-2xl font-bold leading-8 text-whiteout" style={clampStyle(2)}>
          {bundle.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted" style={clampStyle(2)}>
          {bundle.subtitle}
        </p>
      </div>

      <div className="mt-5 grid min-h-0 gap-2 overflow-hidden">
        {bundle.items.slice(0, 4).map((item) => (
          <div key={`${bundle.id}:${item.ticker}`} className="rounded-xl border border-hairline bg-white/[0.035] px-3 py-2.5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-base font-bold text-whiteout">{item.label}</span>
              <span className="shrink-0 rounded-full border border-hairline-soft px-2 py-0.5 text-[10px] text-muted">
                {relationLabel(item.relation)}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted" style={clampStyle(2)}>
              {item.reason}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted/80">
              <span>{item.source}</span>
              {typeof item.changePct === "number" && (
                <span style={{ color: item.changePct > 0 ? DIR_COLOR.up : item.changePct < 0 ? DIR_COLOR.down : DIR_COLOR.flat }}>
                  {item.changePct > 0 ? "+" : ""}
                  {item.changePct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex shrink-0 items-center justify-between pt-2">
        <span className="font-pixel text-[11px] text-muted">관계 근거 · {bundle.confidence}</span>
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
      </div>
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
  const displayChangeText = normalizeChangeText(changeText);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 1행 — 정체성: 로고 + 종목명 + 시장·시총순위 */}
      <div className="flex shrink-0 items-center gap-2.5">
        <LogoBadge name={stock.canonical} naverCode={stock.naverCode} symbol={stock.symbol} />
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
          {displayChangeText && (
            <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums" style={{ color: DIR_COLOR[changeDir ?? "flat"] }}>
              {changeDir === "up" && <CaretUpIcon size={11} />}
              {changeDir === "down" && <CaretDownIcon size={11} />}
              {displayChangeText}
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

      {subLine && !why && !feedBull && !feedBear && (
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
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
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
        <LogoBadge name={stock.canonical} naverCode={stock.naverCode} symbol={stock.symbol} />
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
          카드 내용을 준비하고 있어요.
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-3 w-5/6 animate-pulse rounded-full bg-white/10" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
        <div className="h-11 animate-pulse rounded-lg border border-hairline bg-white/[0.03]" />
      </div>

      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="font-pixel text-[11px] text-muted">신호 확인 중</span>
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
      </div>
    </div>
  );
}

interface StockSwipeDeckProps {
  cards?: DeckCard[];
  stocks?: DiscoveryDeckCard[];
  initialFronts?: Record<string, FrontEntry>;
  contextLabel?: string | undefined;
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

export function StockSwipeDeck({
  cards,
  stocks,
  initialFronts,
  contextLabel,
  loggedIn,
  onRequireLogin,
}: StockSwipeDeckProps) {
  const deckCards = useMemo(() => cards ?? stockDeckCards(stocks ?? []), [cards, stocks]);
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
  // 매칭 모먼트 — 관심(우)·슈퍼관심(위) 넘길 때 짧게 뜨는 담담한 확인 연출(표현 레이어).
  const [matchMoment, setMatchMoment] = useState<null | { name: string; kind: "like" | "super" }>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const moved = useRef(false);
  const lastSeenStock = useRef<string | null>(null);
  const firstCardRecorded = useRef(false);
  const hydratedRecorded = useRef<Set<string>>(new Set());
  const matchTimer = useRef<number | null>(null);

  // 앞면 FOMO 신호 — ④ 정렬 때 풀 전체를 이미 받아 seed(initialFronts). 빠진 종목만 도달 시 lazy 보강.
  const [front, setFront] = useState<Record<string, FrontEntry>>(initialFronts ?? {});
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!initialFronts) return;
    setFront((prev) => ({ ...prev, ...initialFronts }));
  }, [initialFronts]);

  const at = (i: number) => deckCards[((i % deckCards.length) + deckCards.length) % deckCards.length]!;

  const ensureFront = useCallback(
    (card: DeckCard) => {
      if (!isStockCard(card)) return;
      const stock = card.data;
      const key = stock.canonical;
      if (front[key] || inflight.current.has(key)) return;
      if (!stock.naverCode && !stock.symbol) {
        setFront((prev) => ({
          ...prev,
          [key]: { signals: {}, fomo: EMPTY_FOMO, sparkline: [] },
        }));
        return;
      }
      inflight.current.add(key);
      fetchStockFront(key, {
        lite: true,
        ...(stock.naverCode ? { naverCode: stock.naverCode } : {}),
        ...(stock.symbol ? { symbol: stock.symbol } : {}),
      })
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
  const cardFor = (stock: DeckStock): { view: FomoCardView; subLine?: string; usedDiscoveryHeadline?: boolean } => {
    const e = front[stock.canonical];
    const serverHeadline = cleanServerHeadline(stock.headline);
    if (!e) {
      const view: FomoCardView = {
        scoreText: "",
        emoji: "",
        badge: "신호 확인 중",
        headline: serverHeadline ?? "카드 준비 중",
        tone: "calm",
        isLeading: false,
      };
      return { view, ...(serverHeadline ? { usedDiscoveryHeadline: true } : { subLine: "카드 내용을 준비하고 있어요." }) };
    }
    const fomo = e?.fomo ?? EMPTY_FOMO;
    const signalsForHook: CardFrontSignals = {
      ...(e?.signals ?? {}),
      ...(!e?.signals.newsEventLabel && serverHeadline ? { newsEventLabel: serverHeadline } : {}),
    };
    const legacyHook = selectFomoHook({
      fomo,
      signals: signalsForHook,
      ...(e?.taFact ? { taFact: e.taFact } : {}),
    });
    const baseView = fomoCardView(fomo, {
      sector: stock.sector,
      ...(stock.reason ? { reason: stock.reason } : {}),
      ...(typeof e?.signals.changePct === "number" ? { changePct: e.signals.changePct } : {}),
      ...(typeof e?.signals.marketCapRank?.rank === "number" ? { marketCapRank: e.signals.marketCapRank.rank } : {}),
    });
    const headline = serverHeadline ?? "카드 준비 중";
    const view = { ...baseView, headline };
    const usedDiscoveryHeadline = !!serverHeadline;
    return {
      view,
      ...(!usedDiscoveryHeadline && legacyHook.subLine ? { subLine: legacyHook.subLine } : {}),
      ...(usedDiscoveryHeadline ? { usedDiscoveryHeadline } : {}),
    };
  };
  const rankLabelFor = (stock: DeckStock): string | undefined => {
    void stock;
    return undefined;
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
  const renderFace = (card: DeckCard, progress?: string) => {
    if (card.type === "sector") return <SectorCard card={card.data} progress={progress} />;
    if (card.type === "narrative") return <NarrativeCard card={card.data} progress={progress} />;
    if (card.type === "content") return <ContentCard card={card.data} progress={progress} />;
    const stock = card.data;
    const e = front[stock.canonical];
    if (!e) {
      return <StockCardLoadingFace stock={stock} themeLabel={stock.sector} progress={progress} />;
    }
    const { view, subLine, usedDiscoveryHeadline } = cardFor(stock);
    const deduped = dedupeCardCopy({
      headline: view.headline,
      why: usedDiscoveryHeadline ? undefined : whyFor(stock),
      feedBull: e?.feedBull,
      feedBear: e?.feedBear,
      subLine,
      preserveGroundedReason: false,
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
        chartSupported={(e?.sparkline?.length ?? 0) >= 2}
        subLine={deduped.subLine}
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

  // 매칭 모먼트 — 짧게 띄우고 자동 해제(애니메이션 끔 설정이면 더 짧게).
  const fireMatch = useCallback((name: string, kind: "like" | "super") => {
    if (matchTimer.current) window.clearTimeout(matchTimer.current);
    setMatchMoment({ name, kind });
    matchTimer.current = window.setTimeout(() => setMatchMoment(null), prefersReducedMotion() ? 650 : 1100);
  }, []);

  // 패스(좌) — 관심 없음, 다음 카드로. 저장 없음(로그인 불필요).
  const advance = useCallback(
    (dir: "left" | "right") => {
      const card = at(idx);
      if (!isStockCard(card)) {
        setUndoEntry({ idx, dir, card });
        if (card.type === "sector") recordTaste("theme", card.data.sector, dir === "right" ? "more" : "less");
        if (card.type === "narrative") recordTaste("stock", card.data.trigger.anchorTicker, dir === "right" ? "more" : "less");
        recordDiscoveryEvent("swipe", { direction: dir, hydrated: true });
        flingNext(dir);
        return;
      }
      const stock = card.data;
      setUndoEntry({ idx, dir, card });
      if (dir === "right") saveDiscovery(stock);
      recordDiscoveryEvent("swipe", { direction: dir, hydrated: !!front[stock.canonical] });
      recordStockInterest(stock.canonical, dir === "right" ? "more" : "less", Date.now());
      recordTaste("stock", stock.canonical, dir === "right" ? "more" : "less"); // 트랙 B 적재
      flingNext(dir);
    },
    [idx, deckCards, flingNext, front]
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

  // 관심(우/관심버튼)·슈퍼관심(위/별버튼) 공통 — 매칭 모먼트 띄운 뒤 상세(뎁스) 페이지로 진입.
  // 비로그인은 로그인 유도 후 스냅백(저장·매칭 없음). kind는 매칭 모먼트 표현만 다름(하트/별).
  const interest = useCallback((kind: "like" | "super") => {
    const card = at(idx);
    if (!isStockCard(card)) {
      if (card.type === "sector") {
        recordTaste("theme", card.data.sector, "more");
        fireMatch(`${card.data.sector} 섹터`, kind);
      } else if (card.type === "narrative") {
        recordTaste("stock", card.data.trigger.anchorTicker, "more");
        fireMatch("사건 흐름", kind);
      } else {
        fireMatch(card.data.contentType === "whale" ? "고래 동향" : "시장 메모", kind);
      }
      recordDiscoveryEvent("swipe", { direction: "right", hydrated: true });
      flingNext("right");
      return;
    }
    const stock = card.data;
    if (!loggedIn && onRequireLogin) {
      onRequireLogin();
      setDx(0);
      setDy(0);
      return;
    }
    saveDiscovery(stock);
    recordDiscoveryEvent("swipe", { direction: "right", hydrated: !!front[stock.canonical] });
    recordStockInterest(stock.canonical, "more", Date.now());
    recordTaste("stock", stock.canonical, "more");
    fireMatch(stock.canonical, kind);
    // 상세 진입 — source "card"(중복 저장 없음). 진입 직전 fling 상태 정리.
    const openAfter = () => {
      setExiting(null);
      setDx(0);
      setDy(0);
      openDepth(stock, "card");
    };
    if (prefersReducedMotion()) {
      openAfter();
      return;
    }
    // 카드 날리는 연출(관심=우로, 슈퍼관심=위로) — 스와이프·버튼 완전 동일. 날아간 뒤 매칭 보고 상세로.
    setExiting(kind === "super" ? "up" : "right");
    window.setTimeout(openAfter, 760);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, deckCards, front, fireMatch, loggedIn, onRequireLogin]);

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
    if (selected) setUndoEntry({ idx, dir: "left", card: { type: "stock", data: selected } });
    setSelected(null);
    window.setTimeout(() => flingNext("left"), 40);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting || restoring) return;
    const current = at(idx);
    if (isStockCard(current) && !front[current.data.canonical]) return;
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
    // 위로 크게 끌면 슈퍼관심(좌우보다 우선). 우=관심, 좌=패스.
    if (dy < -UP_THRESHOLD && Math.abs(dy) > Math.abs(dx)) interest("super");
    else if (dx > THRESHOLD) interest("like");
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
  }, [deckCards]);

  useEffect(() => {
    const card = at(idx);
    const stock = cardKey(card);
    if (!firstCardRecorded.current) {
      firstCardRecorded.current = true;
      recordDiscoveryEvent("first_card_display");
    }
    if (lastSeenStock.current === stock) return;
    lastSeenStock.current = stock;
    if (isStockCard(card)) recordStockInterest(card.data.canonical, "seen", Date.now());
  }, [idx, deckCards]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const card = at(idx);
    if (!isStockCard(card)) return;
    const stock = card.data.canonical;
    if (!front[stock] || hydratedRecorded.current.has(stock)) return;
    hydratedRecorded.current.add(stock);
    recordDiscoveryEvent("card_hydrate");
  }, [idx, front, deckCards]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const topReady = isStockCard(top) ? !!front[top.data.canonical] : true;

  return (
    <div className="w-full">
      <div className="relative mx-auto h-[52svh] min-h-[380px] max-h-[520px] w-full select-none sm:min-h-[420px]">
        {/* 다음 카드 — 뒤에 살짝 드러나는 스택(틴더식 peek). 위 카드가 불투명이라 body 통과 비침은 없음. */}
        {deckCards.length > 1 && (
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
            if (topReady && isStockCard(top) && !moved.current && !exiting && !restoring) openDepth(top.data, "card");
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
          {renderFace(top, `${(idx % deckCards.length) + 1} / ${deckCards.length}`)}
        </div>

        {/* 매칭 모먼트 — 관심/슈퍼관심 확인 연출(담담·자동 해제). 투자 신호 아님. */}
        {matchMoment && (
          <div className="fomo-match-pop pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-2xl bg-canvas/70 backdrop-blur-sm">
            <span style={{ color: NEON }}>
              {matchMoment.kind === "super" ? <StarIcon size={64} /> : <HeartIcon size={64} />}
            </span>
            <span className="font-number text-lg font-bold text-whiteout">{matchMoment.name}</span>
            <span className="text-sm text-muted">
              {matchMoment.kind === "super" ? "슈퍼 관심으로 담았어요" : "관심에 담았어요"}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={undoLast}
          disabled={!!exiting || restoring || !undoEntry}
          aria-label={undoEntry ? `${cardLabel(undoEntry.card)} 카드로 돌아가기` : "이전 카드 없음"}
          title={undoEntry ? `${cardLabel(undoEntry.card)} 다시 보기` : "이전 카드 없음"}
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
          onClick={() => interest("super")}
          disabled={!!exiting || restoring || !topReady}
          aria-label="슈퍼 관심"
          title="슈퍼 관심"
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 bg-surface-raised transition-colors disabled:opacity-40"
          style={{ borderColor: NEON, color: NEON }}
        >
          <StarIcon size={26} />
        </button>
        <button
          onClick={() => interest("like")}
          disabled={!!exiting || restoring || !topReady}
          aria-label="관심"
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
            ...(selected.sourceLabel ? { sourceLabel: selected.sourceLabel } : {}),
            ...(selected.sourceUrl ? { sourceUrl: selected.sourceUrl } : {}),
            ...(selected.naverCode ? { naverCode: selected.naverCode } : {}),
            ...(selected.symbol ? { symbol: selected.symbol } : {}),
            market: selected.market,
            country: selected.country,
            ...(front[selected.canonical] ? { frontSeed: front[selected.canonical] as StockFrontResponse } : {}),
            ...(axisHeadlineFor(selected) ? { axisHeadline: axisHeadlineFor(selected) } : {}),
          }}
          onClose={closeDepth}
        />
      )}
    </div>
  );
}
