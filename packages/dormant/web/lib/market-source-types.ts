import type { DiscoveryMarket, StockCountry } from "@fomo/core";

export type DiscoveryCountryScope = "KR" | "US" | "all";

export interface DiscoveryMarketRow {
  canonical: string;
  symbol: string;
  naverCode?: string;
  market: DiscoveryMarket;
  country: StockCountry;
  marketCapRank?: number;
  marketCapRankSource?: "live" | "curated";
  /** 시총(USD) — US 다이내믹 행 큐레이션 하한 검증용(2026-07-11). 스크리너 원천값. */
  marketCapUsd?: number;
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  changePct?: number;
  tradingValue?: number;
  currency?: "KRW" | "USD";
  sparkline?: number[];
  sectorHint?: string;
  sessionLabel?: string;
  /**
   * 20거래일 평균 거래량 대비 오늘 거래량 배수 (US-02 B-2).
   *
   * **왜 행에 실어 나르는가** — 거래량 각성(`eventFromVolume`)은 20일 거래량 이력을 요구하는데,
   * 그 이력은 일봉을 받아야 알 수 있고 일봉은 **이미 랭킹 상위 50에 든 종목만** 받았다.
   * 그래서 이 신호는 발굴 사유가 되지 못하고 **선정된 뒤 붙는 라벨**에 머물렀다
   * (실측: 덱 30장 중 `volume_vacuum` 국내 0 · 미국 0 — `docs/audit/US_COVERAGE.md` A-2).
   * 비율을 프리웜에서 미리 계산해 행에 실으면 **후보 검출 시점에** 각성을 판정할 수 있고,
   * 거래량만으로 종목을 덱에 끌어올릴 수 있다.
   */
  volumeRatio20d?: number;
  /** 위 비율의 분모 — 카드 문구·검증용. 비율만 있으면 근거를 되짚을 수 없다. */
  avgVolume20d?: number;
  /**
   * 시총 하한을 우회해 유니버스에 들어온 근거 (US-02 C).
   * `"signal"` = SEC Form 4 클러스터 매수 등 실제 신호가 붙어 낮은 하한을 적용받았다.
   * 읽기 경로가 하한을 재검증하므로(구 캐시 행 방어) 행 자체에 근거를 남긴다.
   */
  capBypass?: "signal";
}

export interface MarketSource {
  id: string;
  country: DiscoveryCountryScope;
  fetchMarketRows(): Promise<DiscoveryMarketRow[]>;
}
