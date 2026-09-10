import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * 일봉 캐시 커버리지 집계 (CTX-00 B-2 측정 수단).
 *
 * ## 왜 이 파일이 필요했나
 *
 * CTX-00 B-2 는 **≥250거래일 확보율**을 요구하는데 2026-08-17 까지 그 숫자를 낼 수단이 없었다.
 * 유일한 관측점이던 `kr-candle-prewarm` 크론은 `candles.length >= 120`(`MIN_USEFUL_DAYS`)만 세어
 * `stored 447 / 450` 을 보고한다 — **"120일 이상"이지 "250일 이상"이 아니다.**
 * 그래서 실사는 두 판을 연속으로 `미확인` 으로 남겼고, 그 상태로 CTX-02 가 「조건부 GO」에 묶여 있었다.
 *
 * ## 왜 SQL 로 세는가
 *
 * 캐시 행은 종목당 최대 260개 캔들 배열이다. 450행을 앱으로 끌어오면 수십 MB 를 전송하고
 * 조회 경로 람다에서 파싱해야 한다 — **감사가 서비스를 흔들면 안 된다.**
 * `jsonb_array_length` 로 **DB 안에서 세고 숫자만 가져온다.** 배열은 네트워크를 타지 않는다.
 *
 * ## 왜 신선도로 걸러야 하는가 — 첫 실측이 가르쳐준 것
 *
 * 초판은 캐시 행 전체를 셌다. 그랬더니 **KR 행이 802개**로 나왔다 — 프리웜 유니버스 450 보다 많다.
 * 확보율을 내면 **174.7%** 라는 말이 안 되는 숫자가 됐다.
 *
 * 원인: 캐시가 **정리되지 않는다.** 한 달치(`distinctAsOf` 26)가 쌓여 있고, 지금 유니버스에
 * 없는 종목의 옛 행도 그대로 남아 있다. 그런데 `readKrCandleCache` 는 `asOf` 가
 * `MAX_STALE_DAYS` 를 넘으면 **`null` 을 돌려준다** — 스테일 행은 verdict 에 쓰이지 않는다.
 *
 * **쓰이지 않는 행을 확보율의 분자에 넣으면 안 된다.** 그래서 신선분만 따로 센다.
 * 초판 숫자를 그대로 등재했다면 "확보율 174.7%" 가 문서에 박혔을 것이다.
 *
 * 읽기 전용이다. CTX-00 R1(읽기 전용 감사 라우트 추가 허용)·「쓰기·크론 호출 금지」를 지킨다.
 */

/** `kr-candle-cache.ts` · `us-candle-cache.ts` 의 저장 키 접두사와 같아야 한다. */
export type CandleMarket = "KR" | "US";

const PREFIX: Record<CandleMarket, string> = { KR: "kr-candles:", US: "us-candles:" };

/**
 * 각 캐시의 `MAX_STALE_DAYS` 와 같아야 한다 —
 * `kr-candle-cache.ts`(7) · `us-candle-cache.ts`(10). 이 값을 넘긴 행은 읽기 경로가 버린다.
 */
export const STALE_DAYS: Record<CandleMarket, number> = { KR: 7, US: 10 };

/** 길이 구간별 종목 수. 경계는 CTX-00 B-2(250) 와 캐시 임계(120)에 맞춘다. */
export interface CandleBuckets {
  lt120: number;
  from120to199: number;
  from200to249: number;
  gte250: number;
}

export interface CandleCoverage {
  market: CandleMarket;
  /** 캐시에 행이 있는 종목 수 — 스테일 포함. **유니버스가 아니다.** */
  rows: number;
  /** `asOf` 가 `staleDays` 안인 행 수. 읽기 경로가 실제로 쓰는 것은 이쪽뿐이다. */
  freshRows: number;
  /** 전체(스테일 포함) 구간별. 캐시가 얼마나 쌓였는지 보는 용도. */
  buckets: CandleBuckets;
  /** **신선분만.** 확보율의 분자는 반드시 여기서 온다. */
  freshBuckets: CandleBuckets;
  /** 신선분 캔들 개수 분포. 없으면 `null`. */
  lengths: { min: number; p50: number; max: number } | null;
  /** 판정 기준일과 임계. */
  freshness: {
    staleDays: number;
    cutoff: string;
    asOfMin: string | null;
    asOfMax: string | null;
    distinctAsOf: number;
  };
}

interface Aggregate {
  rows: bigint;
  freshrows: bigint;
  lt120: bigint;
  b120: bigint;
  b200: bigint;
  gte250: bigint;
  flt120: bigint;
  fb120: bigint;
  fb200: bigint;
  fgte250: bigint;
  minlen: number | null;
  p50len: number | null;
  maxlen: number | null;
  asofmin: string | null;
  asofmax: string | null;
  distinctasof: bigint;
}

const n = (v: bigint | number | null | undefined): number => Number(v ?? 0);

/** KST 기준 `YYYY-MM-DD` — 캐시가 `asOf` 를 KST 날짜 문자열로 쓴다(`kr-candle-cache.ts`). */
function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `staleDays` 만큼 뒤로 간 KST 날짜. 이 날짜 이상인 `asOf` 만 신선하다. */
export function freshnessCutoff(staleDays: number, now = new Date()): string {
  return kstDate(new Date(now.getTime() - staleDays * 86_400_000));
}

/**
 * 한 시장의 캐시 커버리지. 실패하면 던지지 않고 `null` — 감사 라우트가 부분 실패를
 * 정직하게 표시할 수 있어야 한다(전체 500 으로 덮으면 나머지 측정치까지 잃는다).
 */
export async function candleCoverage(market: CandleMarket, now = new Date()): Promise<CandleCoverage | null> {
  const like = `${PREFIX[market]}%`;
  const staleDays = STALE_DAYS[market];
  const cutoff = freshnessCutoff(staleDays, now);
  try {
    // `jsonb_array_length` 는 대상이 배열이 아니면 에러를 낸다 —
    // `jsonb_typeof` 가드로 손상된 행이 집계 전체를 죽이지 않게 한다.
    //
    // 신선분(`fresh`)을 따로 세는 이유는 파일 상단 주석 참조 — 스테일 행은 읽기 경로가
    // 버리므로 확보율의 분자가 될 수 없다.
    const [agg] = await prisma.$queryRaw<Aggregate[]>`
      WITH lens AS (
        SELECT
          CASE WHEN jsonb_typeof("row"->'candles') = 'array'
               THEN jsonb_array_length("row"->'candles') END AS len,
          "row"->>'asOf' AS as_of,
          ("row"->>'asOf') >= ${cutoff} AS fresh
        FROM "FeedContentCache"
        WHERE "id" LIKE ${like}
      )
      SELECT
        count(*)                                                       AS rows,
        count(*) FILTER (WHERE fresh)                                   AS freshrows,
        count(*) FILTER (WHERE len <  120)                              AS lt120,
        count(*) FILTER (WHERE len >= 120 AND len < 200)                AS b120,
        count(*) FILTER (WHERE len >= 200 AND len < 250)                AS b200,
        count(*) FILTER (WHERE len >= 250)                              AS gte250,
        count(*) FILTER (WHERE fresh AND len <  120)                    AS flt120,
        count(*) FILTER (WHERE fresh AND len >= 120 AND len < 200)      AS fb120,
        count(*) FILTER (WHERE fresh AND len >= 200 AND len < 250)      AS fb200,
        count(*) FILTER (WHERE fresh AND len >= 250)                    AS fgte250,
        min(len) FILTER (WHERE fresh)                                   AS minlen,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY len) FILTER (WHERE fresh) AS p50len,
        max(len) FILTER (WHERE fresh)                                   AS maxlen,
        min(as_of)                                                      AS asofmin,
        max(as_of)                                                      AS asofmax,
        count(DISTINCT as_of)                                           AS distinctasof
      FROM lens
    `;
    if (!agg) return null;
    const freshRows = n(agg.freshrows);
    return {
      market,
      rows: n(agg.rows),
      freshRows,
      buckets: {
        lt120: n(agg.lt120),
        from120to199: n(agg.b120),
        from200to249: n(agg.b200),
        gte250: n(agg.gte250),
      },
      freshBuckets: {
        lt120: n(agg.flt120),
        from120to199: n(agg.fb120),
        from200to249: n(agg.fb200),
        gte250: n(agg.fgte250),
      },
      lengths:
        freshRows > 0 && agg.minlen != null
          ? { min: n(agg.minlen), p50: n(agg.p50len), max: n(agg.maxlen) }
          : null,
      freshness: {
        staleDays,
        cutoff,
        asOfMin: agg.asofmin ?? null,
        asOfMax: agg.asofmax ?? null,
        distinctAsOf: n(agg.distinctasof),
      },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) return null;
    return null;
  }
}

/**
 * 유니버스 기준 확보율.
 *
 * **분모를 캐시 행 수로 두면 안 된다.** 프리웜이 저장하지 못한 종목(이력 <120, fetch 실패)은
 * 애초에 행이 없으므로 `gte250 / rows` 는 확보율을 **실제보다 좋게** 만든다 —
 * CTX-00 실패 모드 「표본이 좋아 보임」과 같은 함정이다.
 *
 * 유니버스 크기는 프리웜 실행 산출물(`universe`)에서 온다. 그 값을 모르면 `null` 을 내고
 * 확보율을 만들지 않는다.
 */
export function universeRatePct(gte250: number, universe: number | null): number | null {
  if (!universe || universe <= 0) return null;
  return Math.round((gte250 / universe) * 1000) / 10;
}

/**
 * 확보율이 100% 를 넘으면 **분자와 분모가 같은 모집단이 아니다.**
 *
 * 초판이 실제로 174.7% 를 냈다 — 캐시가 정리되지 않아 유니버스 밖 종목까지 세고 있었다.
 * 그때 필요한 것은 반올림이 아니라 **"이 숫자를 쓰지 말라"는 신호**다. 숫자를 조용히
 * 100 으로 깎으면 틀린 측정이 맞는 것처럼 보인다.
 */
export function denominatorWarning(ratePct: number | null): string | null {
  if (ratePct === null || ratePct <= 100) return null;
  return `확보율 ${ratePct}% — 100%를 넘는다. 분자(캐시)와 분모(유니버스)가 같은 모집단이 아니다. 이 값을 인용하지 말 것.`;
}
