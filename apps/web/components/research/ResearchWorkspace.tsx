"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import {
  findResearchTickerOption,
  formatResearchDateTime,
  getResearchSectorLabel,
  inferResearchTickerInputMarket,
  inferResearchTickerMarket,
  normalizeResearchPreferences,
  normalizeResearchTicker,
  researchSectorOptions,
  researchTickerOptions,
  type ResearchBehaviorEventName,
  type ResearchBehaviorSummary,
  type PatternConfidence,
  type ProductReviewNote,
  type ProductImplementationStatus,
  type ResearchNewsItem,
  type ResearchPipelineStep,
  type ResearchPipelineTranscriptMessage,
  type ResearchPriority,
  type ResearchSectorTag,
  type ResearchTab,
  type ResearchTickerInputMarket,
  type ResearchTickerMarket,
  type ResearchWorkspaceData,
  type TickerAnalysis,
  type UserResearchPreferences
} from "@fomo/shared/src/research";
import type { GeneratedResearchSnapshot } from "@fomo/shared/src/researchPipeline";

const STORAGE_KEY = "research-preferences-v1";
const DEFAULT_NEWS_IMAGE = "/news/default-cover.svg";
const BEHAVIOR_API_PATH = "/api/research/behavior";
type TickerMarketFilter = "ALL" | ResearchTickerMarket;
type BriefingRoutineStep = {
  id: string;
  label: string;
  title: string;
  detail: string;
  cta: string;
  href?: string | null;
  onClick?: () => void;
};

interface TickerSearchResult {
  ticker: string;
  label: string;
  market: ResearchTickerMarket;
  exchange: string;
  tradingViewSymbol: string;
  sectorTag: ResearchSectorTag | null;
  typeLabel: string | null;
}

const TICKER_LOGO_DOMAINS: Record<string, string> = {
  NVDA: "nvidia.com",
  AMD: "amd.com",
  TSM: "tsmc.com",
  XOM: "exxonmobil.com",
  CVX: "chevron.com",
  SLB: "slb.com",
  "005930": "samsung.com",
  "000660": "skhynix.com",
  "042700": "hanmisemi.com",
  "010950": "s-oil.com",
  "096770": "skinnovation.com"
};

const SECTOR_SEARCH_ALIASES: Record<ResearchSectorTag, string> = {
  semiconductors: "semi semiconductor chip gpu hbm memory 반도체 메모리 엔비디아",
  "energy-oil": "oil energy crude opec refinery 오일 에너지 정유",
  "ai-infra": "data center datacenter power cooling ai infra 데이터센터 전력 냉각",
  "industrial-tech": "industrial automation robot factory 산업 자동화 로봇",
  "ev-mobility": "ev electric vehicle robotaxi tesla rivian 전기차 자동차 테슬라",
  "battery-chain": "battery lithium cell cathode anode 배터리 리튬 양극재"
};

function toggleStringValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function sameResearchPreferences(left: UserResearchPreferences, right: UserResearchPreferences) {
  return left.sectors.join(",") === right.sectors.join(",") && left.tickers.join(",") === right.tickers.join(",");
}

function buildPreferencesParams(preferences: UserResearchPreferences) {
  const params = new URLSearchParams();

  if (preferences.sectors.length > 0) {
    params.set("sectors", preferences.sectors.join(","));
  }

  if (preferences.tickers.length > 0) {
    params.set("tickers", preferences.tickers.join(","));
  }

  return params;
}

function getPriorityLabel(priority: ResearchPriority) {
  switch (priority) {
    case "critical":
      return "최우선";
    case "focus":
      return "핵심";
    default:
      return "관찰";
  }
}

function getConfidenceLabel(confidence: PatternConfidence) {
  switch (confidence) {
    case "high":
      return "높음";
    case "medium":
      return "보통";
    default:
      return "낮음";
  }
}

function getImplementationStatusLabel(status: ProductImplementationStatus) {
  switch (status) {
    case "ready":
      return "구현 준비";
    case "in-progress":
      return "구현 중";
    case "reviewing":
      return "리뷰 중";
    case "merged":
      return "반영 완료";
    default:
      return "대기";
  }
}

function getBehaviorMetric(summary: ResearchBehaviorSummary, eventName: ResearchBehaviorEventName) {
  return summary.metrics.find((metric) => metric.eventName === eventName) ?? null;
}

function getBehaviorInsight(summary: ResearchBehaviorSummary) {
  const headlineOpen = getBehaviorMetric(summary, "headline_open")?.count ?? 0;
  const stageContinue = getBehaviorMetric(summary, "stage_continue")?.count ?? 0;
  const tickerSelect = getBehaviorMetric(summary, "ticker_select")?.count ?? 0;
  const actionExpand = getBehaviorMetric(summary, "action_expand")?.count ?? 0;

  if (headlineOpen > 0 && stageContinue < headlineOpen) {
    return "헤드라인을 읽고 다음 단계로 넘어가기 전 이탈이 가장 크게 발생하고 있습니다.";
  }

  if (stageContinue > 0 && tickerSelect < stageContinue) {
    return "시황까지는 읽지만 티커 분석 선택으로 이어지지 않는 구간이 가장 약합니다.";
  }

  if (tickerSelect > 0 && actionExpand < tickerSelect) {
    return "티커까지는 보지만 실행 조건을 펼쳐 읽지 않는 사용자가 많습니다.";
  }

  return "핵심 단계 간 전환이 비교적 고르게 이어지고 있습니다.";
}

function compactCopy(text: string, maxLength = 120) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function formatUiNotice(message: string | null) {
  if (!message) {
    return null;
  }

  if (message.includes("429")) {
    return "일부 분석은 저장된 브리핑 기준으로 표시됩니다.";
  }

  if (/fallback|pipeline|provider|runtime/i.test(message)) {
    return null;
  }

  if (/업데이트했습니다|새로고침했습니다|다시 준비하고 있습니다|라이브 분석을 불러오는 중입니다/i.test(message)) {
    return null;
  }

  return message.replace(/\s*https?:\/\/\S+/g, "").trim();
}

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function formatPriceChange(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "변동 데이터 없음";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPrice(value)}`;
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getMarketLabel(analysis: TickerAnalysis) {
  return analysis.market === "KR" ? "국장" : "미국";
}

function getTickerMarketLabel(market: ResearchTickerMarket, exchange?: string) {
  if (market === "KR") {
    return exchange === "KOSDAQ" ? "코스닥" : "코스피";
  }

  return "미국";
}

function getDisplayTicker(ticker: string) {
  return ticker.replace(/\.KS$|\.KQ$/u, "");
}

function getTickerLogoUrl(ticker: string) {
  const domain = TICKER_LOGO_DOMAINS[getDisplayTicker(ticker)];
  return domain ? `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(domain)}` : null;
}

function getTickerDetailHref(ticker: string, market?: ResearchTickerMarket) {
  return `/ticker/${encodeURIComponent(getDisplayTicker(ticker))}${market ? `?market=${market}` : ""}`;
}

function getSectorDetailHref(sector: ResearchSectorTag) {
  return `/sector/${sector}`;
}

function inferInputMarketFromTickerResult(result: Pick<TickerSearchResult, "ticker" | "market" | "exchange">): ResearchTickerInputMarket {
  if (result.market === "US") {
    return "US";
  }

  return result.ticker.endsWith(".KQ") || result.exchange === "KOSDAQ" ? "KOSDAQ" : "KRX";
}

function upsertAvailableTicker(
  options: ResearchWorkspaceData["availableTickers"],
  nextOption: ResearchWorkspaceData["availableTickers"][number]
) {
  return [
    nextOption,
    ...options.filter((item) => item.ticker !== nextOption.ticker)
  ].sort((left, right) => {
    if (left.market !== right.market) {
      return left.market === "US" ? -1 : 1;
    }

    return left.ticker.localeCompare(right.ticker);
  });
}

function TickerLogo({ ticker, label }: { ticker: string; label: string }) {
  const [hasError, setHasError] = useState(false);
  const logoUrl = getTickerLogoUrl(ticker);

  if (!logoUrl || hasError) {
    return <span className="ticker-logo-fallback">{label.slice(0, 1)}</span>;
  }

  return <img alt={`${label} logo`} className="ticker-logo-image" onError={() => setHasError(true)} src={logoUrl} />;
}

function TickerSparkline({ analysis, tone = "neutral" }: { analysis: TickerAnalysis; tone?: "neutral" | "card" }) {
  const points = analysis.chartSeries ?? [];

  if (points.length < 2) {
    return <div className={`ticker-sparkline empty ${tone}`} />;
  }

  const width = 180;
  const height = 54;
  const padding = 4;
  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const step = (width - padding * 2) / Math.max(points.length - 1, 1);
  const polyline = points
    .map((point, index) => {
      const x = padding + step * index;
      const y = height - padding - ((point.close - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg aria-hidden="true" className={`ticker-sparkline ${tone}`} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" points={polyline} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  );
}

function FocusTickerCard({
  analysis,
  exchange,
  label,
  market,
  ticker,
  active = false,
  onClick
}: {
  analysis?: TickerAnalysis | null;
  exchange?: string | undefined;
  label: string;
  market: ResearchTickerMarket;
  ticker: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const resolvedMarket = analysis ? getMarketLabel(analysis) : getTickerMarketLabel(market, exchange);
  const resolvedLabel = analysis?.company ?? label;

  return (
    <button className={`focus-ticker-card ${active ? "active" : ""}`} onClick={onClick} type="button">
      <div className="focus-ticker-head">
        <div className="focus-ticker-ident">
          <span className="ticker-logo-shell">
            <TickerLogo label={resolvedLabel} ticker={ticker} />
          </span>
          <div>
            <strong>{getDisplayTicker(ticker)}</strong>
            <span>
              {resolvedLabel} · {resolvedMarket}
            </span>
          </div>
        </div>
        {analysis ? (
          <div className={`focus-ticker-change ${(analysis.priceChangePercent ?? 0) >= 0 ? "positive" : "negative"}`}>
            <strong>{formatPrice(analysis.latestPrice)}</strong>
            <span>{formatPercent(analysis.priceChangePercent) ?? "-"}</span>
          </div>
        ) : null}
      </div>
      {analysis ? <TickerSparkline analysis={analysis} tone="card" /> : <div className="watchlist-card-empty">차트 준비 중</div>}
    </button>
  );
}

function getTradingViewSymbol(analysis: TickerAnalysis) {
  if (analysis.tradingViewSymbol) {
    return analysis.tradingViewSymbol;
  }

  const option = findResearchTickerOption(analysis.ticker);

  if (option?.tradingViewSymbol) {
    return option.tradingViewSymbol;
  }

  if (analysis.ticker.endsWith(".KQ")) {
    return `KOSDAQ:${analysis.ticker.replace(".KQ", "")}`;
  }

  if (analysis.ticker.endsWith(".KS")) {
    return `KRX:${analysis.ticker.replace(".KS", "")}`;
  }

  return analysis.ticker;
}

function SignalPriceChart({ analysis }: { analysis: TickerAnalysis }) {
  const points = analysis.chartSeries ?? [];

  if (points.length < 2) {
    return (
      <div className="signal-chart-empty">
        <p>라이브 차트 데이터가 아직 부족합니다. 아래 TradingView 또는 다시 분석을 사용해 주세요.</p>
      </div>
    );
  }

  const width = 720;
  const height = 240;
  const padding = 14;
  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const step = (width - padding * 2) / Math.max(points.length - 1, 1);
  const polyline = points
    .map((point, index) => {
      const x = padding + step * index;
      const y = height - padding - ((point.close - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const area = `${padding},${height - padding} ${polyline} ${width - padding},${height - padding}`;

  return (
    <div className="signal-chart-shell">
      <div className="signal-chart-head">
        <div>
          <span className="eyebrow">차트 요약</span>
          <strong>
            {formatPrice(analysis.latestPrice)}
            {formatPercent(analysis.priceChangePercent) ? ` · ${formatPercent(analysis.priceChangePercent)}` : ""}
          </strong>
        </div>
        <div className={`signal-change-pill ${(analysis.priceChangePercent ?? 0) >= 0 ? "positive" : "negative"}`}>
          {formatPriceChange(analysis.priceChange)} {formatPercent(analysis.priceChangePercent) ?? ""}
        </div>
      </div>
      <svg aria-label={`${analysis.ticker} price chart`} className="signal-price-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={`signal-fill-${analysis.ticker}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(15, 76, 129, 0.24)" />
            <stop offset="100%" stopColor="rgba(15, 76, 129, 0.02)" />
          </linearGradient>
        </defs>
        <path d={`M ${area}`} fill={`url(#signal-fill-${analysis.ticker})`} />
        <polyline fill="none" points={polyline} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      </svg>
      <div className="signal-chart-foot">
        <span>{points[0] ? formatResearchDateTime(points[0].date) : "-"}</span>
        <span>{points[points.length - 1] ? formatResearchDateTime(points[points.length - 1]!.date) : "-"}</span>
      </div>
    </div>
  );
}

function TradingViewFrame({ analysis }: { analysis: TickerAnalysis }) {
  const symbol = getTradingViewSymbol(analysis);
  const src = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}&interval=60&hidesidetoolbar=1&hidelegend=1&symboledit=1&saveimage=0&toolbarbg=F8FAFC&theme=light&style=1&timezone=Asia%2FSeoul&withdateranges=1`;

  return (
    <div className="tradingview-shell">
      <div className="tradingview-head">
        <div>
          <span className="eyebrow">TradingView</span>
          <strong>
            {analysis.ticker} · {getMarketLabel(analysis)}
          </strong>
        </div>
        <a className="api-link" href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`} rel="noreferrer" target="_blank">
          크게 보기
        </a>
      </div>
      <iframe className="tradingview-frame" loading="lazy" src={src} title={`${analysis.ticker} TradingView chart`} />
    </div>
  );
}

function buildNewsLookup(workspace: ResearchWorkspaceData, supplementalNews: ResearchNewsItem[] = []) {
  const entries = [
    ...supplementalNews,
    workspace.news.headline,
    ...workspace.news.derivedArticles,
    ...workspace.news.sectorIssues.map((issue) => issue.item)
  ].filter((item): item is ResearchNewsItem => Boolean(item));

  return new Map(entries.map((item) => [item.id, item]));
}

function NewsVisual({ item, variant = "card" }: { item: ResearchNewsItem; variant?: "hero" | "card" | "mini" }) {
  return (
    <div className={`news-visual ${variant}`}>
      <img alt={item.title} src={item.imageUrl ?? DEFAULT_NEWS_IMAGE} />
      <div className="news-visual-overlay">
        <span>{getResearchSectorLabel(item.sectorTag)}</span>
      </div>
    </div>
  );
}

function NewsCard({ item }: { item: ResearchNewsItem }) {
  return (
    <article className="news-row">
      <NewsVisual item={item} variant="mini" />
      <div className="news-row-body">
        <div className="story-meta">
          <span className={`priority-pill priority-${item.priority}`}>{getPriorityLabel(item.priority)}</span>
          <span>{item.source}</span>
          <span>{formatResearchDateTime(item.publishedAt)}</span>
          <span className="story-score">{item.importanceScore}</span>
        </div>
        <h3>{item.title}</h3>
        <p className="news-row-why">
          <strong>왜 중요한가</strong>
          <span>{compactCopy(item.analysis, 132)}</span>
        </p>
        <div className="news-row-footer">
          <span className="decision-callout">{compactCopy(item.recommendation, 92)}</span>
          <span className="story-linked-tickers">{item.tickerTags.join(" · ")}</span>
        </div>
        {item.sourceUrl ? (
          <a className="news-row-link" href={item.sourceUrl} rel="noreferrer" target="_blank">
            원문 보기
          </a>
        ) : null}
      </div>
    </article>
  );
}

function PipelineStepCard({ step, order }: { step: ResearchPipelineStep; order: number }) {
  return (
    <article className="pipeline-card">
      <div className="pipeline-card-head">
        <div className="pipeline-meta">
          <span className="pipeline-order">0{order}</span>
          <div>
            <span className="eyebrow">{step.roleLabel}</span>
            <h3>{step.name}</h3>
          </div>
        </div>
        <span className="subtle-chip">{step.stage}</span>
      </div>
      <p className="pipeline-summary">{step.summary}</p>
      <ul className="pipeline-output-list">
        {step.outputLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="pipeline-handoff">{step.handoffNote}</p>
    </article>
  );
}

function ReviewNoteCard({ note }: { note: ProductReviewNote }) {
  return (
    <article className="review-card">
      <div className="review-card-head">
        <span className={`role-pill role-${note.role.toLowerCase()}`}>{note.role}</span>
        <strong>{note.title}</strong>
      </div>
      <ul className="review-list">
        {note.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {note.references.length > 0 ? <p className="review-references">참조 {note.references.join(" · ")}</p> : null}
    </article>
  );
}

function TranscriptMessageCard({ message, isLast }: { message: ResearchPipelineTranscriptMessage; isLast: boolean }) {
  return (
    <div className={`meeting-row ${isLast ? "last" : ""}`}>
      <div className="meeting-marker">
        <span className="eyebrow">{message.roleLabel}</span>
      </div>
      <article className="meeting-bubble section-panel">
        <div className="meeting-meta">
          <strong>{message.author}</strong>
          <span>{message.audience}</span>
        </div>
        <p>{message.summary}</p>
        <p>{message.text}</p>
        {message.references.length > 0 ? <p className="review-references">참조 {message.references.join(" · ")}</p> : null}
      </article>
    </div>
  );
}

export function ResearchWorkspace({ initialData }: { initialData: ResearchWorkspaceData }) {
  const [activeTab, setActiveTab] = useState<ResearchTab>("news");
  const [preferences, setPreferences] = useState<UserResearchPreferences>(initialData.preferences);
  const [workspace, setWorkspace] = useState<ResearchWorkspaceData>(initialData);
  const [selectedTicker, setSelectedTicker] = useState(initialData.focusedTickers[0] ?? "");
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [isRefreshingWorkspace, setIsRefreshingWorkspace] = useState(false);
  const [isAnalyzingTicker, setIsAnalyzingTicker] = useState(false);
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [tickerQuery, setTickerQuery] = useState("");
  const [tickerSearchResults, setTickerSearchResults] = useState<TickerSearchResult[]>([]);
  const [isSearchingTickers, setIsSearchingTickers] = useState(false);
  const [isSearchPaletteOpen, setIsSearchPaletteOpen] = useState(false);
  const [customTickerMarket, setCustomTickerMarket] = useState<ResearchTickerInputMarket>("US");
  const [customTickerSector, setCustomTickerSector] = useState<ResearchSectorTag>(initialData.preferences.sectors[0] ?? "semiconductors");
  const [tickerMarketFilter, setTickerMarketFilter] = useState<TickerMarketFilter>("ALL");
  const [supplementalNews, setSupplementalNews] = useState<ResearchNewsItem[]>([]);
  const [tickerNotice, setTickerNotice] = useState<string | null>(null);
  const [pipelineNotice, setPipelineNotice] = useState<string | null>(null);
  const [isActionPlanExpanded, setIsActionPlanExpanded] = useState(false);
  const [isHydratingMeeting, setIsHydratingMeeting] = useState(false);
  const trackedHeadlineRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const relatedNewsLookup = useMemo(() => buildNewsLookup(workspace, supplementalNews), [workspace, supplementalNews]);
  const activeAnalysis = useMemo(
    () => workspace.tickerAnalyses.find((analysis) => analysis.ticker === selectedTicker) ?? workspace.tickerAnalyses[0] ?? null,
    [selectedTicker, workspace.tickerAnalyses]
  );
  const visibleAvailableTickers = useMemo(() => {
    const filtered = tickerMarketFilter === "ALL" ? workspace.availableTickers : workspace.availableTickers.filter((ticker) => ticker.market === tickerMarketFilter);

    return [...filtered].sort((left, right) => {
      const leftActive = preferences.tickers.includes(left.ticker) ? 1 : 0;
      const rightActive = preferences.tickers.includes(right.ticker) ? 1 : 0;

      if (leftActive !== rightActive) {
        return rightActive - leftActive;
      }

      if (left.market !== right.market) {
        return left.market === "KR" ? 1 : -1;
      }

      return left.ticker.localeCompare(right.ticker);
    });
  }, [preferences.tickers, tickerMarketFilter, workspace.availableTickers]);
  const filteredAnalyzedTickers = useMemo(() => {
    const query = tickerQuery.trim().toLowerCase();
    const filteredByMarket =
      tickerMarketFilter === "ALL"
        ? workspace.tickerAnalyses
        : workspace.tickerAnalyses.filter((analysis) => analysis.market === tickerMarketFilter);

    if (!query) {
      return filteredByMarket;
    }

    return filteredByMarket.filter((analysis) => {
      const tickerCode = getDisplayTicker(analysis.ticker).toLowerCase();
      return tickerCode.includes(query) || analysis.company.toLowerCase().includes(query);
    });
  }, [tickerMarketFilter, tickerQuery, workspace.tickerAnalyses]);
  const filteredAvailableTickers = useMemo(() => {
    const query = tickerQuery.trim().toLowerCase();

    if (!query) {
      return visibleAvailableTickers;
    }

    return visibleAvailableTickers.filter((ticker) => {
      const tickerCode = getDisplayTicker(ticker.ticker).toLowerCase();
      return tickerCode.includes(query) || ticker.label.toLowerCase().includes(query);
    });
  }, [tickerQuery, visibleAvailableTickers]);
  const matchedSectorResults = useMemo(() => {
    const query = tickerQuery.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return researchSectorOptions.filter((sector) => {
      const haystack = `${sector.label} ${sector.description} ${SECTOR_SEARCH_ALIASES[sector.id] ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [tickerQuery]);
  const focusBoardTickers = useMemo(() => filteredAnalyzedTickers.slice(0, 5), [filteredAnalyzedTickers]);
  const paletteFavoriteTickers = useMemo(
    () => workspace.availableTickers.filter((ticker) => preferences.tickers.includes(ticker.ticker)).slice(0, 8),
    [preferences.tickers, workspace.availableTickers]
  );
  const newsletterHref = useMemo(() => {
    const params = new URLSearchParams();

    if (preferences.sectors.length > 0) {
      params.set("sectors", preferences.sectors.join(","));
    }

    if (preferences.tickers.length > 0) {
      params.set("tickers", preferences.tickers.join(","));
    }

    const query = params.toString();
    return query ? `/api/newsletter/daily?${query}` : "/api/newsletter/daily";
  }, [preferences]);
  const topHeadline = workspace.news.headline;
  const topStrongSector = workspace.agentPipeline.market.strongSectors[0] ?? null;
  const topRiskSector = workspace.agentPipeline.market.riskSectors[0] ?? null;
  const leadAction = workspace.agentPipeline.actionPlan.recommendedActions[0] ?? workspace.meeting.nextAction;
  const activeNotice = formatUiNotice(tickerNotice ?? pipelineNotice);
  const meetingNeedsHydration =
    workspace.agentPipeline.runtime.transcript.length === 0 || workspace.productReview.notes.length === 0 || workspace.productReview.actionItems.length === 0;
  const briefingTickers = useMemo(() => {
    const favorites = workspace.tickerAnalyses.filter((analysis) => preferences.tickers.includes(analysis.ticker));
    const fallback = workspace.tickerAnalyses.filter((analysis) => !preferences.tickers.includes(analysis.ticker));

    return [...favorites, ...fallback].slice(0, 3);
  }, [preferences.tickers, workspace.tickerAnalyses]);
  const leadTickerAnalysis = useMemo(() => {
    const headlineTicker = topHeadline?.tickerTags.find((ticker) => workspace.tickerAnalyses.some((analysis) => analysis.ticker === ticker)) ?? null;

    if (headlineTicker) {
      return workspace.tickerAnalyses.find((analysis) => analysis.ticker === headlineTicker) ?? activeAnalysis;
    }

    return activeAnalysis;
  }, [activeAnalysis, topHeadline, workspace.tickerAnalyses]);
  const routineSteps: BriefingRoutineStep[] = [
      {
        id: "headline",
        label: "헤드라인",
        title: topHeadline?.title ?? "핵심 헤드라인 대기",
        detail: topHeadline ? compactCopy(topHeadline.analysis, 90) : "선택한 섹터에서 먼저 읽을 핵심 뉴스가 비어 있습니다.",
        cta: "뉴스 보기",
        onClick: () => handleTabChange("news")
      },
      {
        id: "sector",
        label: "섹터 체크",
        title: topStrongSector ? `${topStrongSector.sector} 강세 확인` : "섹터 강약 대기",
        detail: topStrongSector
          ? compactCopy(topStrongSector.reason, 90)
          : "시황 해석이 더 쌓이면 강한 섹터와 리스크 섹터가 여기서 먼저 보입니다.",
        cta: "섹터 인사이트",
        href: topHeadline ? getSectorDetailHref(topHeadline.sectorTag) : null
      },
      {
        id: "ticker",
        label: "티커 판단",
        title: leadTickerAnalysis ? `${getDisplayTicker(leadTickerAnalysis.ticker)} 조건 확인` : "티커 분석 대기",
        detail: leadTickerAnalysis
          ? compactCopy(leadTickerAnalysis.recommendation, 90)
          : "집중 티커를 추가하면 여기서 바로 행동 조건을 이어서 확인할 수 있습니다.",
        cta: "티커 보기",
        onClick: () => {
          if (leadTickerAnalysis) {
            handleSelectTicker(leadTickerAnalysis.ticker);
          }
          handleTabChange("signals");
        }
      }
    ];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<UserResearchPreferences>;
      const nextPreferences = normalizeResearchPreferences(parsed);

      if (sameResearchPreferences(nextPreferences, initialData.preferences)) {
        return;
      }

      startTransition(() => {
        setPreferences(nextPreferences);
      });

      void refreshWorkspace(nextPreferences);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    async function syncFromStorage() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);

        if (!raw) {
          return;
        }

        const nextPreferences = normalizeResearchPreferences(JSON.parse(raw));

        if (sameResearchPreferences(nextPreferences, preferences)) {
          return;
        }

        setPreferences(nextPreferences);
        await refreshWorkspace(nextPreferences);
      } catch {
        // Ignore malformed storage sync payloads.
      }
    }

    function handlePreferenceUpdate() {
      void syncFromStorage();
    }

    window.addEventListener("storage", handlePreferenceUpdate);
    window.addEventListener("research-preferences-updated", handlePreferenceUpdate as EventListener);

    return () => {
      window.removeEventListener("storage", handlePreferenceUpdate);
      window.removeEventListener("research-preferences-updated", handlePreferenceUpdate as EventListener);
    };
  }, [preferences]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (!isSearchPaletteOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 30);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isSearchPaletteOpen]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchPaletteOpen((current) => !current);
        return;
      }

      if (event.key === "Escape") {
        setIsSearchPaletteOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  useEffect(() => {
    if (workspace.tickerAnalyses.some((analysis) => analysis.ticker === selectedTicker)) {
      return;
    }

    setSelectedTicker(workspace.tickerAnalyses[0]?.ticker ?? "");
  }, [selectedTicker, workspace.tickerAnalyses]);

  useEffect(() => {
    if (preferences.sectors.includes(customTickerSector)) {
      return;
    }

    setCustomTickerSector(preferences.sectors[0] ?? "semiconductors");
  }, [customTickerSector, preferences.sectors]);

  useEffect(() => {
    setIsActionPlanExpanded(false);
  }, [workspace.news.headline?.id]);

  useEffect(() => {
    if (activeTab !== "meeting" || !meetingNeedsHydration || isHydratingMeeting) {
      return;
    }

    const controller = new AbortController();

    async function hydrateMeetingData() {
      setIsHydratingMeeting(true);

      try {
        const params = buildPreferencesParams(preferences);
        const href = params.toString() ? `/api/research/pipeline?${params.toString()}` : "/api/research/pipeline";
        const response = await fetch(href, {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Meeting hydration failed with ${response.status}`);
        }

        const payload = (await response.json()) as GeneratedResearchSnapshot;

        if (!controller.signal.aborted) {
          startTransition(() => {
            setWorkspace(payload.workspace);
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPipelineNotice(error instanceof Error ? error.message : "회의 데이터 불러오기에 실패했습니다.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsHydratingMeeting(false);
        }
      }
    }

    void hydrateMeetingData();

    return () => {
      controller.abort();
    };
  }, [activeTab, isHydratingMeeting, meetingNeedsHydration, preferences]);

  useEffect(() => {
    const query = tickerQuery.trim();

    if (!query) {
      setTickerSearchResults([]);
      setIsSearchingTickers(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearchingTickers(true);

      try {
        const params = new URLSearchParams({ q: query });

        if (tickerMarketFilter !== "ALL") {
          params.set("market", tickerMarketFilter);
        }

        const response = await fetch(`/api/research/ticker-search?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Ticker search failed with ${response.status}`);
        }

        const payload = (await response.json()) as { results: TickerSearchResult[] };

        if (!controller.signal.aborted) {
          setTickerSearchResults(payload.results);
        }
      } catch {
        if (!controller.signal.aborted) {
          setTickerSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingTickers(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tickerMarketFilter, tickerQuery]);

  async function recordBehaviorEvent(eventName: ResearchBehaviorEventName, value?: string) {
    try {
      const response = await fetch(BEHAVIOR_API_PATH, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          eventName,
          value
        })
      });

      if (!response.ok) {
        return;
      }

      const summary = (await response.json()) as ResearchBehaviorSummary;
      startTransition(() => {
        setWorkspace((current) => ({
          ...current,
          behaviorSummary: summary
        }));
      });
    } catch {
      // Ignore best-effort analytics failures in the MVP.
    }
  }

  useEffect(() => {
    if (activeTab !== "news" || !workspace.news.headline?.id) {
      return;
    }

    if (trackedHeadlineRef.current === workspace.news.headline.id) {
      return;
    }

    trackedHeadlineRef.current = workspace.news.headline.id;
    void recordBehaviorEvent("headline_open", workspace.news.headline.id);
  }, [activeTab, workspace.news.headline?.id]);

  async function refreshWorkspace(nextPreferences: UserResearchPreferences) {
    const normalized = normalizeResearchPreferences(nextPreferences);
    const params = buildPreferencesParams(normalized);

    startTransition(() => {
      setPreferences(normalized);
    });
    setSupplementalNews([]);
    setTickerNotice(null);

    setIsRefreshingWorkspace(true);

    try {
      const href = params.toString() ? `/api/research/pipeline?${params.toString()}` : "/api/research/pipeline";
      const response = await fetch(href, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Workspace request failed with ${response.status}`);
      }

      const payload = (await response.json()) as GeneratedResearchSnapshot;

      startTransition(() => {
        setWorkspace(payload.workspace);
        setPreferences(payload.workspace.preferences);
        setSelectedTicker((current) => (payload.workspace.tickerAnalyses.some((analysis) => analysis.ticker === current) ? current : payload.workspace.focusedTickers[0] ?? ""));
      });
      setSupplementalNews([]);

      setPipelineNotice(payload.warnings.length > 0 ? payload.warnings.join(" ") : null);
    } catch (error) {
      setPipelineNotice(error instanceof Error ? error.message : "실데이터 불러오기에 실패했습니다.");
    } finally {
      setIsRefreshingWorkspace(false);
    }
  }

  async function handleAnalyzeTicker(
    rawValue = customTickerInput,
    market = customTickerMarket,
    sectorTag = customTickerSector,
    optionOverride?: TickerSearchResult
  ) {
    const ticker = normalizeResearchTicker(rawValue, market);

    if (!ticker) {
      setTickerNotice("티커를 입력해 주세요.");
      return;
    }

    setIsAnalyzingTicker(true);
    setTickerNotice(`${ticker} 라이브 분석을 불러오는 중입니다.`);

    try {
      const response = await fetch("/api/research/ticker", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ticker,
          sectorTag,
          preferences
        })
      });

      if (!response.ok) {
        throw new Error(`Ticker analysis request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        analysis: TickerAnalysis | null;
        relatedNews: ResearchNewsItem[];
        warnings: string[];
      };

      if (!payload.analysis) {
        setTickerNotice(payload.warnings.join(" ") || `${ticker} 분석을 만들 수 없었습니다.`);
        return;
      }

      const nextAnalysis = payload.analysis;
      const nextSectorTag = optionOverride?.sectorTag ?? sectorTag;
      const nextSectors = preferences.sectors.includes(nextSectorTag) ? preferences.sectors : [...preferences.sectors, nextSectorTag];
      const nextTickers = Array.from(new Set([...preferences.tickers, nextAnalysis.ticker]));
      const nextTickerOption = {
        ticker: nextAnalysis.ticker,
        label: optionOverride?.label ?? nextAnalysis.company,
        sectorTag: nextSectorTag,
        market: optionOverride?.market ?? nextAnalysis.market ?? inferResearchTickerMarket(nextAnalysis.ticker),
        exchange: optionOverride?.exchange ?? nextAnalysis.exchange ?? (nextAnalysis.market === "KR" ? "KRX" : "US"),
        tradingViewSymbol: optionOverride?.tradingViewSymbol ?? nextAnalysis.tradingViewSymbol ?? getTradingViewSymbol(nextAnalysis)
      };

      startTransition(() => {
        setPreferences({
          sectors: nextSectors,
          tickers: nextTickers
        });
        setWorkspace((current) => ({
          ...current,
          preferences: {
            sectors: nextSectors,
            tickers: nextTickers
          },
          availableTickers: upsertAvailableTicker(current.availableTickers, nextTickerOption),
          focusedTickers: [nextAnalysis.ticker, ...current.focusedTickers.filter((item) => item !== nextAnalysis.ticker)],
          tickerAnalyses: [nextAnalysis, ...current.tickerAnalyses.filter((item) => item.ticker !== nextAnalysis.ticker)]
        }));
        setSelectedTicker(nextAnalysis.ticker);
      });
      void recordBehaviorEvent("ticker_select", nextAnalysis.ticker);
      setSupplementalNews((current) => {
      const merged = [...payload.relatedNews, ...current];
        return Array.from(new Map(merged.map((item) => [item.id, item])).values());
      });
      setTickerNotice(payload.warnings.length > 0 ? payload.warnings.join(" ") : null);
      setTickerQuery("");
      setTickerSearchResults([]);
    } catch (error) {
      setTickerNotice(error instanceof Error ? error.message : "티커 분석 요청에 실패했습니다.");
    } finally {
      setIsAnalyzingTicker(false);
    }
  }

  function handleAddPreferredTicker() {
    const ticker = normalizeResearchTicker(customTickerInput, customTickerMarket);

    if (!ticker) {
      setTickerNotice("관심 티커로 추가할 심볼을 입력해 주세요.");
      return;
    }

    const nextSectors = preferences.sectors.includes(customTickerSector) ? preferences.sectors : [...preferences.sectors, customTickerSector];
    const nextTickers = Array.from(new Set([...preferences.tickers, ticker]));
    setCustomTickerInput("");
    void refreshWorkspace({
      sectors: nextSectors,
      tickers: nextTickers
    });
  }

  function handleToggleSector(sector: ResearchSectorTag) {
    const nextSectors = toggleStringValue(preferences.sectors, sector) as ResearchSectorTag[];

    if (nextSectors.length === 0) {
      return;
    }

    const nextTickers = preferences.tickers.filter((ticker) => {
      const option = researchTickerOptions.find((candidate) => candidate.ticker === ticker);
      return option ? nextSectors.includes(option.sectorTag) : true;
    });

    void refreshWorkspace({
      sectors: nextSectors,
      tickers: nextTickers
    });
  }

  function handleToggleTicker(ticker: string) {
    void refreshWorkspace({
      sectors: preferences.sectors,
      tickers: toggleStringValue(preferences.tickers, ticker)
    });
  }

  async function handleApplySearchResult(result: TickerSearchResult) {
    const nextInputMarket = inferInputMarketFromTickerResult(result);
    const nextSectorTag = result.sectorTag ?? customTickerSector;

    setCustomTickerInput(getDisplayTicker(result.ticker));
    setCustomTickerMarket(nextInputMarket);
    setCustomTickerSector(nextSectorTag);
    setTickerMarketFilter(result.market);
    setActiveTab("signals");
    setIsSearchPaletteOpen(false);

    await handleAnalyzeTicker(result.ticker, nextInputMarket, nextSectorTag, result);
  }

  async function handleApplyTickerQuery() {
    const query = tickerQuery.trim();

    if (!query) {
      setTickerNotice("검색할 티커나 종목명을 입력해 주세요.");
      return;
    }

    const matchedSearchResult =
      tickerSearchResults.find((result) => getDisplayTicker(result.ticker).toLowerCase() === query.toLowerCase()) ??
      tickerSearchResults.find((result) => result.label.toLowerCase() === query.toLowerCase()) ??
      tickerSearchResults[0];

    if (matchedSearchResult) {
      await handleApplySearchResult(matchedSearchResult);
      return;
    }

    const matchedSector =
      matchedSectorResults.find((sector) => sector.label.toLowerCase() === query.toLowerCase()) ??
      matchedSectorResults.find((sector) => `${sector.label} ${sector.description} ${SECTOR_SEARCH_ALIASES[sector.id] ?? ""}`.toLowerCase().includes(query.toLowerCase()));

    if (matchedSector) {
      setIsSearchPaletteOpen(false);
      window.location.href = getSectorDetailHref(matchedSector.id);
      return;
    }

    const matchedOption =
      workspace.availableTickers.find((ticker) => getDisplayTicker(ticker.ticker).toLowerCase() === query.toLowerCase()) ??
      workspace.availableTickers.find((ticker) => ticker.label.toLowerCase().includes(query.toLowerCase()));

    if (matchedOption) {
      await handleAnalyzeTicker(
        matchedOption.ticker,
        inferResearchTickerInputMarket(matchedOption.ticker),
        matchedOption.sectorTag,
        {
          ticker: matchedOption.ticker,
          label: matchedOption.label,
          market: matchedOption.market,
          exchange: matchedOption.exchange,
          tradingViewSymbol: matchedOption.tradingViewSymbol,
          sectorTag: matchedOption.sectorTag,
          typeLabel: null
        }
      );
      setTickerNotice(`${matchedOption.label}를 바로 분석에 적용했습니다.`);
      setActiveTab("signals");
      setIsSearchPaletteOpen(false);
      return;
    }

    setCustomTickerInput(query);
    setIsSearchPaletteOpen(false);
    await handleAnalyzeTicker(query, customTickerMarket, customTickerSector);
  }

  function handleTabChange(nextTab: ResearchTab) {
    if (nextTab === activeTab) {
      return;
    }

    if (activeTab === "news" && nextTab !== "news") {
      void recordBehaviorEvent("stage_continue", nextTab);
    }

    setActiveTab(nextTab);
  }

  function handleSelectTicker(ticker: string) {
    setSelectedTicker(ticker);
    setCustomTickerMarket(inferResearchTickerInputMarket(ticker));
    void recordBehaviorEvent("ticker_select", ticker);
  }

  function handleToggleActionPlan() {
    setIsActionPlanExpanded((current) => {
      const next = !current;

      if (next) {
        void recordBehaviorEvent("action_expand", workspace.agentPipeline.actionPlan.strategy);
      }

      return next;
    });
  }

  async function handleRunPipeline() {
    setIsRunningPipeline(true);
    setPipelineNotice(null);

    try {
      const response = await fetch("/api/research/pipeline", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          preferences
        })
      });

      if (!response.ok) {
        throw new Error(`Pipeline request failed with ${response.status}`);
      }

      const payload = (await response.json()) as GeneratedResearchSnapshot;

      startTransition(() => {
        setWorkspace(payload.workspace);
        setPreferences(payload.workspace.preferences);
        setSelectedTicker(payload.workspace.focusedTickers[0] ?? "");
        setActiveTab("meeting");
      });

      setPipelineNotice(
        payload.warnings.length > 0
          ? payload.warnings.join(" ")
          : null
      );
    } catch (error) {
      setPipelineNotice(error instanceof Error ? error.message : "AI 파이프라인 실행에 실패했습니다.");
    } finally {
      setIsRunningPipeline(false);
    }
  }

  return (
    <main className="research-app">
      <div className="research-shell">
        <section className="overview-canvas">
          <div className="overview-main">
            <div className="overview-meta-row">
              <div className="masthead-meta">
                <span className="section-kicker">오늘 브리핑</span>
                <span className="masthead-updated">업데이트 {formatResearchDateTime(workspace.generatedAt)}</span>
              </div>
            </div>

            <div className="overview-title-row">
              <div>
                <h1>오늘 시장 한눈에 보기</h1>
                <p className="masthead-summary">{workspace.agentPipeline.market.summary}</p>
              </div>
              <button className="command-trigger hero" onClick={() => setIsSearchPaletteOpen(true)} type="button">
                <span>티커 또는 섹터 검색</span>
                <kbd>⌘K / Ctrl K</kbd>
              </button>
            </div>

            <div className="overview-chip-row">
              {preferences.sectors.map((sector) => (
                <span className="masthead-chip" key={sector}>
                  {getResearchSectorLabel(sector)}
                </span>
              ))}
            </div>

            <div className="overview-content-grid">
              <article className="overview-strategy-panel">
                <span className="eyebrow">오늘 전략</span>
                <strong>{workspace.agentPipeline.actionPlan.strategy}</strong>
                <p>{leadAction}</p>
                <div className="overview-action-row">
                  <button className="api-button" onClick={() => handleTabChange("news")} type="button">
                    뉴스 보기
                  </button>
                  <button
                    className="api-button subtle"
                    onClick={() => {
                      if (leadTickerAnalysis) {
                        handleSelectTicker(leadTickerAnalysis.ticker);
                      }
                      handleTabChange("signals");
                    }}
                    type="button"
                  >
                    {leadTickerAnalysis ? `${getDisplayTicker(leadTickerAnalysis.ticker)} 분석` : "티커 분석"}
                  </button>
                </div>
              </article>

              <section className="overview-insight-panel">
                <div className="overview-insight-section">
                  <span className="eyebrow">핵심 체크</span>
                  <ul className="overview-mini-list">
                    <li>
                      <strong>헤드라인</strong>
                      <span>{topHeadline ? compactCopy(topHeadline.title, 80) : "핵심 헤드라인 대기"}</span>
                    </li>
                    <li>
                      <strong>강세</strong>
                      <span>{topStrongSector ? `${topStrongSector.sector} · ${compactCopy(topStrongSector.reason, 64)}` : "강세 섹터 대기"}</span>
                    </li>
                    <li>
                      <strong>리스크</strong>
                      <span>{topRiskSector ? `${topRiskSector.sector} · ${compactCopy(topRiskSector.reason, 64)}` : "리스크 대기"}</span>
                    </li>
                  </ul>
                </div>

                <div className="overview-insight-section">
                  <span className="eyebrow">지금 볼 순서</span>
                  <div className="overview-routine-list">
                    {routineSteps.map((step, index) => (
                      <div className="overview-routine-item" key={step.id}>
                        <span className="overview-routine-step">0{index + 1}</span>
                        <div>
                          <strong>{step.title}</strong>
                          <p>{step.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <aside className="overview-side">
            <section className="overview-side-section">
              <div className="overview-section-head">
                <div>
                  <span className="section-kicker">관심 종목</span>
                  <h2>내 관심 종목</h2>
                </div>
                {leadTickerAnalysis ? (
                  <Link className="api-link subtle" href={getTickerDetailHref(leadTickerAnalysis.ticker, leadTickerAnalysis.market)}>
                    종목 보기
                  </Link>
                ) : null}
              </div>
              <div className="overview-watch-list">
                {briefingTickers.map((analysis) => (
                  <button
                    className="overview-watch-item"
                    key={analysis.ticker}
                    onClick={() => {
                      handleSelectTicker(analysis.ticker);
                      handleTabChange("signals");
                    }}
                    type="button"
                  >
                    <div className="overview-watch-head">
                      <div className="overview-watch-ident">
                        <span className="ticker-logo-shell">
                          <TickerLogo label={analysis.company} ticker={analysis.ticker} />
                        </span>
                        <div>
                          <strong>{getDisplayTicker(analysis.ticker)}</strong>
                          <span>{analysis.company}</span>
                        </div>
                      </div>
                      <div className={`overview-watch-move ${(analysis.priceChangePercent ?? 0) >= 0 ? "positive" : "negative"}`}>
                        <strong>{formatPercent(analysis.priceChangePercent) ?? "-"}</strong>
                      </div>
                    </div>
                    <p>{compactCopy(analysis.summary, 70)}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="overview-side-section">
              <div className="overview-section-head">
                <div>
                  <span className="section-kicker">체크 포인트</span>
                  <h2>이벤트와 유의사항</h2>
                </div>
              </div>
              <ul className="overview-event-list">
                {workspace.agentPipeline.market.keyEvents.slice(0, 2).map((event) => (
                  <li key={event.title}>
                    <strong>{event.title}</strong>
                    <span>{compactCopy(event.reason, 64)}</span>
                  </li>
                ))}
              </ul>
              <ul className="overview-avoid-list">
                {workspace.agentPipeline.actionPlan.avoidActions.slice(0, 2).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </aside>
        </section>

        <section className="research-toolbar">
          <div className="toolbar-mainline">
            <div className="research-tabs" role="tablist" aria-label="리서치 탭">
              {[
                { id: "news", label: "뉴스" },
                { id: "signals", label: "티커 분석" },
                { id: "meeting", label: "에이전트 회의" }
              ].map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as ResearchTab)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="toolbar-actions">
              <button className="api-button subtle" disabled={isRefreshingWorkspace} onClick={() => void refreshWorkspace(preferences)} type="button">
                {isRefreshingWorkspace ? "업데이트 중..." : "브리핑 업데이트"}
              </button>
              {activeTab === "meeting" ? (
                <button className="api-button" disabled={isRunningPipeline} onClick={handleRunPipeline} type="button">
                  {isRunningPipeline ? "실행 중..." : "회의 다시 실행"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="toolbar-compact-grid">
            <div className="toolbar-inline-group">
              <div className="toolbar-inline-head">
                <div>
                  <span className="eyebrow">관심 섹터</span>
                  <strong>지금 보는 섹터</strong>
                </div>
              </div>
              <div className="toolbar-chip-row">
                {workspace.availableSectors.map((sector) => (
                  <button
                    className={`filter-chip compact-sector-chip ${preferences.sectors.includes(sector.id) ? "active" : ""}`}
                    key={sector.id}
                    onClick={() => handleToggleSector(sector.id)}
                    type="button"
                  >
                    {sector.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="toolbar-inline-group focus">
              <div className="toolbar-inline-head">
                <div>
                  <span className="eyebrow">집중 티커</span>
                  <strong>핵심 종목만 보기</strong>
                </div>
                <div className="ticker-market-row" role="tablist" aria-label="집중 티커 시장 필터">
                  {[
                    { id: "ALL", label: `전체 ${workspace.tickerAnalyses.length}` },
                    { id: "US", label: `미장 ${workspace.tickerAnalyses.filter((analysis) => analysis.market === "US").length}` },
                    { id: "KR", label: `국장 ${workspace.tickerAnalyses.filter((analysis) => analysis.market === "KR").length}` }
                  ].map((marketOption) => (
                    <button
                      aria-selected={tickerMarketFilter === marketOption.id}
                      className={`market-chip ${tickerMarketFilter === marketOption.id ? "active" : ""}`}
                      key={marketOption.id}
                      onClick={() => setTickerMarketFilter(marketOption.id as TickerMarketFilter)}
                      role="tab"
                      type="button"
                    >
                      {marketOption.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="focus-ticker-strip">
                {focusBoardTickers.length === 0 ? <p className="panel-empty-copy">원하는 미장·국장 티커를 검색 오버레이에서 추가해 주세요.</p> : null}
                {focusBoardTickers.map((item) => (
                  <button
                    className={`focus-ticker-inline ${selectedTicker === item.ticker ? "active" : ""}`}
                    key={item.ticker}
                    onClick={() => {
                      handleSelectTicker(item.ticker);
                      handleTabChange("signals");
                    }}
                    type="button"
                  >
                    <div className="focus-ticker-inline-head">
                      <span className="ticker-logo-shell">
                        <TickerLogo label={item.company} ticker={item.ticker} />
                      </span>
                      <strong>{getDisplayTicker(item.ticker)}</strong>
                    </div>
                    <span className="focus-ticker-inline-company">{item.company}</span>
                    <span className={`focus-ticker-inline-move ${(item.priceChangePercent ?? 0) >= 0 ? "positive" : "negative"}`}>
                      {formatPercent(item.priceChangePercent) ?? "-"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeNotice ? <p className="toolbar-notice">{activeNotice}</p> : null}
        </section>

        {isSearchPaletteOpen ? (
          <div
            className="command-palette-backdrop"
            onClick={() => setIsSearchPaletteOpen(false)}
            role="presentation"
          >
            <section
              aria-label="티커 및 섹터 검색"
              aria-modal="true"
              className="command-palette"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="command-palette-head">
                <div>
                  <span className="section-kicker">빠른 검색</span>
                  <h2>티커와 섹터를 바로 찾아 분석하기</h2>
                </div>
                <button className="command-close" onClick={() => setIsSearchPaletteOpen(false)} type="button">
                  닫기
                </button>
              </div>

              <div className="toolbar-search palette">
                <input
                  className="toolbar-search-input palette"
                  onChange={(event) => setTickerQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleApplyTickerQuery();
                    }
                  }}
                  placeholder="티커, 종목명, 섹터, 테마를 검색해 보세요"
                  ref={searchInputRef}
                  type="text"
                  value={tickerQuery}
                />
                <button className="api-button" onClick={() => void handleApplyTickerQuery()} type="button">
                  바로 분석
                </button>
              </div>

              <div className="ticker-market-row command-market-row" role="tablist" aria-label="검색 시장 필터">
                {[
                  { id: "ALL", label: "전체" },
                  { id: "US", label: "미장" },
                  { id: "KR", label: "국장" }
                ].map((marketOption) => (
                  <button
                    aria-selected={tickerMarketFilter === marketOption.id}
                    className={`market-chip ${tickerMarketFilter === marketOption.id ? "active" : ""}`}
                    key={marketOption.id}
                    onClick={() => setTickerMarketFilter(marketOption.id as TickerMarketFilter)}
                    role="tab"
                    type="button"
                  >
                    {marketOption.label}
                  </button>
                ))}
              </div>

              <div className="command-shortcuts">
                {["테슬라", "005930", "전기차", "배터리", "반도체", "오일"].map((shortcut) => (
                  <button
                    className="subtle-chip command-shortcut"
                    key={shortcut}
                    onClick={() => setTickerQuery(shortcut)}
                    type="button"
                  >
                    {shortcut}
                  </button>
                ))}
              </div>

              {tickerQuery.trim() ? (
                <div className="command-results-grid">
                  <section className="command-result-panel">
                    <div className="command-result-head">
                      <span className="eyebrow">섹터 결과</span>
                      <strong>섹터 인사이트</strong>
                    </div>
                    <div className="ticker-search-results">
                      {matchedSectorResults.length === 0 ? <p className="panel-empty-copy">맞는 섹터가 없습니다.</p> : null}
                      {matchedSectorResults.map((sector) => (
                        <article className="search-result-card" key={sector.id}>
                          <div className="search-result-main">
                            <span className="ticker-logo-shell">
                              <span className="ticker-logo-fallback">{sector.label.slice(0, 1)}</span>
                            </span>
                            <div>
                              <strong>{sector.label}</strong>
                              <span>{sector.description}</span>
                            </div>
                          </div>
                          <div className="search-result-actions">
                            <Link
                              className="api-button subtle"
                              href={getSectorDetailHref(sector.id)}
                              onClick={() => setIsSearchPaletteOpen(false)}
                            >
                              섹터 인사이트
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="command-result-panel">
                    <div className="command-result-head">
                      <span className="eyebrow">티커 결과</span>
                      <strong>티커 상세</strong>
                    </div>
                    <div className="ticker-search-results">
                      {isSearchingTickers ? <p className="panel-empty-copy">티커를 검색하고 있습니다.</p> : null}
                      {!isSearchingTickers && tickerSearchResults.length === 0 ? (
                        <p className="panel-empty-copy">검색 결과가 없습니다. 티커 코드, 종목명, 섹터명을 다시 입력해 주세요.</p>
                      ) : null}
                      {tickerSearchResults.map((result) => (
                        <article className="search-result-card" key={result.ticker}>
                          <div className="search-result-main">
                            <span className="ticker-logo-shell">
                              <TickerLogo label={result.label} ticker={result.ticker} />
                            </span>
                            <div>
                              <strong>{getDisplayTicker(result.ticker)}</strong>
                              <span>{result.label}</span>
                            </div>
                          </div>
                          <div className="search-result-side">
                            <span>{getTickerMarketLabel(result.market, result.exchange)}</span>
                            <span>{result.typeLabel ?? result.exchange}</span>
                          </div>
                          <div className="search-result-actions">
                            <Link
                              className="api-button subtle"
                              href={getTickerDetailHref(result.ticker, result.market)}
                              onClick={() => setIsSearchPaletteOpen(false)}
                            >
                              상세 보기
                            </Link>
                            <button className="api-button" onClick={() => void handleApplySearchResult(result)} type="button">
                              메인 추가
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="command-results-grid">
                  <section className="command-result-panel">
                    <div className="command-result-head">
                      <span className="eyebrow">추천 섹터</span>
                      <strong>바로 들어갈 섹터</strong>
                    </div>
                    <div className="command-sector-grid">
                      {researchSectorOptions.map((sector) => (
                        <Link
                          className="command-sector-card"
                          href={getSectorDetailHref(sector.id)}
                          key={sector.id}
                          onClick={() => setIsSearchPaletteOpen(false)}
                        >
                          <strong>{sector.label}</strong>
                          <span>{sector.description}</span>
                        </Link>
                      ))}
                    </div>
                  </section>

                  <section className="command-result-panel">
                    <div className="command-result-head">
                      <span className="eyebrow">저장한 티커</span>
                      <strong>메인에 저장된 티커</strong>
                    </div>
                    <div className="ticker-search-results">
                      {paletteFavoriteTickers.length === 0 ? <p className="panel-empty-copy">아직 저장된 티커가 없습니다.</p> : null}
                      {paletteFavoriteTickers.map((ticker) => (
                        <article className="search-result-card" key={ticker.ticker}>
                          <div className="search-result-main">
                            <span className="ticker-logo-shell">
                              <TickerLogo label={ticker.label} ticker={ticker.ticker} />
                            </span>
                            <div>
                              <strong>{getDisplayTicker(ticker.ticker)}</strong>
                              <span>{ticker.label}</span>
                            </div>
                          </div>
                          <div className="search-result-actions">
                            <Link
                              className="api-button subtle"
                              href={getTickerDetailHref(ticker.ticker, ticker.market)}
                              onClick={() => setIsSearchPaletteOpen(false)}
                            >
                              상세 보기
                            </Link>
                            <button
                              className="api-button"
                              onClick={() => {
                                setIsSearchPaletteOpen(false);
                                handleSelectTicker(ticker.ticker);
                                handleTabChange("signals");
                              }}
                              type="button"
                            >
                              바로 보기
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </section>
          </div>
        ) : null}

        <section className="research-stage">
          {activeTab === "news" ? (
            <NewsTab
              isActionPlanExpanded={isActionPlanExpanded}
              newsletterHref={newsletterHref}
              onToggleActionPlan={handleToggleActionPlan}
              workspace={workspace}
            />
          ) : null}

          {activeTab === "signals" ? (
            <SignalsTab
              analysis={activeAnalysis}
              customTickerInput={customTickerInput}
              customTickerMarket={customTickerMarket}
              customTickerSector={customTickerSector}
              isAnalyzingTicker={isAnalyzingTicker}
              newsLookup={relatedNewsLookup}
              onAnalyzeTicker={handleAnalyzeTicker}
              onChangeTickerInput={setCustomTickerInput}
              onChangeTickerMarket={setCustomTickerMarket}
              onChangeTickerMarketFilter={setTickerMarketFilter}
              onChangeTickerSector={setCustomTickerSector}
              onSelectTicker={handleSelectTicker}
              onToggleTicker={handleToggleTicker}
              tickerNotice={tickerNotice}
              tickerMarketFilter={tickerMarketFilter}
              visibleAvailableTickers={visibleAvailableTickers}
              workspace={workspace}
            />
          ) : null}

          {activeTab === "meeting" ? <MeetingTab isHydrating={isHydratingMeeting} workspace={workspace} /> : null}
        </section>
      </div>
    </main>
  );
}

function NewsTab({
  newsletterHref,
  workspace,
  isActionPlanExpanded,
  onToggleActionPlan
}: {
  newsletterHref: string;
  workspace: ResearchWorkspaceData;
  isActionPlanExpanded: boolean;
  onToggleActionPlan: () => void;
}) {
  if (!workspace.news.headline) {
    return (
      <article className="section-panel empty-state">
        <h2>선택한 섹터에 표시할 핵심 뉴스가 없습니다.</h2>
        <p>섹터 필터를 넓히면 헤드라인과 파생 기사가 함께 채워집니다.</p>
      </article>
    );
  }

  const headline = workspace.news.headline;
  const actionPlan = workspace.agentPipeline.actionPlan;

  return (
    <section className="news-desk">
      <article className="headline-spotlight">
        <div className="headline-copy">
          <div className="story-meta">
            <span className={`priority-pill priority-${headline.priority}`}>{getPriorityLabel(headline.priority)}</span>
            <span>{headline.source}</span>
            <span>{formatResearchDateTime(headline.publishedAt)}</span>
            <span className="story-score">{headline.importanceScore}</span>
          </div>
          <h2>{headline.title}</h2>
          <p className="headline-summary">{headline.summary}</p>
          <div className="headline-notes">
            <div>
              <span className="eyebrow">왜 중요한가</span>
              <p>{headline.analysis}</p>
            </div>
            <div>
              <span className="eyebrow">지금 행동</span>
              <p>{headline.recommendation}</p>
            </div>
          </div>
          <div className="headline-footer">
            <span>관련 티커 {headline.tickerTags.join(" · ")}</span>
            {headline.sourceUrl ? (
              <a className="news-row-link" href={headline.sourceUrl} rel="noreferrer" target="_blank">
                원문 보기
              </a>
            ) : null}
          </div>
        </div>
        <NewsVisual item={headline} variant="hero" />
      </article>

      <div className="news-desk-grid">
        <div className="news-main-column">
          <section className="section-panel strategy-bridge-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">News To Action</span>
                <h2>오늘 전략과 금지 행동</h2>
              </div>
              <p>헤드라인 아래에서 바로 실행 판단이 이어지도록, 행동 블록을 한 번에 읽히게 붙였습니다.</p>
            </div>
            <div className="strategy-bridge-head">
              <div>
                <span className="eyebrow">오늘 전략</span>
                <p>{actionPlan.strategy}</p>
              </div>
              <button className="strategy-expand-button" onClick={onToggleActionPlan} type="button">
                {isActionPlanExpanded ? "전략 접기" : "전략 자세히 보기"}
              </button>
            </div>
            <div className="strategy-callout-grid">
              <article className="strategy-callout-card emphasis">
                <span className="eyebrow">바로 할 것</span>
                <ul className="review-list">
                  {actionPlan.recommendedActions.slice(0, isActionPlanExpanded ? actionPlan.recommendedActions.length : 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="strategy-callout-card caution">
                <span className="eyebrow">하지 말아야 할 것</span>
                <ul className="review-list">
                  {actionPlan.avoidActions.slice(0, isActionPlanExpanded ? actionPlan.avoidActions.length : 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
            {isActionPlanExpanded ? (
              <div className="strategy-risk-block">
                <span className="eyebrow">리스크</span>
                <ul className="review-list">
                  {actionPlan.risks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="section-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Derived</span>
                <h2>파생 기사</h2>
              </div>
              <p>헤드라인 이후 실제 판단에 영향을 주는 기사만 리스트로 남겼습니다.</p>
            </div>
            <div className="story-stack compact">
              {workspace.news.derivedArticles.map((item) => (
                <NewsCard item={item} key={item.id} />
              ))}
            </div>
          </section>
        </div>

        <aside className="news-side-column">
          <section className="section-panel brief-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">At A Glance</span>
                <h2>한눈에 보기</h2>
              </div>
            </div>
            <div className="brief-list">
              <article className="brief-item">
                <span className="eyebrow">핵심 시그널</span>
                <p>{headline.analysis}</p>
              </article>
              <article className="brief-item">
                <span className="eyebrow">권장 행동</span>
                <p>{headline.recommendation}</p>
              </article>
              <article className="brief-item">
                <span className="eyebrow">관련 티커</span>
                <p>{headline.tickerTags.join(" · ")}</p>
              </article>
            </div>
          </section>

          <section className="section-panel sector-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Sector Focus</span>
                <h2>섹터별 핵심 이슈</h2>
              </div>
              <p>선택한 섹터만 짧은 메모처럼 빠르게 훑을 수 있게 정리했습니다.</p>
            </div>
            <div className="sector-brief-list">
              {workspace.news.sectorIssues.map((issue) => (
                <article className="sector-brief-card" key={issue.sectorTag}>
                  <div className="card-headline-meta">
                    <span className="subtle-chip">{issue.sectorLabel}</span>
                    <span className="story-score">{issue.item.importanceScore}</span>
                  </div>
                  <strong>{issue.item.title}</strong>
                  <p>{compactCopy(issue.item.analysis, 124)}</p>
                  <span className="decision-callout">{compactCopy(issue.item.recommendation, 100)}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="section-panel desk-note-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Newsletter</span>
                <h2>{workspace.newsletter.subject}</h2>
              </div>
            </div>
            <p>{workspace.newsletter.previewText}</p>
            <a className="api-link" href={newsletterHref}>
              뉴스레터 데이터 보기
            </a>
          </section>
        </aside>
      </div>
    </section>
  );
}

function SignalsTab({
  analysis,
  customTickerInput,
  customTickerMarket,
  customTickerSector,
  isAnalyzingTicker,
  newsLookup,
  onAnalyzeTicker,
  onChangeTickerInput,
  onChangeTickerMarket,
  onChangeTickerMarketFilter,
  onChangeTickerSector,
  onSelectTicker,
  onToggleTicker,
  tickerNotice,
  tickerMarketFilter,
  visibleAvailableTickers,
  workspace
}: {
  analysis: TickerAnalysis | null;
  customTickerInput: string;
  customTickerMarket: ResearchTickerInputMarket;
  customTickerSector: ResearchSectorTag;
  isAnalyzingTicker: boolean;
  newsLookup: Map<string, ResearchNewsItem>;
  onAnalyzeTicker: (
    rawValue?: string,
    market?: ResearchTickerInputMarket,
    sectorTag?: ResearchSectorTag,
    optionOverride?: TickerSearchResult
  ) => Promise<void>;
  onChangeTickerInput: (value: string) => void;
  onChangeTickerMarket: (value: ResearchTickerInputMarket) => void;
  onChangeTickerMarketFilter: (value: TickerMarketFilter) => void;
  onChangeTickerSector: (value: ResearchSectorTag) => void;
  onSelectTicker: (ticker: string) => void;
  onToggleTicker: (ticker: string) => void;
  tickerNotice: string | null;
  tickerMarketFilter: TickerMarketFilter;
  visibleAvailableTickers: ResearchWorkspaceData["availableTickers"];
  workspace: ResearchWorkspaceData;
}) {
  if (!analysis) {
    return (
      <article className="section-panel empty-state">
        <h2>선택된 티커가 없습니다.</h2>
        <p>관심 티커를 추가하거나 섹터 대표주 자동 선택을 사용해 주세요.</p>
      </article>
    );
  }

  const relatedNews = analysis.linkedNewsIds.map((id) => newsLookup.get(id)).filter((item): item is ResearchNewsItem => Boolean(item));
  const leadVisual = relatedNews[0] ?? null;
  const filteredAnalyses =
    tickerMarketFilter === "ALL" ? workspace.tickerAnalyses : workspace.tickerAnalyses.filter((item) => item.market === tickerMarketFilter);

  return (
    <section className="signals-desk">
      <section className="section-panel ticker-search-panel">
        <div className="section-heading compact">
          <div>
            <span className="section-kicker">관심 티커</span>
            <h2>관심 티커 관리</h2>
          </div>
          <p>미국과 국장을 나눠 보고, 원하는 종목을 추가한 뒤 바로 실제 차트 분석으로 이어갈 수 있습니다.</p>
        </div>
        <div className="ticker-market-row" role="tablist" aria-label="관심 티커 시장 필터">
          {[
            { id: "ALL", label: `전체 ${workspace.availableTickers.length}` },
            { id: "US", label: `미국 ${workspace.availableTickers.filter((ticker) => ticker.market === "US").length}` },
            { id: "KR", label: `국장 ${workspace.availableTickers.filter((ticker) => ticker.market === "KR").length}` }
          ].map((marketOption) => (
            <button
              aria-selected={tickerMarketFilter === marketOption.id}
              className={`market-chip ${tickerMarketFilter === marketOption.id ? "active" : ""}`}
              key={marketOption.id}
              onClick={() => onChangeTickerMarketFilter(marketOption.id as TickerMarketFilter)}
              role="tab"
              type="button"
            >
              {marketOption.label}
            </button>
          ))}
        </div>
        <div className="signal-watchlist-grid">
          {visibleAvailableTickers.length === 0 ? <p className="panel-empty-copy">현재 필터에 맞는 관심 티커가 없습니다.</p> : null}
          {visibleAvailableTickers.map((ticker) => {
            const matchedAnalysis = workspace.tickerAnalyses.find((item) => item.ticker === ticker.ticker);

            return (
              <button
                className={`watchlist-card ${workspace.preferences.tickers.includes(ticker.ticker) ? "active" : ""}`}
                key={ticker.ticker}
                onClick={() => onToggleTicker(ticker.ticker)}
                type="button"
              >
                <div className="watchlist-card-head">
                  <span className="ticker-logo-shell">
                    <TickerLogo label={ticker.label} ticker={ticker.ticker} />
                  </span>
                  <div>
                    <strong>{getDisplayTicker(ticker.ticker)}</strong>
                    <span>
                      {ticker.label} · {getTickerMarketLabel(ticker.market, ticker.exchange)}
                    </span>
                  </div>
                </div>
                {matchedAnalysis ? <TickerSparkline analysis={matchedAnalysis} tone="card" /> : <div className="watchlist-card-empty">저장된 티커</div>}
              </button>
            );
          })}
        </div>
        <div className="ticker-search-controls">
          <input
            autoCapitalize="characters"
            className="ticker-search-input"
            onChange={(event) => onChangeTickerInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onAnalyzeTicker();
              }
            }}
            placeholder="예: NVDA / 005930"
            type="text"
            value={customTickerInput}
          />
          <select className="ticker-search-select" onChange={(event) => onChangeTickerMarket(event.target.value as ResearchTickerInputMarket)} value={customTickerMarket}>
            <option value="US">미국</option>
            <option value="KRX">코스피</option>
            <option value="KOSDAQ">코스닥</option>
          </select>
          <select className="ticker-search-select" onChange={(event) => onChangeTickerSector(event.target.value as ResearchSectorTag)} value={customTickerSector}>
            {workspace.availableSectors
              .filter((sector) => workspace.preferences.sectors.includes(sector.id))
              .map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.label}
                </option>
              ))}
          </select>
          <button className="api-button" disabled={isAnalyzingTicker} onClick={() => void onAnalyzeTicker()} type="button">
            {isAnalyzingTicker ? "분석 중..." : "티커 분석 추가"}
          </button>
        </div>
        <p className="ticker-search-notice">미국은 `NVDA`, 국장은 `005930`처럼 입력하면 됩니다. 활성 카드나 칩을 다시 누르면 관심 티커에서 제거됩니다.</p>
        {tickerNotice ? <p className="ticker-search-notice">{tickerNotice}</p> : null}
      </section>

      <div className="signals-layout">
        <aside className="section-panel signal-selector">
          <div className="section-heading compact">
            <div>
              <span className="section-kicker">Ticker Focus</span>
              <h2>집중 종목</h2>
            </div>
            <p>많이 보여주기보다, 바로 비교 가능한 종목만 세로 리스트로 유지합니다.</p>
          </div>
          <div className="signal-selector-list vertical">
            {filteredAnalyses.map((item) => (
              <button
                className={`signal-nav-item ${analysis.ticker === item.ticker ? "active" : ""}`}
                key={item.ticker}
                onClick={() => onSelectTicker(item.ticker)}
                type="button"
              >
                <div className="signal-nav-main">
                  <div className="signal-nav-head">
                    <span className="ticker-logo-shell small">
                      <TickerLogo label={item.company} ticker={item.ticker} />
                    </span>
                    <div>
                      <span className="eyebrow">
                        {getResearchSectorLabel(item.sectorTag)} · {getMarketLabel(item)}
                      </span>
                      <strong>{getDisplayTicker(item.ticker)}</strong>
                    </div>
                  </div>
                  <p>{compactCopy(item.summary, 72)}</p>
                </div>
                <div className="signal-nav-side">
                  <span className="story-score">{item.importanceScore}</span>
                  <TickerSparkline analysis={item} />
                </div>
              </button>
            ))}
          </div>
        </aside>

        <article className="signal-report">
          <header className="section-panel signal-hero">
            <div className="signal-hero-copy">
              <div className="story-meta">
                <span className="subtle-chip">{getResearchSectorLabel(analysis.sectorTag)}</span>
                <span className="subtle-chip">{getMarketLabel(analysis)}</span>
                <span>{analysis.company}</span>
                <span className="story-score">{analysis.importanceScore}</span>
              </div>
              <div className="signal-hero-ident">
                <span className="ticker-logo-shell hero">
                  <TickerLogo label={analysis.company} ticker={analysis.ticker} />
                </span>
                <div>
                  <h2>{getDisplayTicker(analysis.ticker)}</h2>
                  <p className="signal-hero-company">{analysis.company}</p>
                </div>
              </div>
              <div className="signal-price-strip">
                <strong>{formatPrice(analysis.latestPrice)}</strong>
                <span className={`signal-price-move ${(analysis.priceChangePercent ?? 0) >= 0 ? "positive" : "negative"}`}>
                  {formatPriceChange(analysis.priceChange)} {formatPercent(analysis.priceChangePercent) ?? ""}
                </span>
              </div>
              <p className="headline-summary">{analysis.summary}</p>
              <div className="signal-hero-actions">
                <Link className="api-button subtle" href={getTickerDetailHref(analysis.ticker, analysis.market)}>
                  종목 상세
                </Link>
                <Link className="api-button subtle" href={getSectorDetailHref(analysis.sectorTag)}>
                  {getResearchSectorLabel(analysis.sectorTag)} 섹터 보기
                </Link>
              </div>
            </div>
            {leadVisual ? <NewsVisual item={leadVisual} variant="hero" /> : null}
          </header>

          <section className="signal-visual-grid">
            <section className="section-panel signal-visual-panel">
              <div className="section-heading compact">
                <div>
                  <span className="section-kicker">Visual Read</span>
                  <h2>가격 흐름</h2>
                </div>
                <p>텍스트보다 먼저 현재 구조를 이해할 수 있게 차트를 위에 배치했습니다.</p>
              </div>
              <SignalPriceChart analysis={analysis} />
            </section>
            <section className="section-panel signal-visual-panel">
              <div className="section-heading compact">
                <div>
                  <span className="section-kicker">Chart</span>
                  <h2>TradingView 차트</h2>
                </div>
                <p>실제 캔들 차트에서 지지/저항과 구조를 바로 확인할 수 있습니다.</p>
              </div>
              <TradingViewFrame analysis={analysis} />
            </section>
          </section>

          <div className="signal-sections editorial">
            <section className="section-panel signal-section summary">
              <h3>요약</h3>
              <p>{analysis.summary}</p>
            </section>
            <section className="section-panel signal-section">
              <h3>기술적 분석</h3>
              <p>{analysis.technicalAnalysis}</p>
            </section>
            <section className="section-panel signal-section">
              <h3>시황 연결</h3>
              <p>{analysis.marketContext}</p>
            </section>
            <section className="section-panel signal-section action">
              <h3>행동 제안</h3>
              <p>{analysis.recommendation}</p>
            </section>
            <section className="section-panel signal-section patterns">
              <h3>패턴 분석</h3>
              <div className="pattern-list">
                {analysis.patternAnalysis.map((pattern) => (
                  <article className="pattern-card" key={pattern.name}>
                    <div className="card-headline-meta">
                      <strong>{pattern.name}</strong>
                      <span className="subtle-chip">{getConfidenceLabel(pattern.confidence)}</span>
                    </div>
                    <p>{pattern.detail}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="section-panel linked-news-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Linked News</span>
                <h2>연결된 뉴스</h2>
              </div>
              <p>차트 해석이 뉴스 흐름과 함께 읽히도록 연결 기사만 남겼습니다.</p>
            </div>
            <div className="story-stack compact">
              {relatedNews.map((item) => (
                <NewsCard item={item} key={item.id} />
              ))}
            </div>
          </section>
        </article>
      </div>
    </section>
  );
}

function MeetingTab({ isHydrating, workspace }: { isHydrating: boolean; workspace: ResearchWorkspaceData }) {
  return (
    <section className="meeting-desk">
      {isHydrating ? <p className="toolbar-notice">회의 로그와 실행 아이템을 빠르게 이어 붙이는 중입니다.</p> : null}
      <section className="meeting-overview-grid">
        <article className="section-panel compact-panel">
          <span className="eyebrow">회의 주제</span>
          <strong>{workspace.meeting.topic}</strong>
          <p>{workspace.meeting.objective}</p>
        </article>
        <article className="section-panel compact-panel">
          <span className="eyebrow">다음 액션</span>
          <strong>{workspace.meeting.nextAction}</strong>
          <p>{workspace.agentPipeline.actionPlan.strategy}</p>
        </article>
        <article className="section-panel compact-panel">
          <span className="eyebrow">런타임</span>
          <strong>{workspace.agentPipeline.runtime.provider.toUpperCase()}</strong>
          <p>{formatResearchDateTime(workspace.agentPipeline.runtime.generatedAt)}</p>
        </article>
        <article className="section-panel compact-panel">
          <span className="eyebrow">전환 인사이트</span>
          <strong>{workspace.userBehavior.highIntentAction}</strong>
          <p>{getBehaviorInsight(workspace.behaviorSummary)}</p>
        </article>
      </section>

      <div className="meeting-layout">
        <div className="meeting-main-column">
          <section className="section-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Agent Thread</span>
                <h2>에이전트 대화 로그</h2>
              </div>
              <p>각 단계가 다음 단계로 넘긴 판단을 그대로 이어 보여줍니다.</p>
            </div>
            <div className="meeting-thread">
              {workspace.agentPipeline.runtime.transcript.map((message, index) => (
                <TranscriptMessageCard isLast={index === workspace.agentPipeline.runtime.transcript.length - 1} key={message.id} message={message} />
              ))}
            </div>
          </section>

          <section className="section-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Conclusion</span>
                <h2>실행 아이템</h2>
              </div>
              <p>{workspace.userBehavior.frictionPoint}</p>
            </div>
            <ul className="action-item-list">
              {workspace.productReview.actionItems.map((item) => (
                <li key={item.id}>
                  <div className="action-item-head">
                    <strong>{item.title}</strong>
                    <span className={`action-status-chip status-${item.implementationStatus}`}>{getImplementationStatusLabel(item.implementationStatus)}</span>
                  </div>
                  <p>{item.detail}</p>
                  <p className="action-focus-copy">{item.implementationFocus}</p>
                  <p className="review-references">
                    {item.owner} · {item.references.join(" · ")}
                    {item.issueUrl ? (
                      <>
                        {" "}
                        ·{" "}
                        <a href={item.issueUrl} rel="noreferrer" target="_blank">
                          GitHub Issue #{item.issueNumber}
                        </a>
                      </>
                    ) : null}
                    {item.pullRequestUrl ? (
                      <>
                        {" "}
                        ·{" "}
                        <a href={item.pullRequestUrl} rel="noreferrer" target="_blank">
                          Draft PR #{item.pullRequestNumber}
                        </a>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="meeting-side-column">
          <section className="section-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Agent Pipeline</span>
                <h2>단계별 체인</h2>
              </div>
            </div>
            <div className="pipeline-flow single-column">
              {workspace.agentPipeline.steps.map((step, index) => (
                <PipelineStepCard key={step.id} order={index + 1} step={step} />
              ))}
            </div>
          </section>

          <section className="section-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Macro Board</span>
                <h2>시장 해석</h2>
              </div>
            </div>
            <div className="market-readout">
              <p>{workspace.agentPipeline.market.summary}</p>
              <p>{workspace.agentPipeline.market.shortTermView}</p>
              <p>{workspace.agentPipeline.market.mediumTermView}</p>
            </div>
            <div className="market-grid compact">
              <article className="inline-market-card">
                <span className="eyebrow">강세 섹터</span>
                <ul className="market-call-list">
                  {workspace.agentPipeline.market.strongSectors.map((call) => (
                    <li key={`${call.sector}-${call.horizon}`}>
                      <strong>
                        {call.sector} · {call.horizon}
                      </strong>
                      <p>{call.reason}</p>
                    </li>
                  ))}
                </ul>
              </article>
              <article className="inline-market-card">
                <span className="eyebrow">리스크 섹터</span>
                <ul className="market-call-list">
                  {workspace.agentPipeline.market.riskSectors.map((call) => (
                    <li key={`${call.sector}-${call.horizon}`}>
                      <strong>
                        {call.sector} · {call.horizon}
                      </strong>
                      <p>{call.reason}</p>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section className="section-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Product Team</span>
                <h2>역할별 메모</h2>
              </div>
            </div>
            <div className="review-grid single-column">
              {workspace.productReview.notes.map((note) => (
                <ReviewNoteCard key={note.role} note={note} />
              ))}
            </div>
          </section>

          <section className="section-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Behavior Funnel</span>
                <h2>실사용 전환 데이터</h2>
              </div>
              <p>{getBehaviorInsight(workspace.behaviorSummary)}</p>
            </div>
            <div className="behavior-metric-grid compact">
              {workspace.behaviorSummary.metrics.map((metric) => (
                <article className="behavior-metric-card" key={metric.eventName}>
                  <span className="eyebrow">{metric.label}</span>
                  <strong>{metric.count}</strong>
                  <p>{metric.lastValue ? `마지막 값 ${metric.lastValue}` : "아직 기록 없음"}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
