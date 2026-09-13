/**
 * 백테스트용 `DataSource`. **과거 배열을 순서대로 내놓을 뿐이다.**
 *
 * 페이퍼(`LAB-07`)는 같은 인터페이스의 다른 구현을 넣는다 —
 * 실행기는 어느 쪽인지 모른다(PART B-1).
 */
import type { Gap } from "../candle-quality";
import { isInGap } from "../candle-quality";
import type { Bar, DataSource } from "./types";

export interface HistoricalSourceInput {
  symbol: string;
  bars: readonly Bar[];
  gaps?: readonly Gap[];
  /** 시각 → 펀딩 요율. 없으면 0. */
  funding?: ReadonlyMap<number, number>;
  /** 시각 → 고래 순포지션(USD). */
  whaleNet?: ReadonlyMap<number, number>;
}

export class HistoricalSource implements DataSource {
  private index = 0;
  private current: Bar | null = null;

  constructor(private readonly input: HistoricalSourceInput) {}

  next(): Bar | null {
    const bar = this.input.bars[this.index];
    if (!bar) return null;
    this.index += 1;
    this.current = bar;
    return bar;
  }

  price(): number {
    return this.current?.close ?? 0;
  }

  now(): Date {
    return this.current?.at ?? new Date(0);
  }

  symbols(): readonly string[] {
    return [this.input.symbol];
  }

  inGap(_symbol: string, at: Date): boolean {
    return isInGap(at, this.input.gaps ?? []);
  }

  /**
   * 해당 봉 시각에 걸린 펀딩. 정확히 그 시각에 있는 것만 낸다 —
   * **가까운 값을 끌어다 쓰지 않는다.** 그건 구멍을 메우는 짓이다.
   */
  fundingRate(_symbol: string, at: Date): number {
    return this.input.funding?.get(at.getTime()) ?? 0;
  }

  whaleNet(_symbol: string, at: Date): number | null {
    return this.input.whaleNet?.get(at.getTime()) ?? null;
  }
}
