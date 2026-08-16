/**
 * CTX-06 검증실 — §3 절대 규칙을 코드가 강제하는 집계 원시.
 *
 * 이 탭의 가치는 **좋은 성적이 아니라 정직한 성적**이다(§10). 정직함이 사람의 주의력에
 * 의존하면 언젠가 깨지므로, 어기기 쉬운 규칙부터 타입·함수로 못박는다.
 *
 * 여기서 강제하는 것:
 *  §3-1 백테스트와 실적을 **절대 합산하지 않는다** — 타입이 다르면 섞을 수 없다.
 *  §3-2 **N < 30 이면 비율을 내지 않는다** — 게이트를 통과하지 못하면 숫자 자체가 없다.
 *  §3-6 **중앙값 + 분포**를 함께 낸다. 평균만 쓰지 않는다.
 */

/**
 * 수치의 출처. **실적과 백테스트는 서로 다른 타입이라 합산이 컴파일 단계에서 막힌다**(§3-1).
 *  - `ledger` — 판단 원장에 기록된 실제 발행분
 *  - `backtest` — 과거 데이터로 소급 계산한 것
 */
export type Provenance = "ledger" | "backtest";

/** §3-2 표본 하한. 이 아래에서는 비율·중앙값을 만들지 않는다. */
export const MIN_SAMPLE = 30;

/** 표본 부족은 **정상 출력**이다. 실적 데이터가 적으면 화면 대부분이 이것이어도 그대로 낸다(§10). */
export interface InsufficientSample {
  sufficient: false;
  provenance: Provenance;
  /** 실제 표본 수. 숨기지 않는다 — 얼마나 부족한지가 정보다. */
  n: number;
  label: string;
}

export interface SufficientStat {
  sufficient: true;
  provenance: Provenance;
  n: number;
  /** §3-6 — 중앙값이 대표값이다. */
  median: number;
  /** 분포를 함께 낸다. 평균만으로는 소수 대박이 전체를 왜곡한다. */
  distribution: Array<{ from: number; to: number; count: number }>;
  p25: number;
  p75: number;
  /** 양수 비율(%). "상승 비율" 등. */
  positiveRate: number;
}

export type SampleStat = InsufficientSample | SufficientStat;

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** 고정 폭 히스토그램. 빈 구간도 남긴다 — 비어 있다는 것도 분포의 일부다. */
function histogram(sorted: readonly number[], bins: number): SufficientStat["distribution"] {
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const width = max === min ? 1 : (max - min) / bins;
  const out: SufficientStat["distribution"] = [];
  for (let i = 0; i < bins; i += 1) {
    const from = min + width * i;
    const to = i === bins - 1 ? max : min + width * (i + 1);
    const count = sorted.filter((v) => (i === bins - 1 ? v >= from && v <= to : v >= from && v < to)).length;
    out.push({ from, to, count });
  }
  return out;
}

/**
 * 표본에서 통계를 낸다. **하한 미달이면 비율을 만들지 않는다**(§3-2).
 *
 * `values` 에는 **판정 불가를 뺀 나머지만** 넣으면 안 된다 — §5-1 은 판정 불가를 분모에서
 * 빼지 말라고 한다. 호출자가 분모를 줄여 성적을 좋게 만드는 것을 이 함수는 막을 수 없으므로,
 * 분모 구성은 호출부 테스트로 고정해야 한다.
 */
export function summarize(
  values: readonly number[],
  provenance: Provenance,
  options: { label?: string; bins?: number; minSample?: number } = {}
): SampleStat {
  const min = options.minSample ?? MIN_SAMPLE;
  const n = values.length;
  if (n < min) {
    return { sufficient: false, provenance, n, label: `표본 부족 (${n}건)` };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    sufficient: true,
    provenance,
    n,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    positiveRate: (sorted.filter((v) => v > 0).length / n) * 100,
    distribution: histogram(sorted, options.bins ?? 10),
  };
}

/**
 * §3-1 — 실적과 백테스트를 합치려는 시도를 **런타임에서도** 막는다.
 * 타입만으로는 `any` 를 거쳐 들어오는 경로를 못 막는다.
 */
export function assertSameProvenance(stats: readonly SampleStat[]): Provenance | null {
  if (stats.length === 0) return null;
  const first = stats[0]!.provenance;
  for (const s of stats) {
    if (s.provenance !== first) {
      throw new Error(
        `검증실 규칙 위반: 실적(ledger)과 백테스트(backtest)를 합산할 수 없습니다 (${first} + ${s.provenance})`
      );
    }
  }
  return first;
}

/** 화면 라벨. 어느 출처인지 **항상** 밝힌다(§3-1 별도 라벨). */
export const PROVENANCE_LABEL: Readonly<Record<Provenance, string>> = {
  ledger: "판단 원장에 기록된 발행분만 셉니다",
  backtest: "실제 발행이 아니라 과거 데이터로 소급 계산한 것입니다",
};
