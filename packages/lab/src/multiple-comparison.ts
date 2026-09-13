/**
 * LAB-05 PART D — 다중 비교 경고.
 *
 * > 여럿을 검증하면 그중 하나는 **우연히** 좋아 보인다.
 *
 * **정확한 방법론보다 존재하는 게 중요하다.** 없으면 스스로를 속인다.
 * 그래서 간단하고 설명 가능한 방법으로 시작하고, 그 방법을 여기 적어둔다.
 *
 * ## 계산 (D-1)
 *
 * 1. **단일 검정 p값** — 전략 하나의 샤프가 우연일 확률.
 *
 *    연율화 샤프 `S` 를 `T` 년 관측했을 때 t 통계량은 `t = S × √T` 다.
 *    (샤프의 표준오차가 대략 `1/√T` 이므로.) 단측 p값은 `p = 1 − Φ(t)`.
 *
 * 2. **가족단위 보정 (Šidák)** — 전략 `N` 개가 **전부 무능**하다는 귀무가설에서,
 *    그중 **적어도 하나**가 이만큼 좋아 보일 확률:
 *
 *        P = 1 − (1 − p)^N
 *
 *    이것이 "1위가 우연일 확률" 이다. `N` 이 커지면 같은 성적이라도 P 가 커진다 —
 *    **전략을 많이 돌릴수록 1위를 믿기 어려워진다**는 사실이 수식에 그대로 있다.
 *    (LAB-00 §7 "전략 5개 이하" 가 같은 이야기다.)
 *
 * ## 이 방법의 한계 — 적어둔다
 *
 * - **전략들이 독립이라고 가정한다.** 같은 종목·같은 기간을 도는 전략들은
 *   실제로 상관돼 있어서 Šidák 은 P 를 **과대평가**한다(보수적이다).
 *   보수적인 쪽으로 틀리는 것이 낫다 — 1위를 과신하지 않게 된다.
 * - 수익률 정규성을 가정한다. 크립토는 꼬리가 두껍다. 실제 p값은 이보다 클 것이다.
 * - 표본이 적으면(`MIN_SAMPLE` 미만) 애초에 순위를 매기지 않는다.
 *
 * 순수 함수다.
 */
import { MIN_SAMPLE } from "./stats";

/** 표준정규 누적분포. Abramowitz–Stegun 7.1.26 기반 오차함수 근사. */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export interface CandidateStat {
  id: string;
  label: string;
  /** 연율화 샤프. 없으면 검정에서 제외한다. */
  sharpe: number | null;
  /** 관측 연수. */
  years: number;
  /** 거래 수. `MIN_SAMPLE` 미만이면 순위·검정에서 뺀다. */
  trades: number;
}

export interface MultipleComparison {
  /** 검정에 들어간 전략 수. */
  tested: number;
  /** 1위 전략. 검정할 것이 없으면 null. */
  best: { id: string; label: string; sharpe: number } | null;
  /** 1위의 단일 검정 p값. */
  singleP: number | null;
  /** **1위가 우연일 확률** — Šidák 보정값. */
  familyP: number | null;
  /** 표본 부족으로 제외된 전략 수. */
  excludedForSample: number;
}

/**
 * 1위가 우연일 확률.
 *
 * 검정할 전략이 **하나도 없으면** 전부 null 이다 — 0% 라고 말하지 않는다.
 * 0% 는 "우연이 아니다" 라는 주장이고, 모르는 것과 다르다.
 */
export function multipleComparison(
  candidates: readonly CandidateStat[]
): MultipleComparison {
  const eligible = candidates.filter(
    (c) => c.trades >= MIN_SAMPLE && c.sharpe !== null && c.years > 0
  );
  const excludedForSample = candidates.length - eligible.length;

  if (eligible.length === 0) {
    return { tested: 0, best: null, singleP: null, familyP: null, excludedForSample };
  }

  let best = eligible[0] as CandidateStat;
  for (const candidate of eligible) {
    if ((candidate.sharpe ?? -Infinity) > (best.sharpe ?? -Infinity)) best = candidate;
  }

  const sharpe = best.sharpe as number;
  const t = sharpe * Math.sqrt(best.years);
  const singleP = 1 - normalCdf(t);
  const familyP = 1 - (1 - singleP) ** eligible.length;

  return {
    tested: eligible.length,
    best: { id: best.id, label: best.label, sharpe },
    singleP,
    familyP,
    excludedForSample,
  };
}

/** 화면에 그대로 나가는 문장(PART D). 값이 없으면 **없다고 말한다.** */
export function describeMultipleComparison(result: MultipleComparison): string {
  if (result.tested === 0) {
    return "검정할 후보가 없다. 표본 30건을 채운 전략이 생기면 여기에 확률이 나온다.";
  }
  const pct = ((result.familyP ?? 0) * 100).toFixed(0);
  // "전략" 이 아니라 "후보" 다. 파라미터 조합도 한 번의 시도라서 여기 들어간다
  // (LAB-06 PART E-2). 전략 2개를 6조합씩 돌렸으면 후보는 12개다.
  return (
    `후보 ${result.tested}개를 함께 검증했다(전략 + 파라미터 조합). ` +
    `여럿을 검증하면 그중 하나는 우연히 좋아 보인다. ` +
    `1위가 우연일 확률 약 ${pct}%.`
  );
}
