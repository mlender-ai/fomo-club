"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatSignalResumeBadge,
  inferStandardSignalTypes,
  isSignalTypeCode,
  normalizeSignalTypeCodes,
  signalTypeLabel,
} from "@fomo/core";
import type {
  AxisSignal,
  CardFrontSignals,
  CardVerdict,
  CompanyScoreResult,
  MultiAxisHookSelection,
  TaFact,
  SignalTypeCode,
} from "@fomo/core";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { ContentCard } from "@/components/ContentCard";
import { NarrativeCard } from "@/components/NarrativeCard";
import { NarrativeDepthPage } from "@/components/NarrativeDepthPage";
import { SectorCard } from "@/components/SectorCard";
import { fetchStockFront } from "@/lib/fomoApi";
import type { FeedSignalPoint, StockFrontResponse, TrackMetric } from "@/lib/fomoApi";
import { recordDiscoveryDepth, recordDiscoverySeen, markDiscoverySeenAction } from "@/lib/discoveryPerformance";
import { upsertWatch } from "@/lib/watchlist";
import type { DeckNarrative, DeckStock } from "@/lib/discoveryDeck";
import { stockDeckCards, type DeckCard, type DeckThemeBundle, type DiscoveryDeckCard } from "@/lib/discoveryDeck";
import { whyShown } from "@/lib/whyShown";
import { dedupeCardCopy } from "@/lib/cardCopyDedupe";
import { recordDiscoveryEvent } from "@/lib/discoveryMetrics";
import { isKrStockCode, stockLogoApiSrcForStock } from "@/lib/stockLogo";
import { verdictBalance } from "@/lib/discoveryPresentation";
import { GemIcon, StarIcon, CaretUpIcon, CaretDownIcon, UndoIcon, HeartIcon, XMarkIcon } from "@/components/icons";
import { chartTokens } from "@/lib/chartTokens";

/**
 * 공통 종목 무한 스와이프 덱.
 * TodayDiscoveryDeck/SectorStockDeck 이 같은 손맛과 lazy hydrate 정책을 공유한다.
 * stock-front 는 현재 카드와 다음 카드만 lazy hydrate 한다.
 */
const THRESHOLD = 90;
const UP_THRESHOLD = 90; // 위로 끌어 슈퍼관심(강한 관심)
const EXIT_MS = 320;
// DESIGN.md §2 브랜드 액센트(역할 인코딩). 오렌지=주목 열기/강도, 네온=발견·💎·CTA. 등락엔 절대 금지.
const NEON = chartTokens.up;
type CardFaceView = { headline: string; isLeading: boolean };

/** 종목별 앞면 데이터(stock-front 응답 캐시). 종합점수·스파크라인·가격. */
export type FrontEntry = {
  signals: CardFrontSignals;
  score?: CompanyScoreResult;
  committeeReview?: NonNullable<StockFrontResponse["committeeReview"]>;
  taFact?: TaFact;
  sparkline: number[];
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  feedBull?: FeedSignalPoint;
  feedBear?: FeedSignalPoint;
  axisSignals?: AxisSignal[];
  axisHook?: MultiAxisHookSelection;
  verdict?: CardVerdict;
  wyckoff?: NonNullable<StockFrontResponse["wyckoff"]>;
  candles?: NonNullable<StockFrontResponse["candles"]>;
  chartSeries?: NonNullable<StockFrontResponse["chartSeries"]>;
  coinIssues?: NonNullable<StockFrontResponse["coinIssues"]>;
  coinCause?: NonNullable<StockFrontResponse["coinCause"]>;
  signalTypes?: SignalTypeCode[];
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

/** 상세·미니 차트와 같은 방향 토큰을 사용한다. */
const DIR_COLOR: Record<string, string> = { up: chartTokens.up, down: chartTokens.down, flat: chartTokens.neutral };

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
  const rows: Array<{ label: string; tone: string; point: FeedSignalPoint }> = [];
  if (bull) rows.push({ label: "강세", tone: chartTokens.up, point: bull });
  if (bear) rows.push({ label: "약세", tone: chartTokens.down, point: bear });
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

/** 카드에서는 종합점수와 조합 라벨만 가볍게 노출하고, 축별 산식은 뎁스에서 푼다. */
function CompanyScoreBlock({
  score,
  verdict,
  contextLine,
}: {
  score?: CompanyScoreResult | undefined;
  verdict?: CardVerdict | undefined;
  contextLine?: string | undefined;
}) {
  const balance = verdictBalance(verdict);
  return (
    <div className="mt-2.5 shrink-0 border-y border-hairline py-2.5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-number font-bold leading-none ${score?.score == null ? "text-lg" : "text-3xl"}`}
              style={{ color: NEON }}
            >
              {score?.score ?? "분석 축적 중"}
            </span>
            {score?.score != null && <span className="text-xs font-semibold text-muted">점</span>}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-whiteout">
            {score?.score == null ? `가용 분석축 ${score?.availableAxisCount ?? 0}/6` : score.label}
          </p>
        </div>
        {balance && <span className="text-[10px] font-medium" style={{ color: balance.color }}>{balance.label}</span>}
      </div>
      {contextLine && (
        <p className="mt-1.5 text-xs leading-4 text-whiteout" style={clampStyle(1)}>
          <span className="text-muted">포착 근거 · </span>{contextLine}
        </p>
      )}
    </div>
  );
}

/**
 * 종목 카드 앞면 — 백엔드가 확정한 종합점수·라벨·헤드라인을 그대로 표시한다.
 * 정체성 / 현재가 / 테마태그 / 헤드라인 / 발견 상태 / 근거. 차트는 뎁스에서만 보여준다.
 */
function StockCardFace({
  stock,
  view,
  themeLabel,
  priceText,
  changeText,
  changeDir,
  rankLabel,
  subLine,
  feedBull,
  feedBear,
  why,
  score,
  discoveryContext,
  verdict,
  signalTrack,
  personalStrongSignal,
  progress,
}: {
  stock: DeckStock;
  view: CardFaceView;
  themeLabel?: string | undefined;
  priceText?: string | undefined;
  changeText?: string | undefined;
  changeDir?: "up" | "down" | "flat" | undefined;
  rankLabel?: string | undefined;
  subLine?: string | undefined;
  feedBull?: FeedSignalPoint | undefined;
  feedBear?: FeedSignalPoint | undefined;
  why?: string | undefined;
  score?: CompanyScoreResult | undefined;
  discoveryContext?: string | undefined;
  verdict?: CardVerdict | undefined;
  signalTrack?: { code: SignalTypeCode; metric: TrackMetric } | undefined;
  personalStrongSignal?: SignalTypeCode | undefined;
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

      {/* 현재가 — 시장 readout. */}
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

      <CompanyScoreBlock score={score} verdict={verdict} contextLine={discoveryContext} />

      {!verdict && (
        <>
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
        </>
      )}

      {verdict && <FeedSignalStrip bull={feedBull} bear={feedBear} />}

      {signalTrack && (
        <p className="mt-2 shrink-0 text-[11px] leading-4 text-muted">
          {formatSignalResumeBadge(signalTrack.code, signalTrack.metric)}
        </p>
      )}

      {personalStrongSignal && (
        <p className="mt-1 shrink-0 text-[11px] font-semibold leading-4" style={{ color: NEON }}>
          당신이 강한 신호 · {signalTypeLabel(personalStrongSignal)}
        </p>
      )}

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
  signalHistory30?: Record<string, TrackMetric> | undefined;
  strongSignalCodes?: string[] | undefined;
}

export function StockSwipeDeck({
  cards,
  stocks,
  initialFronts,
  contextLabel,
  loggedIn,
  onRequireLogin,
  signalHistory30,
  strongSignalCodes = [],
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
  const [selectedNarrative, setSelectedNarrative] = useState<DeckNarrative | null>(null);
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
  // 진행 중 연출 타이머(플링/열기) — 언마운트 후 발화하면 사라진 덱에서 setState/openDepth 가 돈다 → 전부 정리.
  const pendingTimers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const t of pendingTimers.current) window.clearTimeout(t);
      if (matchTimer.current) window.clearTimeout(matchTimer.current);
    },
    []
  );

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
          [key]: { signals: {}, sparkline: [] },
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
              signals: d.signals ?? {},
              ...(d.score ? { score: d.score } : {}),
              ...(d.taFact ? { taFact: d.taFact } : {}),
              sparkline: d.sparkline,
              ...(d.priceText ? { priceText: d.priceText } : {}),
              ...(d.changeText ? { changeText: d.changeText } : {}),
              ...(d.changeDir ? { changeDir: d.changeDir } : {}),
              ...(d.feedBull ? { feedBull: d.feedBull } : {}),
              ...(d.feedBear ? { feedBear: d.feedBear } : {}),
              ...(d.axisSignals ? { axisSignals: d.axisSignals } : {}),
              ...(d.axisHook ? { axisHook: d.axisHook } : {}),
              ...(d.verdict ? { verdict: d.verdict } : {}),
              ...(d.wyckoff ? { wyckoff: d.wyckoff } : {}),
              ...(d.coinIssues ? { coinIssues: d.coinIssues } : {}),
              ...(d.coinCause ? { coinCause: d.coinCause } : {}),
              ...(prev[key]?.signalTypes ? { signalTypes: prev[key]!.signalTypes } : {}),
            },
          }))
        )
        .catch((err) => console.warn("[StockSwipeDeck] stock-front failed", key, err))
        .finally(() => inflight.current.delete(key));
    },
    [front]
  );

  // 긴 원문 재료는 why/depth 로 보내고, 앞면은 백엔드가 확정한 핵심 헤드라인만 쓴다.
  const cardFor = (stock: DeckStock): { view: CardFaceView; subLine?: string; usedDiscoveryHeadline?: boolean } => {
    const e = front[stock.canonical];
    const serverHeadline = cleanServerHeadline(stock.headline);
    if (!e) {
      const view: CardFaceView = {
        headline: serverHeadline ?? "카드 준비 중",
        isLeading: false,
      };
      return { view, ...(serverHeadline ? { usedDiscoveryHeadline: true } : { subLine: "카드 내용을 준비하고 있어요." }) };
    }
    const headline = serverHeadline ?? "카드 준비 중";
    const view: CardFaceView = { headline, isLeading: false };
    const usedDiscoveryHeadline = !!serverHeadline;
    return {
      view,
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
      signals: e?.signals,
    });
  };
  const axisHeadlineFor = (stock: DeckStock): string | undefined =>
    stock.axisHook?.hookText ?? front[stock.canonical]?.axisHook?.hookText;
  const saveDiscovery = (stock: DeckStock) => {
    upsertWatch(stock.canonical, Date.now(), { sector: stock.sector, reason: whyFor(stock) });
  };
  const signalTrackFor = (stock: DeckStock, entry: FrontEntry | undefined): { code: SignalTypeCode; metric: TrackMetric } | undefined => {
    if (!entry || !signalHistory30) return undefined;
    const stored = normalizeSignalTypeCodes(entry.signalTypes ?? []);
    const candidates = stored.length > 0
      ? stored
      : inferStandardSignalTypes({
          ...(stock.headline ? { headline: stock.headline } : {}),
          ...(stock.reason ?? stock.whyShown ? { reason: stock.reason ?? stock.whyShown } : {}),
          ...(stock.sourceLabel ? { sourceLabel: stock.sourceLabel } : {}),
          ...(stock.sourceUrl ? { sourceUrl: stock.sourceUrl } : {}),
          signals: entry.signals,
          ...(entry.wyckoff ? { wyckoff: entry.wyckoff } : {}),
          ...(typeof entry.score?.score === "number" ? { companyScore: entry.score.score } : {}),
        });
    const code = candidates.find((value) => isSignalTypeCode(value) && signalHistory30[value]);
    return code ? { code, metric: signalHistory30[code]! } : undefined;
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
    const normalizedHeadline = view.headline.replace(/\s+/g, "").toLowerCase();
    const groundedContext = stock.reason?.trim();
    const discoveryContext =
      deduped.why ??
      deduped.feedBull?.text ??
      (groundedContext && groundedContext.replace(/\s+/g, "").toLowerCase() !== normalizedHeadline
        ? groundedContext
        : undefined);
    return (
      <StockCardFace
        stock={stock}
        view={view}
        themeLabel={stock.sector}
        priceText={e?.priceText}
        changeText={e?.changeText}
        changeDir={e?.changeDir}
        rankLabel={rankLabelFor(stock)}
        subLine={deduped.subLine}
        feedBull={deduped.feedBull}
        feedBear={deduped.feedBear}
        why={deduped.why}
        score={e.score}
        discoveryContext={discoveryContext}
        verdict={e?.verdict}
        signalTrack={signalTrackFor(stock, e)}
        personalStrongSignal={normalizeSignalTypeCodes(e.signalTypes ?? []).find((code) => strongSignalCodes.includes(code))}
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
    pendingTimers.current.push(
      window.setTimeout(() => {
        setExiting(null);
        setDx(0);
        setDy(0);
        setIdx((i) => i + 1);
      }, EXIT_MS)
    );
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
        recordDiscoveryEvent("swipe", { direction: dir, hydrated: true });
        flingNext(dir);
        return;
      }
      const stock = card.data;
      setUndoEntry({ idx, dir, card });
      // R1 후회 영수증: 스와이프 결과 기록(넘긴 카드 성과 복기용). 발견가는 recordDiscoverySeen 이 캡처.
      markDiscoverySeenAction(stock.canonical, dir === "right" ? "save" : "skip");
      if (dir === "right") saveDiscovery(stock);
      recordDiscoveryEvent("swipe", { direction: dir, hydrated: !!front[stock.canonical] });
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
        fireMatch(`${card.data.sector} 섹터`, kind);
      } else if (card.type === "narrative") {
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
    markDiscoverySeenAction(stock.canonical, "save");
    recordDiscoveryEvent("swipe", { direction: "right", hydrated: !!front[stock.canonical] });
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
    pendingTimers.current.push(window.setTimeout(openAfter, 760));
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
    recordDiscoveryDepth(stock.canonical);
    setSelected(stock);
  };
  const closeDepth = () => {
    if (selected) setUndoEntry({ idx, dir: "left", card: { type: "stock", data: selected } });
    setSelected(null);
    window.setTimeout(() => flingNext("left"), 40);
  };
  const openNarrativeDepth = (card: DeckNarrative) => {
    recordDiscoveryEvent("depth_open");
    setSelectedNarrative(card);
  };
  const closeNarrativeDepth = () => {
    if (selectedNarrative) setUndoEntry({ idx, dir: "left", card: { type: "narrative", data: selectedNarrative } });
    setSelectedNarrative(null);
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
    if (isStockCard(card)) {
      const now = Date.now();
      recordDiscoverySeen(card.data, now, {
        ...(front[card.data.canonical] ? { front: front[card.data.canonical] } : {}),
      });
    }
  }, [idx, deckCards, front]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const card = at(idx);
    if (!isStockCard(card)) return;
    const stock = card.data.canonical;
    if (!front[stock] || hydratedRecorded.current.has(stock)) return;
    hydratedRecorded.current.add(stock);
    recordDiscoverySeen(card.data, Date.now(), { front: front[stock], reason: whyFor(card.data) });
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {/* 풀스크린 틴더 카드(WO 1.5 E) — 부모 flex 안에서 남는 높이를 전부 차지. max-h 캡 제거(잘림 방지). */}
      <div className="relative mx-auto min-h-[52svh] w-full flex-1 select-none">
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
            if (!topReady || moved.current || exiting || restoring) return;
            if (isStockCard(top)) openDepth(top.data, "card");
            else if (top.type === "narrative") openNarrativeDepth(top.data);
          }}
          className="absolute inset-0 z-10 cursor-pointer overflow-hidden rounded-2xl border border-hairline-soft bg-surface-raised px-6 py-7"
          // touch-action: none — iOS(특히 standalone PWA)가 가로 드래그를 스크롤·뒤로가기 제스처로
          // 가로채 pointermove 가 안 오던 스와이프 불능 해소. 카드 위 제스처는 덱이 전담한다.
          style={{ transform: topTransform, transition: topTransition, touchAction: "none" }}
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

      <div className="mt-4 flex shrink-0 items-center justify-center gap-4">
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
      {selectedNarrative && <NarrativeDepthPage card={selectedNarrative} onClose={closeNarrativeDepth} />}
    </div>
  );
}
