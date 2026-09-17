/**
 * 백테스트용 `DataSource`. **과거 배열을 순서대로 내놓을 뿐이다.**
 *
 * 페이퍼(`LAB-07`)는 같은 인터페이스의 다른 구현을 넣는다 —
 * 실행기는 어느 쪽인지 모른다(PART B-1).
 */
import type { Gap } from "../candle-quality";
import { isInGap } from "../candle-quality";
import type { Bar, DataSource, SourceBar } from "./types";

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

  next(): SourceBar | null {
    const bar = this.input.bars[this.index];
    if (!bar) return null;
    this.index += 1;
    this.current = bar;
    return { symbol: this.input.symbol, bar };
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

export interface MultiSymbolInput {
  /** 종목별 봉. 각 배열은 시각 오름차순이어야 한다. */
  bySymbol: Record<string, readonly Bar[]>;
  gaps?: Record<string, readonly Gap[]>;
  /** `종목 → (시각ms → 요율)`. */
  funding?: Record<string, ReadonlyMap<number, number>>;
  /** `종목 → (시각ms → 고래 순포지션 USD)`. */
  whaleNet?: Record<string, ReadonlyMap<number, number>>;
}

/**
 * 여러 종목을 **시각 순서로 섞어** 내놓는 소스.
 *
 * 섞는 순서가 규칙이다. 같은 시각이면 종목 이름 순으로 낸다 —
 * **순서가 정해져 있지 않으면 같은 입력이 다른 결과를 낸다.**
 * 동시 보유 상한(`max_positions`)에 걸리는 종목이 실행 순서에 따라 달라지기 때문이다.
 */
export class MultiSymbolSource implements DataSource {
  private readonly order: SourceBar[];
  private index = 0;
  private readonly last = new Map<string, number>();

  constructor(private readonly input: MultiSymbolInput) {
    const merged: SourceBar[] = [];
    for (const [symbol, bars] of Object.entries(input.bySymbol)) {
      for (const bar of bars) merged.push({ symbol, bar });
    }
    merged.sort(
      (a, b) => a.bar.at.getTime() - b.bar.at.getTime() || a.symbol.localeCompare(b.symbol)
    );
    this.order = merged;
  }

  next(): SourceBar | null {
    const item = this.order[this.index];
    if (!item) return null;
    this.index += 1;
    this.last.set(item.symbol, item.bar.close);
    return item;
  }

  price(symbol: string): number {
    return this.last.get(symbol) ?? 0;
  }

  now(): Date {
    return this.order[Math.max(0, this.index - 1)]?.bar.at ?? new Date(0);
  }

  symbols(): readonly string[] {
    return Object.keys(this.input.bySymbol).sort();
  }

  inGap(symbol: string, at: Date): boolean {
    return isInGap(at, this.input.gaps?.[symbol] ?? []);
  }

  fundingRate(symbol: string, at: Date): number {
    return this.input.funding?.[symbol]?.get(at.getTime()) ?? 0;
  }

  whaleNet(symbol: string, at: Date): number | null {
    return this.input.whaleNet?.[symbol]?.get(at.getTime()) ?? null;
  }
}
