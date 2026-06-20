import type {
  AgentAction,
  ConnectionState,
  DashboardSummaryResponse,
  DailySeriesPoint,
  DailyReportResponse,
  LogView,
  MarketSymbol,
  OrderAction,
  PaperEventView,
  PerformanceBreakdownView,
  RuntimeStateResponse,
  StrategyView,
  PositionSide,
  PositionView,
  SessionCompareResponse,
  StrategyStatus,
  SystemStatusView,
  TradeView,
  WeeklyReportResponse
} from "@fomo/shared";

import { formatCompactDate, formatCurrency, formatPercent, formatSignedCurrency, formatTimeOnly } from "./format";

export interface OverviewEventRow {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: "positive" | "negative" | "neutral";
}

export interface AgentEventRow {
  id: string;
  sentence: string;
  tone: "positive" | "negative" | "neutral";
}

export type AgentLogTag = "INFO" | "ENTRY" | "EXIT" | "FILTER" | "ALERT";
export type AgentLogFilter = "all" | "entry" | "exit" | "loss" | "skip";

export interface AgentLogRow {
  id: string;
  tag: AgentLogTag;
  time: string;
  message: string;
  detail?: string | null;
  bullets?: string[];
  filter: AgentLogFilter;
  result?: string | null;
  tone: "positive" | "negative" | "neutral";
}

export interface AgentSuggestionItem {
  id: string;
  issue: string;
  cause: string;
  action: string;
}

export interface AgentRiskSnapshot {
  symbol: string;
  side: string;
  entryPrice: string;
  stopPrice: string;
  targetPrice: string;
  positionSize: string;
  maxLossUsd: string;
  note: string;
}

export interface AgentTrustMetric {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}

const reasonLabelMap: Record<string, string> = {
  LOWER_BAND_TOUCH: "볼린저 하단 이탈 진입",
  MEAN_REVERSION_COMPLETE: "평균회귀 완료 청산",
  WEAK_REBOUND_STOP: "반등 약화 손절",
  EMA_PULLBACK_EXIT: "EMA 추세 청산"
};

const reasonTextMap: Record<string, string> = {
  LOWER_BAND_TOUCH:
    "볼린저 하단 이탈과 RSI 둔화가 동시에 나와 평균회귀 기대값이 왕복 비용을 넘는 구간으로 판단했습니다.",
  MEAN_REVERSION_COMPLETE: "가격이 볼린저 중심선 근처로 복귀하고 모멘텀이 회복돼 목표 구간에서 청산했습니다.",
  WEAK_REBOUND_STOP: "반등 강도가 약해 수수료를 감안한 기대수익을 유지하지 못해 손절했습니다."
};

const recommendationMap: Record<string, { title: string; detail: string }> = {
  "Keep fee filter strict": {
    title: "수수료 필터 유지",
    detail: "예상 수익 필터를 지금보다 느슨하게 풀지 말고, 비용을 충분히 넘는 진입만 계속 관찰하세요."
  },
  "Inspect weak rebound stops": {
    title: "약한 반등 손절 점검",
    detail: "RSI나 볼린저 파라미터를 바꾸기 전에, 반등이 꺾인 캔들 구간을 먼저 수동으로 검토하세요."
  },
  "Let the sample grow": {
    title: "표본 추가 관찰",
    detail: "하루 수익만으로 판단하지 말고 같은 조건으로 더 많은 표본을 쌓은 뒤 수정 여부를 결정하세요."
  },
  "Hold the A strategy fixed longer": {
    title: "A 전략 고정 유지",
    detail: "지금은 검증 루프 단계이므로, 설정을 자주 바꾸기보다 같은 규칙으로 더 길게 관찰하는 편이 낫습니다."
  },
  "Compare fee-adjusted expectancy by session": {
    title: "세션별 기대값 비교",
    detail: "수익보다 중요한 것은 비용을 뺀 기대값입니다. 세션 비교는 순손익과 기대값을 함께 보세요."
  },
  "Review low-volatility skips": {
    title: "저변동성 차단 검토",
    detail: "진입이 막힌 구간이 실제 손실 회피에 기여했는지 확인해 필터의 유효성을 판단하세요."
  },
  "Use sessions as human review units": {
    title: "세션 단위 리뷰 유지",
    detail: "전략 수정은 세션이 끝난 뒤 사람이 비교하고 결정하는 흐름을 유지하세요."
  },
  "Promote settings only on net improvement": {
    title: "순손익 개선만 채택",
    detail: "승률이 아니라 순손익과 기대값이 같이 좋아질 때만 다음 설정으로 승격하세요."
  }
};

const recommendationShortMap: Record<string, string> = {
  "Keep fee filter strict": "비용 필터 유지",
  "Inspect weak rebound stops": "약한 반등 필터링",
  "Let the sample grow": "표본 추가 관찰",
  "Hold the A strategy fixed longer": "전략 변경 보류",
  "Compare fee-adjusted expectancy by session": "세션 기대값 비교",
  "Review low-volatility skips": "저변동 구간 검토",
  "Use sessions as human review units": "세션 단위 검토",
  "Promote settings only on net improvement": "순손익 기준 채택"
};

const logMessageMap: Record<string, string> = {
  "Entry passed fee, volatility, and cooldown filters.":
    "진입 조건이 수수료, 변동성, 쿨다운 필터를 모두 통과했습니다.",
  "Skipped entry because expected rebound did not clear round-trip costs.":
    "예상 반등 폭이 왕복 비용을 넘지 못해 진입을 건너뛰었습니다.",
  "Daily summary snapshot refreshed for current session.": "현재 세션 기준 일간 요약 스냅샷을 갱신했습니다."
};

const sourceLabelMap: Record<string, string> = {
  "strategy-worker": "전략 워커",
  "trade-filter": "거래 필터",
  "report-agent": "리포트 에이전트",
  "risk-guard": "리스크 가드"
};

const tickerLabelMap: Record<MarketSymbol, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL"
};

const reasonBulletMap: Record<string, string> = {
  LOWER_BAND_TOUCH: "BB 하단 복귀",
  RSI_OVERSOLD: "RSI 반등",
  RSI_RECOVERY: "RSI 회복 확인",
  MEAN_REVERSION_COMPLETE: "평균 회귀 완료",
  FILTER_EDGE_TOO_SMALL: "수수료 대비 기대수익 부족",
  FILTER_LOW_VOLATILITY: "변동성 부족",
  FILTER_COOLDOWN_ACTIVE: "연속 손실 쿨다운",
  WEAK_REBOUND_STOP: "반등 약화",
  NO_ACTION: "조건 미충족"
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getNumberValue(source: unknown, key: string) {
  const record = asRecord(source);
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function getReasonItems(reasonMeta: Record<string, unknown> | null | undefined) {
  if (!reasonMeta) {
    return [];
  }

  const direct = reasonMeta.reasons;

  if (Array.isArray(direct)) {
    return direct.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
  }

  const filters = reasonMeta.filters;

  if (Array.isArray(filters)) {
    return filters.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
  }

  return [];
}

function translateReasonMessage(message: string) {
  if (message.includes("lower Bollinger Band")) {
    return "BB 하단 복귀";
  }

  if (message.includes("oversold")) {
    return "RSI 반등";
  }

  if (message.includes("mid line")) {
    return "평균 회귀 완료";
  }

  if (message.includes("exit threshold")) {
    return "RSI 회복 확인";
  }

  if (message.includes("expected rebound")) {
    return "수수료 대비 기대수익 부족";
  }

  if (message.includes("minimum tradable volatility")) {
    return "변동성 부족";
  }

  if (message.includes("Cooldown remains active")) {
    return "연속 손실 쿨다운";
  }

  return message;
}

function buildReasonBullets(reasonMeta: Record<string, unknown> | null | undefined, eventType?: PaperEventView["eventType"]): string[] {
  const bullets = getReasonItems(reasonMeta).map((item) => {
    const code = typeof item.code === "string" ? item.code : null;
    const message = typeof item.message === "string" ? item.message : null;

    if (code && reasonBulletMap[code]) {
      return reasonBulletMap[code];
    }

    if (message) {
      return translateReasonMessage(message);
    }

    return null;
  });

  if (eventType === "ENTRY_PLACED") {
    bullets.push("수수료 필터 통과");
  }

  if (eventType === "EXIT_TAKE_PROFIT") {
    bullets.push("목표 수익 도달");
  }

  if (eventType === "EXIT_STOP_LOSS") {
    bullets.push("손절 조건 충족");
  }

  const uniqueBullets = [...new Set(bullets.filter((item): item is string => Boolean(item)))];

  if (uniqueBullets.length > 0) {
    return uniqueBullets.slice(0, 3);
  }

  if (eventType === "ENTRY_PLACED") {
    return ["BB 하단 복귀", "RSI 반등", "수수료 필터 통과"];
  }

  if (eventType === "EXIT_TAKE_PROFIT") {
    return ["목표 수익 도달", "평균 회귀 완료"];
  }

  if (eventType === "EXIT_STOP_LOSS") {
    return ["반등 약화", "손절 조건 충족"];
  }

  if (eventType === "TRADE_SKIPPED") {
    return ["진입 보류", "필터 미통과"];
  }

  if (eventType === "COOLDOWN_TRIGGERED") {
    return ["연속 손실 감지", "쿨다운 유지"];
  }

  return [];
}

function deriveEntryDetail(reasonMeta: Record<string, unknown> | null | undefined) {
  const expectedReboundPct = getNumberValue(reasonMeta, "expectedReboundPct");
  const rsi = getNumberValue(reasonMeta, "rsi");

  if (expectedReboundPct !== null && rsi !== null) {
    return `예상 반등폭 ${expectedReboundPct.toFixed(2)}%와 RSI ${rsi.toFixed(1)} 기준이 함께 충족됐습니다.`;
  }

  return "비용을 넘기는 평균회귀 구간으로 판단해 진입했습니다.";
}

function deriveExitDetail(eventType: PaperEventView["eventType"], reasonMeta: Record<string, unknown> | null | undefined) {
  if (eventType === "EXIT_TAKE_PROFIT") {
    const bbMiddle = getNumberValue(reasonMeta, "bbMiddle");

    if (bbMiddle !== null) {
      return `중심선 목표 ${bbMiddle.toFixed(2)} 부근에 도달해 익절했습니다.`;
    }

    return "목표 구간에 도달해 익절했습니다.";
  }

  return "반등 강도가 약해져 손절 조건을 만족했습니다.";
}

function deriveSkipDetail(reasonMeta: Record<string, unknown> | null | undefined) {
  const expectedGrossReturnPct = getNumberValue(reasonMeta, "expectedGrossReturnPct");
  const requiredReturnPct = getNumberValue(reasonMeta, "requiredReturnPct");
  const bandWidthPct = getNumberValue(reasonMeta, "bandWidthPct");

  if (expectedGrossReturnPct !== null && requiredReturnPct !== null) {
    return `예상 반등폭 ${expectedGrossReturnPct.toFixed(2)}%가 필요 수익 ${requiredReturnPct.toFixed(2)}%를 넘지 못했습니다.`;
  }

  if (bandWidthPct !== null) {
    return `밴드폭 ${bandWidthPct.toFixed(2)}%로 변동성이 충분하지 않았습니다.`;
  }

  return "필터 조건을 넘지 못해 진입을 보류했습니다.";
}

function formatPrice(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value >= 1000 ? 1 : 2,
    maximumFractionDigits: value >= 1000 ? 1 : 2
  }).format(value);
}

function calculateMaxDrawdown(dailySeries: DailySeriesPoint[]) {
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const point of dailySeries) {
    running += point.netPnl;
    peak = Math.max(peak, running);
    maxDrawdown = Math.min(maxDrawdown, running - peak);
  }

  return maxDrawdown;
}

function getFilterByEventType(eventType: PaperEventView["eventType"], pnlDelta?: number | null): AgentLogFilter {
  if (eventType === "ENTRY_PLACED") {
    return "entry";
  }

  if (eventType === "EXIT_TAKE_PROFIT") {
    return "exit";
  }

  if (eventType === "EXIT_STOP_LOSS") {
    return "loss";
  }

  if (eventType === "TRADE_SKIPPED" || eventType === "COOLDOWN_TRIGGERED") {
    return "skip";
  }

  if (typeof pnlDelta === "number" && pnlDelta < 0) {
    return "loss";
  }

  return "all";
}

function getFilterByTrade(trade: TradeView): AgentLogFilter {
  if (trade.action === "BUY") {
    return "entry";
  }

  if (trade.action === "STOP_LOSS" || trade.realizedPnl < 0) {
    return "loss";
  }

  return "exit";
}

function getFilterByLog(log: LogView): AgentLogFilter {
  if (log.message.includes("손절") || log.message.includes("손실")) {
    return "loss";
  }

  if (log.message.includes("스킵") || log.message.includes("건너뛰") || log.message.includes("보류") || log.source === "trade-filter") {
    return "skip";
  }

  if (log.message.includes("진입")) {
    return "entry";
  }

  if (log.message.includes("청산") || log.message.includes("익절")) {
    return "exit";
  }

  return "all";
}

function getSignalRecord(reasonMeta: Record<string, unknown> | null | undefined) {
  return asRecord(reasonMeta?.signal) ?? reasonMeta ?? null;
}

function deriveRiskPrices(position: PositionView, sourceMeta: Record<string, unknown> | null | undefined) {
  const meta = getSignalRecord(sourceMeta);
  const bbMiddle = getNumberValue(meta, "bbMiddle") ?? getNumberValue(meta, "targetPrice");
  const bandWidthPct = getNumberValue(meta, "bandWidthPct");
  const expectedReboundPct = getNumberValue(meta, "expectedReboundPct");
  const fallbackStopPct = bandWidthPct !== null ? Math.max(0.35, Math.min(1.35, bandWidthPct * 0.55)) : 0.65;
  const stopPrice = Number((position.entryPrice * (1 - fallbackStopPct / 100)).toFixed(2));
  const fallbackTargetPct = expectedReboundPct !== null ? Math.max(expectedReboundPct * 0.72, 0.4) : 0.95;
  const targetPrice = Number((bbMiddle ?? position.entryPrice * (1 + fallbackTargetPct / 100)).toFixed(2));

  return {
    stopPrice,
    targetPrice,
    bandWidthPct,
    expectedReboundPct
  };
}

export function getStrategyStatusLabel(status: StrategyStatus | null | undefined) {
  switch (status) {
    case "ACTIVE":
      return "활성";
    case "PAUSED":
      return "일시정지";
    case "DISABLED":
      return "비활성";
    default:
      return "미설정";
  }
}

export function getBotStatusLabel(status: SystemStatusView["botStatus"]) {
  switch (status) {
    case "RUNNING":
      return "정상 실행";
    case "STOPPED":
      return "중지";
    case "DEGRADED":
      return "주의";
    default:
      return "상태 미확인";
  }
}

export function getConnectionStatusLabel(status: ConnectionState) {
  switch (status) {
    case "LIVE":
      return "LIVE";
    case "DEMO":
      return "DEMO";
    case "DELAYED":
      return "지연";
    case "OFFLINE":
      return "오프라인";
    default:
      return "미확인";
  }
}

export function getActionStatusLabel(action: AgentAction) {
  switch (action) {
    case "HOLD":
      return "유지";
    case "WAIT_ENTRY":
      return "진입 대기";
    case "BLOCKED":
      return "거래 금지";
    case "EXITING":
      return "청산 중";
    default:
      return "대기";
  }
}

export function getSyncStatusLabel(system: SystemStatusView) {
  return system.workerHealthy ? "동기화 정상" : "동기화 지연";
}

export function getSideLabel(side: PositionSide | null | undefined) {
  switch (side) {
    case "LONG":
      return "롱";
    case "SHORT":
      return "숏";
    default:
      return "없음";
  }
}

export function getActionLabel(action: OrderAction) {
  switch (action) {
    case "BUY":
      return "매수";
    case "SELL":
      return "매도";
    case "CLOSE":
      return "청산";
    case "STOP_LOSS":
      return "손절";
    case "TAKE_PROFIT":
      return "익절";
    default:
      return action;
  }
}

export function getReasonLabel(code: string | null | undefined, fallback?: string | null) {
  if (!code) {
    return fallback ?? "사유 없음";
  }

  return reasonLabelMap[code] ?? fallback ?? code;
}

export function getReasonText(code: string | null | undefined, fallback?: string | null) {
  if (!code) {
    return fallback ?? "데이터가 충분하지 않습니다.";
  }

  return reasonTextMap[code] ?? fallback ?? code;
}

export function getStrategyNameKorean() {
  return "A 전략";
}

export function getSessionNameKorean(name: string | null | undefined) {
  if (!name) {
    return "세션 없음";
  }

  if (name === "A Strategy Validation") {
    return "A 전략 검증 세션";
  }

  return name;
}

export function getPositionSummary(position: PositionView | null) {
  if (!position) {
    return "포지션 없음";
  }

  return `${position.symbol} ${getSideLabel(position.side)} ${position.quantity.toFixed(4)}`;
}

export function getSourceLabel(source: string) {
  return sourceLabelMap[source] ?? source;
}

export function getTickerLabel(symbol: MarketSymbol) {
  return tickerLabelMap[symbol];
}

export function getLogMessageKorean(message: string) {
  return logMessageMap[message] ?? message;
}

function tradeTone(trade: TradeView): OverviewEventRow["tone"] {
  if (trade.realizedPnl > 0) {
    return "positive";
  }

  if (trade.realizedPnl < 0) {
    return "negative";
  }

  return "neutral";
}

function logTone(log: LogView): OverviewEventRow["tone"] {
  if (log.level === "ERROR") {
    return "negative";
  }

  if (log.level === "WARN") {
    return "neutral";
  }

  return "positive";
}

export function buildRecentEvents(trades: TradeView[], logs: LogView[]): OverviewEventRow[] {
  const tradeRows = trades.map((trade) => ({
    id: `trade-${trade.id}`,
    title: `${trade.symbol} ${getActionLabel(trade.action)}`,
    detail: `${getReasonLabel(trade.reasonCode)} · ${formatSignedCurrency(trade.realizedPnl)}`,
    time: trade.executedAt,
    tone: tradeTone(trade)
  }));
  const logRows = logs.map((log) => ({
    id: `log-${log.id}`,
    title: getSourceLabel(log.source),
    detail: getLogMessageKorean(log.message),
    time: log.createdAt,
    tone: logTone(log)
  }));

  return [...tradeRows, ...logRows]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .map((row) => ({
      ...row,
      time: formatCompactDate(row.time)
    }));
}

export function buildDailyAiSummary(dailyReport: DailyReportResponse) {
  const driver = dailyReport.report.profitDrivers[0];

  if (dailyReport.metrics.tradeCount === 0) {
    return "데이터가 충분하지 않아 AI 요약을 보류합니다.";
  }

  if (dailyReport.metrics.netPnl > dailyReport.metrics.totalFees) {
    return `${formatCurrency(dailyReport.metrics.netPnl)} 순이익으로 수수료를 넘어섰고, ${
      driver ? getReasonLabel(driver.key, driver.label) : "주요 진입 이유"
    }이 가장 크게 기여했습니다.`;
  }

  if (dailyReport.metrics.netPnl >= 0) {
    return `${formatCurrency(dailyReport.metrics.netPnl)} 순이익이지만 비용 여유는 아직 좁습니다.`;
  }

  return `${formatCurrency(dailyReport.metrics.netPnl)} 손실이며 ${
    dailyReport.report.lossDrivers[0] ? getReasonLabel(dailyReport.report.lossDrivers[0].key, dailyReport.report.lossDrivers[0].label) : "손실 구간"
  } 점검이 우선입니다.`;
}

export function buildWeeklyAiSummary(weeklyReport: WeeklyReportResponse) {
  if (weeklyReport.metrics.tradeCount === 0) {
    return "주간 데이터가 아직 충분하지 않습니다.";
  }

  return `최근 7일 순손익은 ${formatCurrency(weeklyReport.metrics.netPnl)}이고, 승률은 ${formatPercent(weeklyReport.metrics.winRate)}입니다.`;
}

export function buildSessionCompareSummary(compareReport: SessionCompareResponse) {
  const current = compareReport.comparisons[0];

  if (!current) {
    return "비교 가능한 세션이 아직 없습니다.";
  }

  if (current.deltaNetPnl > 0) {
    return `현재 세션은 기준 세션 대비 ${formatCurrency(current.deltaNetPnl)} 앞서 있습니다.`;
  }

  if (current.deltaNetPnl < 0) {
    return `현재 세션은 기준 세션 대비 ${formatCurrency(current.deltaNetPnl)} 뒤처지고 있습니다.`;
  }

  return "현재 세션과 기준 세션의 순손익 차이가 크지 않습니다.";
}

export function translateRecommendation(title: string, detail: string) {
  return recommendationMap[title] ?? {
    title,
    detail
  };
}

export function translatePerformanceLabel(row: PerformanceBreakdownView) {
  if (row.key === "bb-mean-reversion") {
    return "A 전략";
  }

  if (row.key === "ema-trend-pullback") {
    return "B 전략";
  }

  if (row.key === "volatility-breakout") {
    return "C 전략";
  }

  return getReasonLabel(row.key, row.label);
}

export function buildEntryReasonLine(position: PositionView | null, latestTrade: TradeView | null) {
  if (position) {
    return getReasonText(position.entryReasonCode, position.entryReasonText);
  }

  if (latestTrade) {
    return getReasonText(latestTrade.reasonCode, latestTrade.reasonText);
  }

  return "현재 표시할 진입 사유가 없습니다.";
}

export function buildAgentStateLine(position: PositionView | null, system: SystemStatusView) {
  const syncText = system.workerHealthy ? "봇은 정상 동기화 상태" : "봇 동기화가 지연된 상태";

  if (position) {
    return `현재 ${position.symbol} ${getSideLabel(position.side)} 포지션을 유지 중이며, ${syncText}입니다.`;
  }

  return `현재 포지션 없이 대기 중이며, ${syncText}입니다.`;
}

export function buildAgentStateLabel(position: PositionView | null, runtime?: RuntimeStateResponse) {
  if (runtime?.killSwitch.enabled) {
    return "거래 금지";
  }

  if (!position) {
    return "관망";
  }

  return position.side === "LONG" ? "롱 유지" : "숏 유지";
}

export function buildAgentDailyNarrative(dailyReport: DailyReportResponse) {
  if (dailyReport.metrics.tradeCount === 0) {
    return "오늘은 아직 충분한 거래가 없어 판단을 보류하는 상태입니다.";
  }

  return `오늘은 ${dailyReport.metrics.tradeCount}번 체결했고 승률은 ${formatPercent(dailyReport.metrics.winRate)}입니다. 수수료는 ${formatCurrency(
    dailyReport.metrics.totalFees
  )}로, 현재 순손익은 ${formatSignedCurrency(dailyReport.metrics.netPnl)}입니다.`;
}

export function buildStrategyNarrative(strategy: StrategyView | null) {
  if (!strategy || strategy.key !== "bb-mean-reversion") {
    return "현재 전략 설명 데이터가 없습니다.";
  }

  return "A 전략은 과도하게 눌린 구간만 골라 짧은 평균 회귀를 노리고, 예상 수익이 비용보다 충분히 크지 않으면 진입하지 않습니다.";
}

export function buildEntryReasonBullets(position: PositionView | null, latestTrade: TradeView | null) {
  const code = position?.entryReasonCode ?? latestTrade?.reasonCode ?? null;

  if (code === "LOWER_BAND_TOUCH") {
    return ["BB 하단 복귀", "RSI 반등", "비용 필터 통과"];
  }

  if (code === "MEAN_REVERSION_COMPLETE") {
    return ["평균 회귀 완료", "목표 구간 도달", "청산 신호 확인"];
  }

  if (code === "WEAK_REBOUND_STOP") {
    return ["반등 약화", "회복 실패", "손절 조건 충족"];
  }

  return ["근거 데이터 부족", "최근 신호 재확인"];
}

export function buildStrategyBullets(strategy: StrategyView | null) {
  if (!strategy) {
    return ["전략 데이터 없음"];
  }

  if (strategy.code === "B") {
    return ["보수적 진입값", "낮은 빈도 유지", "비용 우위 우선"];
  }

  if (strategy.code === "C") {
    return ["공격적 진입값", "실험 세션 전용", "수동 검토 우선"];
  }

  return ["과매도 구간 선별", "평균 회귀만 대응", "비용 우위 진입"];
}

export function buildRiskNarrative(dailyReport: DailyReportResponse, position: PositionView | null) {
  const lossDriver = dailyReport.report.lossDrivers[0];

  if (position && position.unrealizedPnl < 0) {
    return `현재 포지션이 ${formatSignedCurrency(position.unrealizedPnl)} 구간에 있어 반등 강도가 약해지면 손실이 커질 수 있습니다.`;
  }

  if (lossDriver) {
    return `${getReasonLabel(lossDriver.key, lossDriver.label)} 구간이 가장 큰 손실 원인이라, 반등이 약한 장세에서는 진입을 더 보수적으로 볼 필요가 있습니다.`;
  }

  return "현재 가장 큰 리스크는 거래 비용과 약한 반등 구간입니다. 손실 구간이 반복되는지 계속 관찰해야 합니다.";
}

export function buildAgentRecommendations(dailyReport: DailyReportResponse) {
  return dailyReport.report.recommendations.slice(0, 2).map((row) => translateRecommendation(row.title, row.detail).detail);
}

export function buildAgentRecommendationBullets(dailyReport: DailyReportResponse) {
  return dailyReport.report.recommendations.slice(0, 2).map((row) => recommendationShortMap[row.title] ?? translateRecommendation(row.title, row.detail).title);
}

export function buildRiskBullets(dailyReport: DailyReportResponse, position: PositionView | null, runtime?: RuntimeStateResponse) {
  if (runtime?.killSwitch.enabled) {
    return ["킬 스위치 활성", "신규 거래 중단"];
  }

  if (position && position.unrealizedPnl < 0) {
    return ["반등 약화", "손실 확대 위험"];
  }

  const lossDriver = dailyReport.report.lossDrivers[0];

  if (lossDriver?.key === "WEAK_REBOUND_STOP") {
    return ["반등 약화", "추세 전환 위험"];
  }

  return ["비용 부담", "추세 이탈 주의"];
}

export function buildAgentEvents(trades: TradeView[], logs: LogView[]): AgentEventRow[] {
  const tradeEvents = trades.map((trade) => ({
    id: `trade-agent-${trade.id}`,
    tone: tradeTone(trade),
    timestamp: new Date(trade.executedAt).getTime(),
    sentence: `${formatCompactDate(trade.executedAt)} ${trade.symbol} ${getActionLabel(trade.action)} · ${getReasonLabel(trade.reasonCode)} · ${formatSignedCurrency(
      trade.realizedPnl
    )}`
  }));
  const logEvents = logs.map((log) => ({
    id: `log-agent-${log.id}`,
    tone: logTone(log),
    timestamp: new Date(log.createdAt).getTime(),
    sentence: `${formatCompactDate(log.createdAt)} ${getSourceLabel(log.source)} · ${getLogMessageKorean(log.message)}`
  }));

  return [...tradeEvents, ...logEvents]
    .sort((left, right) => right.timestamp - left.timestamp)
    .map(({ id, sentence, tone }) => ({
      id,
      sentence,
      tone
    }));
}

function buildPositionPreparationLog(position: PositionView): AgentLogRow[] {
  const base = new Date(position.openedAt).getTime();
  const reasons = position.entryReasonText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const prepRows: Array<{
    id: string;
    at: number;
    tag: AgentLogTag;
    message: string;
    detail?: string | null;
    bullets?: string[];
    filter?: AgentLogFilter;
    result?: string | null;
    tone: AgentLogRow["tone"];
  }> = [
    {
      id: `position-prep-${position.id}`,
      at: base - 5_000,
      tag: "INFO",
      message: `${position.strategyCode ?? "-"} 전략 진입 준비`,
      detail: "현재 포지션 기준으로 최근 진입 준비 단계를 복원했습니다.",
      bullets: ["전략 평가 시작", "진입 근거 점검"],
      filter: "all",
      tone: "neutral"
    }
  ];

  reasons.forEach((reason, index) => {
    prepRows.push({
      id: `position-step-${position.id}-${index}`,
      at: base - (reasons.length - index) * 1_000,
      tag: reason.includes("필터") ? "FILTER" : "ENTRY",
      message: reason,
      detail: reason.includes("필터") ? "진입 전 필터를 통과한 항목입니다." : "진입 근거로 사용된 조건입니다.",
      bullets: [reason],
      filter: reason.includes("필터") ? "skip" : "entry",
      tone: "neutral"
    });
  });

  prepRows.push({
    id: `position-enter-${position.id}`,
    at: base,
    tag: "ENTRY",
    message: `${position.symbol} ${getSideLabel(position.side)} 진입`,
    detail: "현재 열려 있는 포지션의 진입 기록입니다.",
    bullets: position.entryReasonText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3),
    filter: "entry",
    tone: position.unrealizedPnl >= 0 ? "positive" : "neutral"
  });

  return prepRows
    .sort((left, right) => left.at - right.at)
    .map((row) => ({
      id: row.id,
      tag: row.tag,
      time: formatTimeOnly(new Date(row.at).toISOString()),
      message: row.message,
      detail: row.detail ?? null,
      bullets: row.bullets ?? [],
      filter: row.filter ?? "all",
      result: row.result ?? null,
      tone: row.tone
    }));
}

function buildTradeLogRow(trade: TradeView): AgentLogRow {
  const tag: AgentLogTag = trade.action === "BUY" ? "ENTRY" : "EXIT";
  const reasonMeta = asRecord(trade.reasonMeta);
  const bullets = buildReasonBullets(reasonMeta, trade.action === "BUY" ? "ENTRY_PLACED" : trade.action === "STOP_LOSS" ? "EXIT_STOP_LOSS" : "EXIT_TAKE_PROFIT");
  const detail =
    trade.action === "BUY"
      ? deriveEntryDetail(reasonMeta)
      : deriveExitDetail(trade.action === "STOP_LOSS" ? "EXIT_STOP_LOSS" : "EXIT_TAKE_PROFIT", reasonMeta);

  return {
    id: `trade-log-${trade.id}`,
    tag,
    time: formatTimeOnly(trade.executedAt),
    message: `${trade.symbol} ${getActionLabel(trade.action)} · ${getReasonLabel(trade.reasonCode, trade.reasonText)}`,
    detail,
    bullets,
    filter: getFilterByTrade(trade),
    result: formatSignedCurrency(trade.realizedPnl),
    tone: tradeTone(trade)
  };
}

function inferLogTag(log: LogView): AgentLogTag {
  if (log.level === "ERROR" || log.level === "WARN" || log.source === "risk-guard") {
    return "ALERT";
  }

  if (log.message.includes("필터") || log.source === "trade-filter") {
    return "FILTER";
  }

  if (log.message.includes("진입")) {
    return "ENTRY";
  }

  if (log.message.includes("청산") || log.message.includes("익절") || log.message.includes("손절")) {
    return "EXIT";
  }

  return "INFO";
}

function buildSystemLogRow(log: LogView): AgentLogRow {
  return {
    id: `system-log-${log.id}`,
    tag: inferLogTag(log),
    time: formatTimeOnly(log.createdAt),
    message: `${getSourceLabel(log.source)} · ${getLogMessageKorean(log.message)}`,
    detail: log.context && Object.keys(log.context).length > 0 ? "시스템 컨텍스트가 함께 기록된 이벤트입니다." : null,
    bullets: [],
    filter: getFilterByLog(log),
    result: null,
    tone: logTone(log)
  };
}

export function buildAgentLogRows(position: PositionView | null, trades: TradeView[], logs: LogView[]) {
  const rows = [
    ...(position ? buildPositionPreparationLog(position).map((row, index) => ({ ...row, at: new Date(position.openedAt).getTime() - 6_000 + index })) : []),
    ...trades.map((trade) => ({ ...buildTradeLogRow(trade), at: new Date(trade.executedAt).getTime() })),
    ...logs.map((log) => ({ ...buildSystemLogRow(log), at: new Date(log.createdAt).getTime() }))
  ];

  return rows
    .sort((left, right) => left.at - right.at || left.id.localeCompare(right.id))
    .slice(-24)
    .map(({ at: _at, ...row }) => row);
}

export function buildAgentLogRowsFromPaperEvents(events: PaperEventView[]) {
  return events.slice(-40).map((event) => {
    let tag: AgentLogTag = "INFO";

    if (event.eventType === "ENTRY_PLACED") {
      tag = "ENTRY";
    } else if (event.eventType === "EXIT_TAKE_PROFIT" || event.eventType === "EXIT_STOP_LOSS") {
      tag = "EXIT";
    } else if (event.eventType === "TRADE_SKIPPED" || event.eventType === "COOLDOWN_TRIGGERED") {
      tag = "FILTER";
    } else if (event.eventType === "ERROR") {
      tag = "ALERT";
    }

    const tone: AgentLogRow["tone"] =
      typeof event.pnlDelta === "number" ? (event.pnlDelta > 0 ? "positive" : event.pnlDelta < 0 ? "negative" : "neutral") : event.level === "ERROR" ? "negative" : "neutral";
    const result =
      typeof event.pnlDelta === "number"
        ? `${event.pnlDelta > 0 ? "+" : ""}${formatCurrency(event.pnlDelta)}`
        : typeof event.fee === "number"
          ? `fee ${formatCurrency(event.fee)}`
          : null;
    const reasonMeta = asRecord(event.reasonMeta);
    const filter = getFilterByEventType(event.eventType, event.pnlDelta);
    const bullets = buildReasonBullets(reasonMeta, event.eventType);
    const detail =
      event.eventType === "ENTRY_PLACED"
        ? deriveEntryDetail(reasonMeta)
        : event.eventType === "EXIT_TAKE_PROFIT" || event.eventType === "EXIT_STOP_LOSS"
          ? deriveExitDetail(event.eventType, reasonMeta)
          : event.eventType === "TRADE_SKIPPED" || event.eventType === "COOLDOWN_TRIGGERED"
            ? deriveSkipDetail(reasonMeta)
            : null;

    return {
      id: event.id,
      tag,
      time: formatTimeOnly(event.timestamp),
      message: `${event.symbol ? `${event.symbol} · ` : ""}${event.message}`,
      detail,
      bullets,
      filter,
      result,
      tone
    } satisfies AgentLogRow;
  });
}

export function buildAgentSuggestionItems(dailyReport: DailyReportResponse): AgentSuggestionItem[] {
  const primaryLoss = dailyReport.report.lossDrivers[0];

  const recommendations = dailyReport.report.recommendations.slice(0, 2).map((recommendation, index) => {
    const translated = translateRecommendation(recommendation.title, recommendation.detail);

    return {
      id: `${recommendation.title}-${index}`,
      issue: primaryLoss ? getReasonLabel(primaryLoss.key, primaryLoss.label) : "조정 필요 구간 감지",
      cause: primaryLoss?.detail ?? dailyReport.report.summary.body,
      action: translated.detail
    };
  });

  if (recommendations.length > 0) {
    return recommendations;
  }

  return [
    {
      id: "default-suggestion",
      issue: "표본 부족",
      cause: "오늘 데이터만으로는 손실 패턴을 확정하기 어렵습니다.",
      action: "현재 규칙을 유지한 채 같은 조건으로 표본을 더 쌓아 주세요."
    }
  ];
}

export function buildAgentRiskSnapshot(position: PositionView | null, trades: TradeView[]) {
  if (!position) {
    return null;
  }

  const entryTrade =
    [...trades]
      .sort((left, right) => new Date(right.executedAt).getTime() - new Date(left.executedAt).getTime())
      .find((trade) => trade.symbol === position.symbol && trade.strategyId === position.strategyId && trade.action === "BUY") ?? null;
  const reasonMeta = asRecord(entryTrade?.reasonMeta);
  const { bandWidthPct, expectedReboundPct, stopPrice, targetPrice } = deriveRiskPrices(position, reasonMeta);
  const maxLossUsd = Math.max(0, (position.entryPrice - stopPrice) * position.quantity + position.feesPaid);
  const noteParts = [];

  if (expectedReboundPct !== null) {
    noteParts.push(`예상 반등 ${expectedReboundPct.toFixed(2)}%`);
  }

  if (bandWidthPct !== null) {
    noteParts.push(`밴드폭 ${bandWidthPct.toFixed(2)}%`);
  }

  if (noteParts.length === 0) {
    noteParts.push("최근 진입 근거 기반 추정");
  }

  return {
    symbol: position.symbol,
    side: getSideLabel(position.side),
    entryPrice: formatPrice(position.entryPrice),
    stopPrice: formatPrice(stopPrice),
    targetPrice: formatPrice(targetPrice),
    positionSize: `${position.quantity.toFixed(4)} · ${formatCurrency(position.entryPrice * position.quantity)}`,
    maxLossUsd: formatCurrency(maxLossUsd),
    note: noteParts.join(" · ")
  } satisfies AgentRiskSnapshot;
}

export function buildAgentTrustMetrics(
  dashboard: DashboardSummaryResponse,
  dailyReport: DailyReportResponse,
  weeklyReport: WeeklyReportResponse
) {
  const maxDrawdown = calculateMaxDrawdown(weeklyReport.dailySeries);

  return [
    {
      label: "오늘 승률",
      value: formatPercent(dailyReport.metrics.winRate),
      tone: dailyReport.metrics.winRate >= 0.5 ? "positive" : "negative"
    },
    {
      label: "주간 승률",
      value: formatPercent(weeklyReport.metrics.winRate),
      tone: weeklyReport.metrics.winRate >= 0.5 ? "positive" : "negative"
    },
    {
      label: "누적 손익",
      value: formatSignedCurrency(dashboard.account.totalPnlUsd),
      tone: dashboard.account.totalPnlUsd >= 0 ? "positive" : "negative"
    },
    {
      label: "최대 낙폭",
      value: formatSignedCurrency(maxDrawdown),
      tone: maxDrawdown < 0 ? "negative" : "neutral"
    }
  ] satisfies AgentTrustMetric[];
}
