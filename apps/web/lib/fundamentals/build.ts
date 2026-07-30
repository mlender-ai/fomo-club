import {
  assembleFactSheet,
  emptyFactSheet,
  type DailyOhlcv,
  type FactSheet,
  type FactSheetInput,
  type PointObservation,
  type SourceManifestEntry,
} from "@fomo/core";
import { readUsCandleCache } from "../us-candle-cache";
import { readKrCandleCache } from "../kr-candle-cache";
import { fetchUsDailyCandles } from "../us-market-source";
import { fetchDartFundamentals } from "./dart-fundamentals";
import { fetchNaverFundamentals } from "./naver-fundamentals";
import { fetchNasdaqFundamentals } from "./nasdaq-fundamentals";
import { fetchSecFundamentals } from "./sec-xbrl";
import type { UniverseEntry } from "./universe";

/**
 * 종목 1개 팩트시트 조립 (WO-SUB-01 §7-1).
 *
 * 어댑터 결과를 모아 `@fomo/core` 의 순수 compose 로 넘긴다. 여기에는 계산이 없다 —
 * 있으면 결정론 테스트가 도는 곳(fomo-core)이 아니라 여기에 로직이 새는 것이다.
 *
 * 소스가 하나도 안 열린 종목도 **레코드는 만든다**(완료 조건 1: 레코드 부재 불허).
 */

/** 밴드 윈도우 상한 — 5년. 종가는 이 시점부터 요청한다. */
const BAND_WINDOW_YEARS = 5;
/** US 5년 밴드에 필요한 거래일 수(≈252 × 5) + 여유. TwelveData outputsize 상한은 5000. */
const US_BAND_OUTPUTSIZE = 1_300;

function windowStart(now: Date): string {
  return new Date(now.getTime() - BAND_WINDOW_YEARS * 365 * 86_400_000).toISOString().slice(0, 10);
}

function manifest(entries: Array<[string, SourceManifestEntry] | null>): Record<string, SourceManifestEntry> {
  const out: Record<string, SourceManifestEntry> = {};
  for (const entry of entries) if (entry) out[entry[0]] = entry[1];
  return out;
}

/** 국내 부채비율(%) → 부채/자기자본 배수 관측으로 환산. 자기자본을 알면 총부채를 역산한다. */
function liabilitiesFromDebtRatio(equity: readonly PointObservation[], debtRatioPct: number | null): PointObservation[] {
  if (debtRatioPct === null || equity.length === 0) return [];
  const latest = equity[equity.length - 1]!;
  return [{ period_end: latest.period_end, filed_at: latest.filed_at, value: (latest.value * debtRatioPct) / 100 }];
}

export async function buildKrFactSheet(entry: UniverseEntry, now = new Date()): Promise<FactSheet> {
  const snapshotAt = now.toISOString();
  const code = entry.naverCode?.trim();
  if (!code) {
    return emptyFactSheet({
      canonical: entry.canonical,
      displayName: entry.displayName,
      symbol: "",
      market: "KR",
      currency: "KRW",
      snapshotAt,
      sourceErrors: ["universe: 종목코드 없음 — 네이버 조회 불가"],
    });
  }

  const naver = await fetchNaverFundamentals(code, windowStart(now));
  /**
   * DART 를 **재무의 1차 소스로 쓴다.**
   *
   * 네이버는 분기 5개 상한 + 공시일 없음이라 밴드 유효 관측이 윈도우의 10~25% 뿐이었다.
   * DART 는 접수일(`rcept_no` 앞 8자리)을 주므로 `filed_at_source: "disclosed"` 로 올라가고,
   * 연도를 올려 부르면 분기 상한이 없다. 시세·컨센서스·업종은 DART 에 없으므로 네이버가 계속 담당한다.
   *
   * DART 가 실패하면(키 미설정·매핑 없음) **조용히 빈 값으로 가지 않고** 네이버로 내려간다.
   * 어느 쪽으로 만들었는지는 `filed_at_source` 와 소스 매니페스트에 남는다.
   */
  const dart = await fetchDartFundamentals(code, { now }).catch((error: unknown) => {
    return { error } as const;
  });
  const dartOk = !("error" in dart) && dart.quarters.length > 0;
  const dartErrors = "error" in dart ? [`dart: 예외 — ${String((dart as { error: unknown }).error)}`] : dart.errors;
  // 픽 크론이 봉인한 캔들이 더 길면 그것을 합친다(요청 경로와 같은 화면을 재현하기 위한 기존 캐시 재사용).
  const sealed = await readKrCandleCache(code).catch(() => null);
  const closesByDate = new Map(naver.closes.map((c) => [c.date, c.close]));
  for (const candle of sealed ?? []) {
    if (typeof candle.close === "number" && candle.date && !closesByDate.has(candle.date)) {
      closesByDate.set(candle.date, candle.close);
    }
  }
  const closes = [...closesByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, close]) => ({ date, close }));

  const input: FactSheetInput = {
    canonical: entry.canonical,
    displayName: naver.displayName || entry.displayName,
    symbol: code,
    market: "KR",
    currency: "KRW",
    snapshotAt,
    quarters: dartOk ? dart.quarters : naver.quarters,
    annual: dartOk && dart.annual.length > 0 ? dart.annual : naver.annual,
    equity: dartOk && dart.equity.length > 0 ? dart.equity : naver.equity,
    liabilities: dartOk && dart.liabilities.length > 0
      ? dart.liabilities
      : liabilitiesFromDebtRatio(naver.equity, naver.reportedDebtRatioPct?.value ?? null),
    totalDebt: dartOk ? dart.totalDebt : [],
    cash: dartOk ? dart.cash : [],
    operatingCashFlow: dartOk ? dart.operatingCashFlow : [],
    interestExpense: dartOk ? dart.interestExpense : [],
    // 감가상각비는 DART 표본에 단독 계정이 없다 — 대체 지표로 만들지 않는다(EV/EBITDA null 유지).
    depreciation: [],
    closes,
    sharesSeries: naver.sharesSeries,
    marketData: naver.marketData,
    consensus: naver.consensus,
    classification: naver.classification,
    reported: naver.reported,
    sourceManifest: manifest([
      [
        "naver_integration",
        { source: "m.stock.naver.com/api/stock/{code}/integration", fetched_at: naver.fetchedAt, note: "시총·PER·PBR·EPS·BPS·배당(각 항목 valueDesc = 기준 분기)" },
      ],
      [
        "naver_finance",
        {
          source: "m.stock.naver.com/api/stock/{code}/finance/{quarter,annual}",
          fetched_at: naver.fetchedAt,
          note: "매출·영업이익·지배주주순이익·EPS·BPS·부채비율. 단위 억원. 공시일 미제공 → filed_at = 법정 제출기한(보수적 상한). 분기 5개·연간 3개 상한",
        },
      ],
      [
        "naver_chart_day",
        {
          source: "api.stock.naver.com/chart/domestic/item/{code}/day",
          fetched_at: naver.fetchedAt,
          note: "액면분할 조정 종가(수정주가) — 실측 검증: 카카오 2021-04-14 종가 112,000(분할 전 명목가 아님)",
        },
      ],
      dartOk
        ? [
            "dart_fnltt",
            {
              source: "opendart.fss.or.kr/api/fnlttSinglAcnt{,All}",
              fetched_at: dart.fetchedAt,
              note: `분기·연간 손익/대차/현금흐름. filed_at = 접수일 실측(rcept_no). 계정 매핑 ${dart.mappingVersion}. 보고서 확보 ${dart.reportCensus.ok} · 부재 ${dart.reportCensus.absent} · 실패 ${dart.reportCensus.failed}. 전체 재무제표 ${dart.detailedReports.opened}/${dart.detailedReports.attempted} 개방 — 닫힌 보고서는 현금흐름·EPS null`,
            },
          ]
        : null,
      sealed && sealed.length > 0
        ? ["kr_candle_cache", { source: "FeedContentCache:kr-candles", fetched_at: naver.fetchedAt, note: `봉인 캔들 ${sealed.length}일 병합` }]
        : null,
    ]),
    sourceErrors: [...naver.errors, ...dartErrors],
  };
  return assembleFactSheet(input);
}

export async function buildUsFactSheet(entry: UniverseEntry, now = new Date()): Promise<FactSheet> {
  const snapshotAt = now.toISOString();
  const symbol = entry.symbol?.trim().toUpperCase();
  if (!symbol) {
    return emptyFactSheet({
      canonical: entry.canonical,
      displayName: entry.displayName,
      symbol: "",
      market: "US",
      currency: "USD",
      snapshotAt,
      sourceErrors: ["universe: 심볼 없음 — SEC·Nasdaq 조회 불가"],
    });
  }

  const [sec, nasdaq] = await Promise.all([fetchSecFundamentals(symbol), fetchNasdaqFundamentals(symbol)]);
  // 일별 종가 — Nasdaq historical 은 5년을 주지 않는다(WO-SUB-00 실측 ③).
  // 이미 프로덕션이 쓰는 TwelveData time_series 로 5년치를 시도하고(키 없으면 빈 배열),
  // 픽 크론이 봉인한 260거래일과 날짜 합집합으로 합친다. 새 유료 소스를 붙이는 게 아니라 기존 소스 재사용이다.
  const [sealed, twelve] = await Promise.all([
    readUsCandleCache(symbol).catch(() => null),
    fetchUsDailyCandles(symbol, US_BAND_OUTPUTSIZE).catch(() => ({ candles: [] as DailyOhlcv[] })),
  ]);
  const closesByDate = new Map<string, number>();
  for (const candle of [...(twelve.candles ?? []), ...(sealed ?? [])]) {
    if (typeof candle.close === "number" && typeof candle.date === "string" && candle.date && !closesByDate.has(candle.date)) {
      closesByDate.set(candle.date, candle.close);
    }
  }
  const closes = [...closesByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, close]) => ({ date, close }));

  const errors = [...sec.errors, ...nasdaq.errors];
  if (closes.length === 0) errors.push("us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③)");
  else if (closes.length < 700) {
    errors.push(`us: 일별 종가 ${closes.length}일 — 5년 밴드에 미달(무료 경로 미확보, WO-SUB-00 실측 ③)`);
  }

  // 주식수는 SEC 보고값이 정본이다. 없으면 Nasdaq 역산(시총÷가격)을 쓴다.
  const sharesOutstanding = sec.sharesOutstanding ?? nasdaq.marketData.shares_outstanding;
  const input: FactSheetInput = {
    canonical: entry.canonical,
    displayName: nasdaq.displayName || entry.displayName,
    symbol,
    market: "US",
    currency: "USD",
    snapshotAt,
    quarters: sec.quarters,
    annual: sec.annual,
    equity: sec.equity,
    liabilities: sec.liabilities,
    totalDebt: sec.totalDebt,
    cash: sec.cash,
    operatingCashFlow: sec.operatingCashFlow,
    interestExpense: sec.interestExpense,
    depreciation: sec.depreciation,
    closes,
    sharesSeries: sec.sharesSeries,
    marketData: {
      ...nasdaq.marketData,
      shares_outstanding: sharesOutstanding,
      source: sec.sharesOutstanding
        ? `${nasdaq.marketData.source}+sec_xbrl.shares`
        : nasdaq.marketData.source,
    },
    consensus: nasdaq.consensus,
    classification: nasdaq.classification,
    reported: nasdaq.reported,
    sourceManifest: manifest([
      [
        "sec_xbrl",
        {
          source: "data.sec.gov/api/xbrl/companyfacts",
          fetched_at: sec.fetchedAt,
          note: "분기·연간 손익/대차/현금흐름 + 공시일(filed). Q4 는 연간−1~3분기로 구성(source 에 표기). filed_at = 최초 공시일",
        },
      ],
      [
        "nasdaq",
        {
          source: "api.nasdaq.com/api/quote|analyst",
          fetched_at: nasdaq.fetchedAt,
          note: "시총·가격·섹터·배당수익률·EPS 컨센서스. 브라우저 UA 필수. PERatio/BookValue 키 없음. 매출 컨센서스 부재",
        },
      ],
      closes.length > 0
        ? [
            "us_daily_closes",
            {
              source: "api.twelvedata.com/time_series(1day) + FeedContentCache:us-candles",
              fetched_at: sec.fetchedAt,
              note: `종가 ${closes.length}일(TwelveData ${twelve.candles?.length ?? 0} + 봉인 ${sealed?.length ?? 0}). 조정 여부는 소스 주장에 의존하지 않고 하루 2배·½배 점프 탐지로 검증한다(밴드 가드)`,
            },
          ]
        : null,
    ]),
    sourceErrors: errors,
  };
  return assembleFactSheet(input);
}

export async function buildFactSheet(entry: UniverseEntry, now = new Date()): Promise<FactSheet> {
  return entry.country === "US" ? buildUsFactSheet(entry, now) : buildKrFactSheet(entry, now);
}
