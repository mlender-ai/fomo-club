import { DEPENDENCY_VARIABLES, type VariableObservation } from "@fomo/core";
import { fetchFredSeriesHistory } from "../fred";

/**
 * 의존 변수 관측값 수집 (WO-SUB-03 §4-6, 슬롯 3).
 *
 * 소스는 FRED 키리스 CSV(`fetchFredSeriesHistory`) — 이미 프로덕션이 쓰는 경로다.
 * 카탈로그에서 `source: "FRED:XXX"` 인 변수만 값을 만든다. 소스가 `null` 인 변수는
 * **값을 만들지 않는다**(가짜 숫자 금지) — 슬롯 3 이 비고 그 사실이 대시보드에 남는다.
 *
 * 방향 표기는 3개월 전 값과 비교한다. 임계값 ±2% 미만은 "보합" — 소수점 흔들림을
 * "상승/하락"이라 쓰지 않기 위한 것이다.
 */

/** 방향 판정 임계값(상대 변화율). */
const FLAT_BAND = 0.02;
const TREND_WINDOW_DAYS = 90;
const TREND_WINDOW_LABEL = "3개월";

/** 변수별 값 표기 — 단위를 붙이는 방식이 다르다. */
function formatValue(code: string, value: number, unit: string): string {
  if (unit === "%" || unit === "%p") return `${value.toFixed(2)}${unit}`;
  if (code === "usd_krw") return `${Math.round(value).toLocaleString("ko-KR")}원`;
  if (unit === "USD/배럴") return `배럴당 ${value.toFixed(2)}달러`;
  if (unit === "지수") return `${value.toFixed(2)}`;
  return `${value.toLocaleString("ko-KR")} ${unit}`;
}

function trendOf(history: ReadonlyArray<{ date: string; value: number }>): VariableObservation["trend"] | undefined {
  if (history.length < 2) return undefined;
  const latest = history[history.length - 1]!;
  const cutoff = new Date(Date.parse(`${latest.date}T00:00:00Z`) - TREND_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // 기준일 이전의 가장 최근 관측 — 창 안에 관측이 없으면 방향을 쓰지 않는다.
  const past = [...history].reverse().find((point) => point.date <= cutoff);
  if (!past || past.value === 0) return undefined;
  const change = (latest.value - past.value) / Math.abs(past.value);
  const direction = Math.abs(change) < FLAT_BAND ? "보합" : change > 0 ? "상승" : "하락";
  return { window: TREND_WINDOW_LABEL, direction };
}

export interface VariableValueResult {
  observations: Record<string, VariableObservation>;
  /** 소스가 있는데도 값을 못 받은 변수 — 대시보드에 남긴다. */
  failed: string[];
}

/**
 * 카탈로그의 값 소스가 있는 변수 전부를 한 번에 받는다.
 * 슬롯 3 은 종목마다 변수가 다르므로 **배치 앞단에서 한 번** 받아 재사용한다(요청 수 절약).
 */
export async function fetchVariableObservations(): Promise<VariableValueResult> {
  const observations: Record<string, VariableObservation> = {};
  const failed: string[] = [];
  const targets = DEPENDENCY_VARIABLES.filter((variable) => variable.source?.startsWith("FRED:"));

  for (const variable of targets) {
    const seriesId = variable.source!.slice("FRED:".length);
    const history = await fetchFredSeriesHistory(seriesId).catch(() => []);
    const latest = history[history.length - 1];
    if (!latest) {
      failed.push(`${variable.code}(${variable.source})`);
      continue;
    }
    const trend = trendOf(history);
    observations[variable.code] = {
      code: variable.code,
      value_text: formatValue(variable.code, latest.value, variable.unit),
      as_of: latest.date,
      source: variable.source!,
      ...(trend ? { trend } : {}),
    };
  }
  return { observations, failed };
}
