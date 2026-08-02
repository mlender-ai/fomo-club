import type { BandStat } from "../fundamentals/types";
import type { EstimateMeta } from "./types";

/**
 * 캡션 — **템플릿으로만 생성한다**(WO-SUB-04 §5-4). 자유 서술 금지.
 *
 * 위치 사실만 서술하고 평가 형용사는 쓰지 않는다. "하위 20% 구간" 은 되고
 * "하위 20%로 저렴한 편" 은 안 된다 — 앞은 위치이고 뒤는 판단이다.
 */

/**
 * 금지어 사전 (§4 규칙 1).
 *
 * 캡션이 템플릿이라 이론상 금지어가 들어갈 수 없지만, 사전을 따로 두는 이유는
 * **템플릿이 나중에 손으로 수정될 때** 잡기 위해서다. 검사가 없으면 그때 조용히 통과한다.
 */
export const FORBIDDEN_CAPTION_WORDS = [
  "싸다",
  "싼",
  "저렴",
  "비싸다",
  "비싼",
  "저평가",
  "고평가",
  "매력적",
  "매력",
  "기회",
  "유망",
  "추천",
  "매수",
  "매도",
  "목표가",
  "상승 전망",
  "하락 전망",
] as const;

/** 캡션에 금지어가 있으면 그 목록을 돌려준다. 비어 있으면 통과. */
export function findForbiddenWords(caption: string): string[] {
  return FORBIDDEN_CAPTION_WORDS.filter((word) => caption.includes(word));
}

/** 밴드 위치 캡션. `sufficient: false` 면 백분위를 말하지 않는다(계산되지 않았다). */
export function bandCaption(band: BandStat | null, metricLabel: string): string | null {
  if (!band) return null;
  if (!band.sufficient || band.current_percentile === null) {
    return "5년 밴드를 계산할 만큼의 이력이 확보되지 않았습니다.";
  }
  const pct = Math.round(band.current_percentile);
  const asOf = band.window_end;
  return `현재 ${metricLabel}은 최근 5년 밴드에서 ${pct}% 구간입니다. (기준일 ${asOf})`;
}

/** 예상 구간 캡션. 예상이 없으면 **아무 말도 하지 않는다**(없는 것을 설명하지 않는다). */
export function estimateCaption(meta: EstimateMeta, firstEstimateLabel: string | null): string | null {
  if (!meta.present || !firstEstimateLabel) return null;
  const parts: string[] = [];
  if (meta.source) parts.push(`출처 ${meta.source}`);
  if (meta.analyst_count !== null) parts.push(`${meta.analyst_count}명`);
  if (meta.as_of) parts.push(`기준일 ${meta.as_of}`);
  const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `${firstEstimateLabel} 이후는 애널리스트 예상치입니다.${suffix}`;
}

/** 1순위 지표가 없어 대체 지표로 내려갔다는 사실 — 조용히 바꾸지 않는다. */
export function fallbackCaption(fromLabel: string, toLabel: string): string {
  return `${fromLabel}이 확보되지 않아 ${toLabel} 기준으로 표시합니다.`;
}
