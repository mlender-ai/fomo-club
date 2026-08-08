import {
  RULESET_VERSION,
  businessInvalidationFor,
  classifyArchetype,
  judgeability,
  type BusinessInvalidation,
} from "@fomo/core";
import { readWeeklyCalendar } from "./earnings-calendar";
import { readFactSheet } from "./fundamentals/repository";

/**
 * 발행 시점 스탬프 (WO-SUB-07 최소 기록 — **소급 불가**).
 *
 * ## 왜 채점 로직보다 이것이 먼저인가
 *
 * T+180 채점이 있으므로 기록이 늦으면 첫 성적표가 그만큼 늦어진다. 채점 로직은 나중에 붙여도
 * 되지만 **발행 시점의 사실은 그 순간을 놓치면 영원히 복원되지 않는다.** 그래서 05·06 을
 * 기다리지 않고 기록만 먼저 시작한다(WO-SUB-FINISH [F]).
 *
 * ## 저장된 레코드만 읽는다
 *
 * 외부 소스를 두들기면 발행 경로가 소스 장애에 묶인다. 팩트시트·주간 캘린더 모두 크론이 미리
 * 채워둔 저장 레코드를 읽는다. 스탬프를 못 만들어도 **픽 발행은 막지 않는다** — 대신 못 만든
 * 사실을 `missing` 에 남긴다.
 *
 * ## 결측을 값으로 채우지 않는다 (배치 공통 양보 불가 항목)
 *
 * "없음" 과 "확보하지 못함" 을 구분한다. `earnings_date: null` 은 두 가지 뜻이 될 수 있으므로
 * 반드시 `earnings_date_status` 가 짝으로 붙는다. 상태 없는 `null` 은 나중에 읽는 쪽이
 * "어닝이 없다" 로 오독한다.
 */

/** 어닝 일정 확보 상태 — `earnings_date: null` 의 뜻을 구분한다. */
export type EarningsDateStatus =
  /** 저장된 캘린더에서 확보. */
  | "found"
  /** 캘린더에 있으나 이 종목이 7일 창 밖 — 없는 것이 아니라 아직 모르는 것. */
  | "outside_window"
  /** KR 은 사전 공표 소스가 없다(DART 는 사후 공시). 데이터를 더 모아도 안 된다. */
  | "no_source_kr"
  /** 캘린더 자체를 못 읽었다(크론 미실행·저장 장애). */
  | "calendar_unavailable";

/**
 * 사업 무효 조건 확보 상태.
 *
 * `pending_wo_sub_06` 은 **06 착수 전 발행분**에만 남는다(과거 행 해석용, 제거하지 않는다).
 * 06 이 끝난 뒤 발행분은 `found` 또는 `no_condition` 이다 — 후자는 그 유형에 자동 판정 가능한
 * 조건을 만들 수 없다는 뜻이고(PHARMA_STABLE·ASSET_DEEP_VALUE), 미확보와 구분해야 한다.
 */
export type BusinessInvalidationStatus = "found" | "no_condition" | "no_archetype" | "pending_wo_sub_06";

export interface PublicationStamp {
  /** 이 스탬프의 스키마 버전. 필드를 늘리면 올린다 — 과거 행을 새 스키마로 읽지 않기 위해. */
  stamp_version: string;
  /** 분류 규칙 버전. 임계값이 바뀌면 과거 분류의 의미가 달라진다. */
  ruleset_version: string;
  /** 발행 시점 아키타입. 팩트시트가 없으면 `null`. */
  archetype: string | null;
  /** `UNCLASSIFIED` 사유. 분류된 경우 `null`. */
  archetype_reason: string | null;
  /** 발행 시점 팩트시트 해시 — `readFactSheetSnapshot()` 으로 그 순간을 복원하는 열쇠. */
  factsheet_hash: string | null;
  factsheet_as_of: string | null;
  /** 기준가. 원장 행의 `priceAt` 과 같은 값이지만 페이로드만 읽어도 복원되게 함께 남긴다. */
  reference_price: number;
  reference_price_as_of: string;
  /** 가격 무효선. 확보하지 못하면 `null` — 픽 자체가 무효선 없이 발행되는 경우가 있다. */
  invalidation_price: number | null;
  invalidation_text: string | null;
  /** 사업 무효 조건(06). 문안과 판정 입력을 함께 남긴다 — 채점기가 문장을 다시 파싱하지 않게. */
  invalidation_business: string | null;
  invalidation_business_status: BusinessInvalidationStatus;
  /**
   * 자동 판정 입력. `judgeBusinessInvalidation()` 이 이 값으로 채점한다.
   * 조건이 없으면 `null` — 그때 `invalidation_business_status` 가 이유를 말한다.
   */
  invalidation_business_rule: BusinessInvalidation | null;
  /**
   * 값의 위치 스냅샷 (WO-SUB-07 §5).
   *
   * 05(등급)가 아니라 01(팩트시트) 산출물이라 지금 채울 수 있다. 밴드가 `sufficient: false` 면
   * `percentile` 은 반드시 `null` 이다(WO-SUB-01 규약) — 그 상태를 그대로 보존한다.
   */
  valuation_snapshot: {
    band_metric: string | null;
    percentile: number | null;
    value: number | null;
    sufficient: boolean;
  } | null;
  /**
   * 4축 등급 — **WO-SUB-05 산출물이라 아직 비어 있다.**
   *
   * 자리를 비워두는 이유: 05 가 끝난 뒤 스키마를 다시 바꾸면 그 사이 발행분과 이후 발행분의
   * 모양이 달라져 집계가 갈린다. 빈 배열 + `null` 버전으로 두면 "아직 안 함" 이 데이터로 남고,
   * 05 이후 발행분과 구분해 집계할 수 있다.
   */
  axes: Array<{
    axis: string;
    grade: "A" | "B" | "C" | "D" | "N/A";
    formula_id: string;
    na_reason: string | null;
  }>;
  /** 등급 산정식 버전. 05 전에는 `null`. */
  formula_version: string | null;
  /** 어닝 발표일. `null` 이면 반드시 `earnings_date_status` 로 뜻을 읽는다. */
  earnings_date: string | null;
  earnings_date_status: EarningsDateStatus;
  /** 확보하지 못한 필드 이름 — 채점 시 분모에서 빼는 근거가 된다. */
  missing: string[];
}

/**
 * 스탬프 스키마 버전.
 *
 * `v2`(2026-08-08): 사업 무효 조건(06 완료로 해제)·값의 위치 스냅샷·4축 자리를 추가했다.
 * 과거 `v1` 행을 새 스키마로 읽지 않기 위해 올린다 — v1 에는 `invalidation_business_rule` 과
 * `valuation_snapshot` 이 아예 없고, 그걸 `null` 로 읽으면 "확보 못 함" 으로 오독된다.
 */
export const PUBLICATION_STAMP_VERSION = "stamp.v2";

export interface StampSubject {
  market: string;
  canonical: string;
  symbol?: string;
  country?: string;
}

/** 스탬프 조립에 필요한 픽의 최소 형태 — `QuietPick` 전체를 받지 않아 순환 의존을 피한다. */
export interface StampablePick {
  subject: { canonical: string; market: string; country?: string; symbol?: string };
  price: { current: number };
  invalidation?: { level: number | null; text: string };
}

export interface StampFacts {
  reference_price: number;
  reference_price_as_of: string;
  invalidation_price?: number | null;
  invalidation_text?: string | null;
}

/** 주간 캘린더를 한 번 읽어 심볼 → 발표일 맵으로 만든다. 픽마다 읽으면 같은 레코드를 N번 읽는다. */
export interface EarningsIndex {
  /** 심볼 대문자 → `YYYY-MM-DD`. */
  bySymbol: Map<string, string>;
  /** 캘린더 자체를 읽었는지. 못 읽은 것과 종목이 없는 것은 다른 사실이다. */
  available: boolean;
}

export async function loadEarningsIndex(): Promise<EarningsIndex> {
  const calendar = await readWeeklyCalendar().catch(() => null);
  if (!calendar) return { bySymbol: new Map(), available: false };
  const bySymbol = new Map<string, string>();
  for (const day of calendar.days) {
    for (const event of day.events) {
      if (event.kind !== "earnings") continue;
      for (const stock of event.stocks ?? []) {
        const key = stock.symbol.trim().toUpperCase();
        // 같은 심볼이 여러 날에 있으면 가장 이른 날을 쓴다 — 다음 시험대가 먼저 온다.
        if (key && !bySymbol.has(key)) bySymbol.set(key, day.date);
      }
    }
  }
  return { bySymbol, available: true };
}

function earningsFor(subject: StampSubject, index: EarningsIndex): { date: string | null; status: EarningsDateStatus } {
  const country = (subject.country ?? subject.market).toUpperCase();
  // KR 실적 발표일은 사전 공표 소스가 없다(earnings-calendar 주석). 미확보가 정직한 상태다.
  if (country.startsWith("KR") || country === "KOSPI" || country === "KOSDAQ") {
    return { date: null, status: "no_source_kr" };
  }
  if (!index.available) return { date: null, status: "calendar_unavailable" };
  const symbol = subject.symbol?.trim().toUpperCase();
  const found = symbol ? index.bySymbol.get(symbol) : undefined;
  // 캘린더는 7일 창만 담는다 — 없는 것이 아니라 아직 창에 안 들어온 것이다.
  return found ? { date: found, status: "found" } : { date: null, status: "outside_window" };
}

/**
 * 한 종목의 발행 시점 스탬프. 실패해도 던지지 않는다 — 발행을 막지 않고 `missing` 에 남긴다.
 */
export async function buildPublicationStamp(
  subject: StampSubject,
  facts: StampFacts,
  index: EarningsIndex
): Promise<PublicationStamp> {
  const missing: string[] = [];
  const record = await readFactSheet(subject.market, subject.canonical).catch(() => null);

  let archetype: string | null = null;
  let archetypeReason: string | null = null;
  if (record?.factsheet) {
    try {
      const result = classifyArchetype(record.factsheet);
      archetype = result.code;
      archetypeReason = result.reason ?? null;
    } catch {
      missing.push("archetype");
    }
  } else {
    missing.push("factsheet_hash");
    missing.push("archetype");
  }

  const earnings = earningsFor(subject, index);
  if (earnings.date === null) missing.push("earnings_date");

  const invalidationPrice = facts.invalidation_price ?? null;
  if (invalidationPrice === null) missing.push("invalidation_price");

  /**
   * 사업 무효 조건 (06 완료로 해제).
   *
   * 아키타입이 없으면 조건을 고를 수 없다(`no_archetype`). 아키타입이 있어도 자동 판정 가능한
   * 조건을 만들 수 없는 유형이 있다(`no_condition` — PHARMA_STABLE 특허 만료일 등은 실적 발표
   * 데이터에 없다). 두 상태를 합치면 "소스가 없어서" 와 "만들 수 없어서" 가 섞인다.
   *
   * 어닝 상태를 조건에 그대로 물려준다 — 확인 시점이 언제인지가 조건의 일부다.
   */
  let businessRule: BusinessInvalidation | null = null;
  let businessStatus: BusinessInvalidationStatus;
  if (!archetype) {
    businessStatus = "no_archetype";
    missing.push("invalidation_business");
  } else {
    businessRule = businessInvalidationFor(archetype as Parameters<typeof businessInvalidationFor>[0], {
      date: earnings.date,
      status: earnings.status === "found" ? "earnings_date" : earnings.status === "no_source_kr" ? "no_source_kr" : "outside_window",
    });
    // 형태만 갖추고 판정이 안 되는 조건은 기록하지 않는다 — 채점 시점에 조용히 통과한다.
    if (businessRule && !judgeability(businessRule).judgeable) businessRule = null;
    businessStatus = businessRule ? "found" : "no_condition";
    if (!businessRule) missing.push("invalidation_business");
  }

  /**
   * 값의 위치. 밴드가 부족하면 `percentile` 은 `null` 이고 그 사실을 `sufficient` 로 남긴다 —
   * 백분위가 없는 것과 0 인 것은 다른 말이다.
   */
  const band = record?.factsheet?.valuation?.band_5y ?? null;
  // 어느 배수를 밴드로 쓸지는 독트린이 정하고 팩트시트가 `metric` 에 남긴다(per|pbr|psr).
  const bandMetric = band?.metric ?? null;
  const bandStat = band && bandMetric ? band[bandMetric] : null;
  const valuationSnapshot = record?.factsheet
    ? {
        band_metric: bandMetric,
        // `sufficient: false` 면 `current_percentile` 은 반드시 null 이다(WO-SUB-01 규약).
        percentile: bandStat?.current_percentile ?? null,
        value: bandStat?.current ?? null,
        sufficient: bandStat?.sufficient === true,
      }
    : null;
  if (!valuationSnapshot) missing.push("valuation_snapshot");

  return {
    stamp_version: PUBLICATION_STAMP_VERSION,
    ruleset_version: RULESET_VERSION,
    archetype,
    archetype_reason: archetypeReason,
    factsheet_hash: record?.factsheet_hash ?? null,
    /** 팩트시트 기준시각 — `FactSheet` 는 `as_of` 대신 `snapshot_at` 이다. */
    factsheet_as_of: record?.factsheet?.snapshot_at ?? null,
    reference_price: facts.reference_price,
    reference_price_as_of: facts.reference_price_as_of,
    invalidation_price: invalidationPrice,
    invalidation_text: facts.invalidation_text ?? null,
    invalidation_business: businessRule?.condition_text ?? null,
    invalidation_business_status: businessStatus,
    invalidation_business_rule: businessRule,
    valuation_snapshot: valuationSnapshot,
    // 05 대기 — 자리를 비워두고 "아직 안 함" 을 데이터로 남긴다(AC_DEBT_LEDGER 등재).
    axes: [],
    formula_version: null,
    earnings_date: earnings.date,
    earnings_date_status: earnings.status,
    missing,
  };
}

/**
 * 발행 덱 전체의 스탬프. 캘린더는 한 번만 읽고 팩트시트는 픽 수만큼 읽는다(픽 10장 수준).
 * 한 종목이 실패해도 그 종목만 빠진다 — 덱 전체 기록을 잃지 않는다.
 */
export async function buildQuietPickStamps(response: {
  asOf: string;
  picks: readonly StampablePick[];
}): Promise<Map<string, PublicationStamp>> {
  const index = await loadEarningsIndex();
  const out = new Map<string, PublicationStamp>();
  const built = await Promise.all(
    response.picks.map(async (pick) => {
      try {
        const stamp = await buildPublicationStamp(
          {
            market: pick.subject.market,
            canonical: pick.subject.canonical,
            ...(pick.subject.symbol ? { symbol: pick.subject.symbol } : {}),
            ...(pick.subject.country ? { country: pick.subject.country } : {}),
          },
          {
            reference_price: pick.price.current,
            reference_price_as_of: response.asOf,
            invalidation_price: pick.invalidation?.level ?? null,
            invalidation_text: pick.invalidation?.text ?? null,
          },
          index
        );
        return [pick.subject.canonical, stamp] as const;
      } catch {
        return null;
      }
    })
  );
  for (const entry of built) if (entry) out.set(entry[0], entry[1]);
  return out;
}
