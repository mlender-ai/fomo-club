import type { CoverageFlag, FactSheetFiscal, FiledAtSource, QuarterRecord } from "./types";

/**
 * TTM 구성 + look-ahead 가드 (WO-SUB-01 §6-1·§6-2).
 *
 * - 최근 공시된 4개 분기의 합. `composed_of` 에 사용 분기를 반드시 기록한다.
 * - 4개가 모이지 않으면 TTM 은 `null`. **연환산 금지.**
 * - 시점 d 기준 TTM 은 `filed_at <= d` 인 분기만 쓴다. 이 규칙을 어기면 과거 밴드가
 *   미래 정보로 오염되고 그 위에 세운 WO-SUB-05 등급·WO-SUB-07 채점이 전부 무효가 된다.
 */

/** 분기 4개 = TTM 1개. 이 수를 줄이거나 연환산으로 대체하지 않는다. */
export const TTM_QUARTERS = 4;
/** 마진 표준편차·트렌드 판정에 필요한 최소 분기 수. */
export const STDEV_QUARTERS = 8;

/** 기간말 오름차순 정렬(동일 기간말은 공시일이 늦은 쪽이 뒤 — 정정공시 우선). */
export function sortQuarters(quarters: readonly QuarterRecord[]): QuarterRecord[] {
  return [...quarters].sort((a, b) => {
    const byEnd = a.period_end.localeCompare(b.period_end);
    return byEnd !== 0 ? byEnd : a.filed_at.localeCompare(b.filed_at);
  });
}

/**
 * 같은 기간말이 여러 번 나오면(정정공시) **가장 늦게 공시된 것 하나만** 남긴다.
 * 정정 전 값과 정정 후 값을 둘 다 TTM 에 넣으면 이중 계산이 된다.
 */
export function dedupeByPeriodEnd(quarters: readonly QuarterRecord[]): QuarterRecord[] {
  const byEnd = new Map<string, QuarterRecord>();
  for (const q of sortQuarters(quarters)) byEnd.set(q.period_end, q);
  return sortQuarters([...byEnd.values()]);
}

/** 시점 d 에 공시돼 있던 분기만. d 를 주지 않으면 전체(=최신 시점). */
export function quartersAsOf(quarters: readonly QuarterRecord[], asOf?: string): QuarterRecord[] {
  const deduped = dedupeByPeriodEnd(quarters);
  if (!asOf) return deduped;
  return deduped.filter((q) => q.filed_at <= asOf);
}

function sumField(
  quarters: readonly QuarterRecord[],
  field: "revenue" | "operating_income" | "net_income" | "eps_diluted"
): number | null {
  let total = 0;
  for (const q of quarters) {
    const v = q[field];
    // 하나라도 결측이면 합계는 null — 나머지 3개로 4분기 합을 흉내 내지 않는다.
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    total += v;
  }
  return total;
}

export interface TtmResult {
  revenue: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_diluted: number | null;
  composed_of: string[];
}

/**
 * 시점 `asOf` 기준 TTM. 4분기 미달이면 값 전부 `null` 이고 `composed_of` 는
 * 실제로 모인 분기만 담는다(왜 못 만들었는지 감사할 수 있게).
 */
export function composeTtm(quarters: readonly QuarterRecord[], asOf?: string): TtmResult {
  const visible = quartersAsOf(quarters, asOf);
  const recent = visible.slice(-TTM_QUARTERS);
  const composed = recent.map((q) => q.period);
  if (recent.length < TTM_QUARTERS) {
    return { revenue: null, operating_income: null, net_income: null, eps_diluted: null, composed_of: composed };
  }
  return {
    revenue: sumField(recent, "revenue"),
    operating_income: sumField(recent, "operating_income"),
    net_income: sumField(recent, "net_income"),
    eps_diluted: sumField(recent, "eps_diluted"),
    composed_of: composed,
  };
}

/**
 * 결산월/회계연도 변경 감지. 연속한 분기 기간말 간격이 정상 범위(80~100일)를 벗어나면
 * 결산 구조가 바뀐 것으로 보고 TTM 을 만들지 않는다(§6-1).
 * 실패가 아니라 사실이므로 사유 문자열을 그대로 남긴다.
 */
export function detectFiscalAnomaly(quarters: readonly QuarterRecord[]): string | null {
  const sorted = dedupeByPeriodEnd(quarters).slice(-TTM_QUARTERS - 1);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const days = (Date.parse(cur.period_end) - Date.parse(prev.period_end)) / 86_400_000;
    if (!Number.isFinite(days)) return `기간말 파싱 실패(${prev.period_end}→${cur.period_end})`;
    if (days < 60 || days > 130) {
      return `분기 간격 이상 ${Math.round(days)}일(${prev.period_end}→${cur.period_end}) — 결산월 변경 가능`;
    }
  }
  return null;
}

export function coverageFlagOf(
  quarters: readonly QuarterRecord[],
  annual: readonly QuarterRecord[],
  anomaly: string | null
): CoverageFlag {
  if (quarters.length === 0 && annual.length === 0) return "none";
  if (anomaly) return "partial";
  return quarters.length >= STDEV_QUARTERS ? "full" : "partial";
}

/** 최근 8분기 + 최근 5회계연도로 fiscal 블록을 조립한다. */
export function composeFiscal(
  quartersIn: readonly QuarterRecord[],
  annualIn: readonly QuarterRecord[]
): FactSheetFiscal {
  const quarters = dedupeByPeriodEnd(quartersIn).slice(-STDEV_QUARTERS);
  const annual = dedupeByPeriodEnd(annualIn).slice(-5);
  const anomaly = detectFiscalAnomaly(quarters);
  // 결산 구조가 바뀐 종목은 TTM 을 만들지 않는다 — 서로 다른 길이의 기간을 더하면 가짜 숫자가 된다.
  const ttm = anomaly
    ? { revenue: null, operating_income: null, net_income: null, eps_diluted: null, composed_of: quarters.slice(-TTM_QUARTERS).map((q) => q.period) }
    : composeTtm(quarters);
  return {
    filed_at_source: rollupFiledAtSource(quarters),
    // 조립 단계에서 실제 밴드 입력 수로 덮어쓴다(composeFiscal 은 표시용만 안다).
    band_quarters: quarters.length,
    quarters,
    annual,
    ttm,
    coverage_flag: coverageFlagOf(quarters, annual, anomaly),
    fiscal_anomaly: anomaly,
  };
}

/**
 * 분기 레코드의 `filed_at_source` 롤업 — **보수적으로 내려 잡는다.**
 *
 * 섞여 있을 때 `disclosed` 로 표시하면 추정 공시일 위에서 계산된 밴드를 실측으로
 * 착각하게 된다. 하나라도 추정이면 전체가 추정이다.
 */
export function rollupFiledAtSource(quarters: readonly QuarterRecord[]): FiledAtSource {
  if (quarters.length === 0) return "none";
  return quarters.some((quarter) => (quarter.filed_at_source ?? "disclosed") === "statutory_deadline")
    ? "statutory_deadline"
    : "disclosed";
}
