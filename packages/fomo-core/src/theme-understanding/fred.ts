import type { SourceDoc } from "./types";

/**
 * FRED(미 연준 세인트루이스) 공식 경제 데이터 — DATA_ENGINE_STRATEGY §4.5 C-2.
 *
 * "주장 아닌 연준 숫자"로 grounding 강화. 금리·거시 테마에 official-high tier 근거를 댄다.
 * 순수부: CSV 파싱 + 시리즈 사전 + 팩트 문장(SourceDoc) 빌드. fetch(키리스/키) 는 apps/web.
 */

export interface FredSeriesDef {
  /** 한국어 표기명. */
  name: string;
  /** 단위 접미(예: "%"). 없으면 "". */
  unit: string;
}

/** 추적 시리즈 사전(금리·거시). 확장 가능. */
export const FRED_SERIES: Record<string, FredSeriesDef> = {
  FEDFUNDS: { name: "미국 기준금리(연방기금금리)", unit: "%" },
  DGS10: { name: "미국 10년물 국채금리", unit: "%" },
  DGS2: { name: "미국 2년물 국채금리", unit: "%" },
  CPIAUCSL: { name: "미국 소비자물가지수(CPI)", unit: "" },
  UNRATE: { name: "미국 실업률", unit: "%" },
};

export interface FredObservation {
  date: string;
  value: number;
}

/**
 * fredgraph.csv 본문 → 최신 유효 관측치. 결측("."), 헤더, 빈 줄은 건너뛴다.
 * CSV 형식: `observation_date,SERIES\n2026-05-01,3.63\n...`
 */
export function parseFredCsvLatest(csv: string): FredObservation | null {
  if (!csv) return null;
  const lines = csv.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 1; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const [date, raw] = line.split(",");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const v = Number.parseFloat(raw ?? "");
    if (!Number.isFinite(v)) continue; // 결측 "." 등
    return { date, value: v };
  }
  return null;
}

/**
 * 시리즈 + 관측치 → 팩트 SourceDoc(tier=official-high). 사전에 없는 시리즈면 null.
 * 문장은 "주장"이 아니라 "사실 수치" — 이해 레이어가 이걸 근거(quote)로 grounding 한다.
 */
export function buildFredDoc(id: string, seriesId: string, obs: FredObservation): SourceDoc | null {
  const def = FRED_SERIES[seriesId];
  if (!def) return null;
  const valueText = `${obs.value}${def.unit}`;
  return {
    id,
    kind: "official",
    title: `${def.name} ${valueText}`,
    body: `${obs.date} 기준, ${def.name}는 ${valueText}다. (미 연준 공식 데이터 · FRED ${seriesId})`,
    source: "FRED(미 연준)",
    url: `https://fred.stlouisfed.org/series/${seriesId}`,
    publishedAt: `${obs.date}T00:00:00Z`,
    tier: "official-high",
  };
}
