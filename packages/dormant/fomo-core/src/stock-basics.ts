/**
 * 종목 기본 정보(바닥) — STOCK_SCREEN_REDESIGN. 순수(네트워크 0).
 *
 * 인식 전환: 주가·시총·재무·회사개요는 *DB 객관 사실*이라 원문 grounding 대상이 아니다.
 * 항상 깔리는 바닥. 강세/약세 "해석"만 원문 grounded(별도 레이어). 토스 구조와 동일.
 *
 * 여기 함수들은 네이버 금융 JSON(이미 쓰는 무료·무인증 출처)을 *파싱·번역*만 한다(fetch 는 apps/web).
 * 정직 원칙: 없는 값은 omit(가짜 숫자 금지). 추정치는 estimate 플래그로 구분.
 * "쉽게" 정체성: 정확한 숫자 + 친구 말투 번역(전문용어는 보조 라벨로만 — types.ts 전문용어 금지 존중).
 */

export interface StockMetric {
  /** 쉬운 라벨(주력 표기) — 예 "한 주가 번 돈". */
  label: string;
  /** 정확한 값(숫자, 단위 포함) — 예 "12,372원". */
  value: string;
  /** 보조 용어(작게) — 예 "EPS". 초보는 label 을, 고급은 term 을 본다. */
  term?: string;
  /** 이게 무슨 뜻인지 한 줄(A) — *사실까지만*(싸다/비싸다/사라 금지). 판단은 유저 몫. */
  note?: string;
}

export interface StockFinancialRow {
  /** 쉬운 항목명 — 예 "벌어들인 돈(매출)". */
  label: string;
  /** 기간별 값(친구 단위로 포맷). periods 순서와 매칭. */
  values: string[];
  /** 동일 기간의 원시 숫자. YoY·마진 같은 결정론 계산에만 쓰며 결측은 null. */
  rawValues?: Array<number | null>;
}

export interface StockFinancials {
  periods: { title: string; estimate: boolean }[];
  rows: StockFinancialRow[];
  /** 이익 안정성 한 줄(A) — *사실까지만*. 예 "남기는 돈이 해마다 출렁여". */
  note?: string;
}

export interface StockValuationHistory {
  periods: string[];
  per?: number[];
  pbr?: number[];
  psr?: number[];
  label: string;
}

/** PER → "이게 무슨 뜻" 한 줄(사실: 시장 기대 수준 묘사. 싸다/비싸다 단정 금지). */
function perNote(value: string): string | undefined {
  const n = num(value);
  if (n === null || n <= 0) return undefined;
  if (n >= 50) return "주가가 버는 돈의 수십 배 수준 — 시장이 앞으로의 성장을 크게 기대한다는 뜻이에요(기대가 식으면 출렁일 수 있어요).";
  if (n >= 15) return "버는 돈에 비해 주가에 성장 기대가 어느 정도 들어가 있어요.";
  return "버는 돈 대비 주가는 차분한 편 — 큰 성장 기대가 반영되진 않았어요.";
}

/** 영업이익 추이 → 이익 안정성 한 줄(사실: 변동/적자 여부 묘사). 안전이면 undefined(군더더기 없이). */
function stabilityNote(opRaw: (number | null)[]): string | undefined {
  const vals = opRaw.filter((v): v is number => v !== null);
  if (vals.length < 2) return undefined;
  const hasLoss = vals.some((v) => v < 0);
  const pos = vals.filter((v) => v > 0);
  const swing = pos.length >= 2 && Math.max(...pos) / Math.min(...pos) >= 2;
  if (hasLoss) return "해에 따라 적자도 있어요 — 남기는 돈의 기복이 큰 편이에요.";
  if (swing) return "남기는 돈이 해마다 출렁여요 — 이익 안정성은 낮은 편이에요.";
  return "남기는 돈이 해마다 비교적 꾸준한 편이에요.";
}

export interface StockBasics {
  name: string;
  /** 거래소/시장 — 예 "코스피". */
  market?: string;
  /** 현재가 — 예 "362,500원". */
  priceText?: string;
  /** 등락 — 예 "2,000 (0.55%)" (부호·색은 UI). */
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  /** 시가총액 — 네이버 친구 표기 그대로 "2,069조 5,826억". */
  marketCap?: string;
  /** 섹터/산업명. */
  sector?: string;
  /** 회사 개요(1~2줄). */
  summary?: string;
  /** 핵심 지표(PER/EPS/PBR/배당/52주 등) — 쉬운 라벨 + 정확 값. */
  metrics: StockMetric[];
  /** 연간 재무(매출·영업이익·순이익 등). 없으면 undefined. */
  financials?: StockFinancials;
  /** 실제 연간 배수 이력. 확보된 기간만 명시하며 5년 미만을 5년으로 부풀리지 않는다. */
  valuationHistory?: StockValuationHistory;
}

const num = (s: string): number | null => {
  const cleaned = String(s).replace(/[^\d.-]/g, "");
  if (!/\d/.test(cleaned)) return null; // 숫자 없음("N/A"·"-") → null(0 으로 둔갑 금지)
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/** 억원 문자열("3,336,059") → 친구 단위("333.6조" / "4,360억"). 음수·결측 안전. */
export function formatEok(value: string): string | null {
  const n = num(value);
  if (n === null) return null;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 10000) {
    const jo = Math.round((abs / 10000) * 10) / 10; // 0.1조 단위 반올림
    const joStr = Number.isInteger(jo) ? jo.toLocaleString() : jo.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `${sign}${joStr}조`;
  }
  return `${sign}${Math.round(abs).toLocaleString()}억`;
}

/** 네이버 stock/{code}/basic → 주가·등락·시장. */
export function parseNaverStockBasic(json: unknown): Partial<StockBasics> {
  const d = (json ?? {}) as Record<string, unknown>;
  const out: Partial<StockBasics> = {};
  if (typeof d.stockName === "string") out.name = d.stockName;
  if (typeof d.stockExchangeName === "string") out.market = d.stockExchangeName;
  const close = d.closePrice;
  if (typeof close === "string" && close.trim()) out.priceText = `${close}원`;
  const ratio = d.fluctuationsRatio;
  const change = d.compareToPreviousClosePrice ?? d.compareToPreviousPrice;
  if (change !== undefined && change !== null && `${change}`.trim()) {
    const r = ratio !== undefined && ratio !== null ? ` (${ratio}%)` : "";
    out.changeText = `${`${change}`.replace(/^[+-]+/, "")}${r}`;
  }
  const code = typeof d.compareToPreviousClosePrice === "object" ? null : null; // (구조 변동 방어)
  void code;
  // 방향: code/부호 — compareToPreviousPrice 의 부호 또는 ratio 부호.
  const rNum = num(`${ratio ?? ""}`);
  const cNum = num(`${change ?? ""}`);
  const basis = cNum ?? rNum;
  out.changeDir = basis === null || basis === 0 ? "flat" : basis > 0 ? "up" : "down";
  return out;
}

/** totalInfos 항목(key→value) 추출 + 핵심 지표를 쉬운 라벨로. */
export function parseNaverTotalInfos(json: unknown): { marketCap?: string; metrics: StockMetric[] } {
  const d = (json ?? {}) as Record<string, unknown>;
  const infos = Array.isArray(d.totalInfos) ? (d.totalInfos as Record<string, unknown>[]) : [];
  const by = new Map<string, string>();
  for (const t of infos) {
    const k = typeof t.key === "string" ? t.key : "";
    const v = t.value;
    if (k && (typeof v === "string" || typeof v === "number")) by.set(k, `${v}`);
  }
  const metrics: StockMetric[] = [];
  const push = (key: string, label: string, term?: string) => {
    const v = by.get(key);
    if (v && v.trim() && v !== "-" && v !== "N/A") metrics.push(term ? { label, value: v, term } : { label, value: v });
  };
  // 쉬운 라벨 + 보조 용어(작게). 정확한 값은 네이버 표기 그대로.
  push("PER", "지금 주가는 이익의", "PER"); // 값 "28.61배" → "이익의 28.61배 수준"
  push("EPS", "한 주가 번 돈", "EPS");
  push("PBR", "자산 가치 대비", "PBR");
  push("배당수익률", "배당 수익률", "배당수익률");
  push("주당배당금", "한 주당 배당금", "주당배당금");
  push("52주 최고", "최근 1년 최고가");
  push("52주 최저", "최근 1년 최저가");
  push("외인소진율", "외국인이 가진 비율", "외인소진율");
  // A — PER 에 "무슨 뜻" 한 줄(사실까지만).
  const per = metrics.find((m) => m.term === "PER");
  if (per) {
    const note = perNote(per.value);
    if (note) per.note = note;
  }
  const out: { marketCap?: string; metrics: StockMetric[] } = { metrics };
  const cap = by.get("시총");
  if (cap && cap.trim()) out.marketCap = cap;
  return out;
}

/** finance/annual → 회사개요 + 연간 재무(매출·영업이익·순이익 중심, 추정치 구분). */
export function parseNaverFinanceAnnual(json: unknown): {
  summary?: string;
  financials?: StockFinancials;
} {
  const d = (json ?? {}) as Record<string, unknown>;
  const out: { summary?: string; financials?: StockFinancials } = {};
  const cs = d.corporationSummary;
  if (typeof cs === "string" && cs.trim()) out.summary = cs.trim();
  else if (cs && typeof cs === "object") {
    // 네이버: corporationSummary = { comment1, comment2, comment3, ... } (회사개요 문장들).
    const o = cs as Record<string, unknown>;
    const comments = Object.keys(o)
      .filter((k) => /^comment\d+$/.test(k))
      .sort()
      .map((k) => o[k])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    const joined = comments.length > 0 ? comments.join(" ") : "";
    const fallback = typeof o.summary === "string" ? o.summary : typeof o.text === "string" ? o.text : "";
    const s = (joined || fallback).trim();
    if (s) out.summary = s;
  }

  const fi = (d.financeInfo ?? {}) as Record<string, unknown>;
  const trList = Array.isArray(fi.trTitleList) ? (fi.trTitleList as Record<string, unknown>[]) : [];
  const rowList = Array.isArray(fi.rowList) ? (fi.rowList as Record<string, unknown>[]) : [];
  if (trList.length === 0 || rowList.length === 0) return out;

  const periods = trList.map((t) => ({
    title: typeof t.title === "string" ? t.title.replace(/\.$/, "") : "",
    estimate: t.isConsensus === "Y",
    key: typeof t.key === "string" ? t.key : "",
  }));

  // 쉬운 항목명(주력) — 네이버 원항목명은 보조. 매출·영업이익·순이익만(바닥 핵심).
  const WANT: { match: string; label: string }[] = [
    { match: "매출액", label: "벌어들인 돈(매출)" },
    { match: "영업이익", label: "남긴 돈(영업이익)" },
    { match: "당기순이익", label: "최종 이익(순이익)" },
  ];
  const rows: StockFinancialRow[] = [];
  for (const want of WANT) {
    const r = rowList.find((x) => typeof x.title === "string" && (x.title as string).includes(want.match));
    if (!r) continue;
    const cols = (r.columns ?? {}) as Record<string, { value?: string }>;
    const rawValues = periods.map((p) => num(cols[p.key]?.value ?? ""));
    const values = periods.map((p) => {
      const raw = cols[p.key]?.value;
      return raw ? formatEok(raw) ?? raw : "—";
    });
    // 전부 결측이면 행 자체를 넣지 않는다(가짜로 안 채움).
    if (values.some((v) => v !== "—")) rows.push({ label: want.label, values, rawValues });
  }
  if (rows.length > 0) {
    const financials: StockFinancials = {
      periods: periods.map((p) => ({ title: p.title, estimate: p.estimate })),
      rows,
    };
    // A — 이익 안정성 한 줄: 영업이익의 *확정(비추정)* 추이로만 판단(추정치 제외).
    const opRow = rowList.find((x) => typeof x.title === "string" && (x.title as string).includes("영업이익"));
    if (opRow) {
      const cols = (opRow.columns ?? {}) as Record<string, { value?: string }>;
      const opRaw = periods.filter((p) => !p.estimate).map((p) => num(cols[p.key]?.value ?? ""));
      const note = stabilityNote(opRaw);
      if (note) financials.note = note;
    }
    out.financials = financials;
  }
  return out;
}

/** 세 소스 파싱 결과를 StockBasics 로 합친다. name 은 최소 보장(없으면 fallback). */
export function assembleStockBasics(
  name: string,
  basic: unknown,
  integration: unknown,
  financeAnnual: unknown
): StockBasics {
  const b = parseNaverStockBasic(basic);
  const ti = parseNaverTotalInfos(integration);
  const fa = parseNaverFinanceAnnual(financeAnnual);
  const finance = (financeAnnual ?? {}) as { financeInfo?: { trTitleList?: Array<{ title?: string; key?: string; isConsensus?: string }>; rowList?: Array<{ title?: string; columns?: Record<string, { value?: string }> }> } };
  const periodRows = finance.financeInfo?.trTitleList ?? [];
  const actualPeriods = periodRows.filter((period) => period.isConsensus !== "Y" && period.key);
  const valuationRow = (title: string) => finance.financeInfo?.rowList?.find((row) => row.title === title);
  const valuationValues = (title: string) => {
    const row = valuationRow(title);
    const values = actualPeriods.map((period) => num(row?.columns?.[period.key!]?.value ?? "")).filter((value): value is number => value !== null && value > 0);
    return values.length >= 3 ? values : undefined;
  };
  const perHistory = valuationValues("PER");
  const pbrHistory = valuationValues("PBR");
  const psrHistory = valuationValues("PSR");
  const historyYears = Math.max(perHistory?.length ?? 0, pbrHistory?.length ?? 0, psrHistory?.length ?? 0);
  return {
    name: b.name || name,
    ...(b.market ? { market: b.market } : {}),
    ...(b.priceText ? { priceText: b.priceText } : {}),
    ...(b.changeText ? { changeText: b.changeText } : {}),
    ...(b.changeDir ? { changeDir: b.changeDir } : {}),
    ...(ti.marketCap ? { marketCap: ti.marketCap } : {}),
    ...(fa.summary ? { summary: fa.summary } : {}),
    metrics: ti.metrics,
    ...(fa.financials ? { financials: fa.financials } : {}),
    ...(historyYears >= 3
      ? {
          valuationHistory: {
            periods: actualPeriods.map((period) => (period.title ?? "").replace(/\.$/, "")),
            ...(perHistory ? { per: perHistory } : {}),
            ...(pbrHistory ? { pbr: pbrHistory } : {}),
            ...(psrHistory ? { psr: psrHistory } : {}),
            label: `최근 ${historyYears}개년`,
          },
        }
      : {}),
  };
}
