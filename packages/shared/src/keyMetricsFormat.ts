// KeyMetricsGrid의 표시 로직(결측 필터 · 값 포맷 · 티어 분류)을 UI에서 분리한 순수 함수.
// 외부 데이터 결측/이상값에 대한 정합성을 테스트 가능하게 만들기 위함 (#293).
import type { KeyMetrics } from "./stockTypes";

export type MetricTier = "primary" | "secondary";

export interface KeyMetricCard {
  label: string;
  value: string;
  tier: MetricTier;
}

// 큰 수를 통화별 단위(조/억 · T/B/M)로 축약. 음수도 부호를 유지한다.
export function formatLargeNumber(n: number, currency: string): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (currency === "KRW") {
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`;
    if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(0)}억`;
    return n.toLocaleString("ko-KR");
  }
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

const formatRatio = (n: number, suffix = "") => `${n.toFixed(2)}${suffix}`;
const formatPercent = (n: number) => `${(n * 100).toFixed(2)}%`;

// 결측(null/NaN/무한대)이 아닌 유효 숫자만 카드로 변환해 반환.
// 표시 순서는 투자 판단 영향이 큰 primary 지표 먼저, 보조 secondary 지표가 뒤따른다.
export function buildKeyMetricCards(metrics: KeyMetrics, currency = "USD"): KeyMetricCard[] {
  const isNum = (v: number | null): v is number => v != null && Number.isFinite(v);

  const defs: { label: string; raw: number | null; format: (n: number) => string; tier: MetricTier }[] = [
    // primary: 투자 판단에 직접 영향이 큰 지표
    { label: "EPS", raw: metrics.eps, format: (n) => formatRatio(n), tier: "primary" },
    { label: "순이익률", raw: metrics.profitMargins, format: formatPercent, tier: "primary" },
    { label: "ROA", raw: metrics.returnOnAssets, format: formatPercent, tier: "primary" },
    { label: "잉여현금흐름", raw: metrics.freeCashflow, format: (n) => formatLargeNumber(n, currency), tier: "primary" },
    // secondary: 보조 지표
    { label: "PEG", raw: metrics.pegRatio, format: (n) => formatRatio(n, "배"), tier: "secondary" },
    { label: "PSR", raw: metrics.priceToSalesTrailing12Months, format: (n) => formatRatio(n, "배"), tier: "secondary" },
    { label: "BPS", raw: metrics.bookValue, format: (n) => formatRatio(n), tier: "secondary" },
    { label: "매출총이익률", raw: metrics.grossMargins, format: formatPercent, tier: "secondary" },
    { label: "유동비율", raw: metrics.currentRatio, format: (n) => formatRatio(n), tier: "secondary" },
    { label: "당좌비율", raw: metrics.quickRatio, format: (n) => formatRatio(n), tier: "secondary" },
    { label: "총현금", raw: metrics.totalCash, format: (n) => formatLargeNumber(n, currency), tier: "secondary" },
    { label: "총부채", raw: metrics.totalDebt, format: (n) => formatLargeNumber(n, currency), tier: "secondary" },
  ];

  return defs
    .filter((d) => isNum(d.raw))
    .map((d) => ({ label: d.label, value: d.format(d.raw as number), tier: d.tier }));
}
