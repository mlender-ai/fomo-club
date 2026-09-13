/**
 * LAB-04 PART E — 워크포워드.
 *
 * > **단순 백테스트는 믿을 수 없다.**
 *
 * 전체 기간을 겹치는 구간으로 나눠 학습/검증을 굴린다.
 * **검증 구간 성과만 합쳐서 보고한다** — 학습 구간 성과는 참고용이고
 * **화면에 내지 않는다**(하지 말 것 4).
 *
 * 순수 함수다. 나누기만 하고 돌리지 않는다 — 돌리는 것은 실행기다.
 */
import type { Bar } from "./types";

export interface Fold {
  index: number;
  /** 학습 구간. 지금은 파라미터 최적화를 하지 않으므로 **참고용**이다. */
  inSample: { from: Date; to: Date; bars: readonly Bar[] };
  /** 검증 구간. **이것만 보고한다.** */
  outOfSample: { from: Date; to: Date; bars: readonly Bar[] };
}

export interface WalkForwardConfig {
  /** 학습 구간 봉 수. */
  inSampleBars: number;
  /** 검증 구간 봉 수. */
  outOfSampleBars: number;
  /**
   * 다음 구간으로 얼마나 전진하나. 기본은 검증 구간 길이 —
   * 그래야 검증 구간이 **겹치지 않는다.** 겹치면 같은 봉이 여러 번 집계돼
   * 표본이 실제보다 커 보인다.
   */
  stepBars?: number;
}

/**
 * 구간을 나눈다. 봉이 모자라면 **빈 배열**이다 — 억지로 한 구간을 만들지 않는다.
 *
 * 학습 구간은 **검증 구간보다 앞**이고 겹치지 않는다. 겹치면 검증이 학습을
 * 들여다본 것이 되어 워크포워드의 의미가 없다.
 */
export function splitFolds(bars: readonly Bar[], config: WalkForwardConfig): Fold[] {
  const { inSampleBars, outOfSampleBars } = config;
  const step = config.stepBars ?? outOfSampleBars;
  if (inSampleBars < 1 || outOfSampleBars < 1 || step < 1) return [];

  const folds: Fold[] = [];
  let start = 0;
  let index = 0;

  while (start + inSampleBars + outOfSampleBars <= bars.length) {
    const isBars = bars.slice(start, start + inSampleBars);
    const oosBars = bars.slice(start + inSampleBars, start + inSampleBars + outOfSampleBars);
    const isFirst = isBars[0];
    const isLast = isBars[isBars.length - 1];
    const oosFirst = oosBars[0];
    const oosLast = oosBars[oosBars.length - 1];
    if (!isFirst || !isLast || !oosFirst || !oosLast) break;

    folds.push({
      index,
      inSample: { from: isFirst.at, to: isLast.at, bars: isBars },
      outOfSample: { from: oosFirst.at, to: oosLast.at, bars: oosBars },
    });
    start += step;
    index += 1;
  }

  return folds;
}

/** 검증 구간이 서로 겹치지 않는가. 겹치면 표본이 실제보다 커 보인다. */
export function foldsAreDisjoint(folds: readonly Fold[]): boolean {
  for (let i = 1; i < folds.length; i += 1) {
    const prev = folds[i - 1];
    const cur = folds[i];
    if (!prev || !cur) return false;
    if (cur.outOfSample.from.getTime() <= prev.outOfSample.to.getTime()) return false;
  }
  return true;
}
