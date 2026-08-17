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
 * 읽기 전용이다. CTX-00 R1(읽기 전용 감사 라우트 추가 허용)·「쓰기·크론 호출 금지」를 지킨다.
 */

/** `kr-candle-cache.ts` · `us-candle-cache.ts` 의 저장 키 접두사와 같아야 한다. */
export type CandleMarket = "KR" | "US";

const PREFIX: Record<CandleMarket, string> = { KR: "kr-candles:", US: "us-candles:" };

export interface CandleCoverage {
  market: CandleMarket;
  /** 캐시에 행이 있는 종목 수. **유니버스가 아니다** — §denominator 참조. */
  rows: number;
  /** 길이 구간별 종목 수. `bucket` 경계는 CTX-00 B-2(250) 와 캐시 임계(120)에 맞춘다. */
  buckets: { lt120: number; from120to199: number; from200to249: number; gte250: number };
  /** 캔들 개수 분포. 행이 없으면 `null`. */
  lengths: { min: number; p50: number; max: number } | null;
  /** `row.asOf` 기준 신선도. 오래된 캐시는 길이가 있어도 verdict 에 쓰이지 않는다. */
  freshness: { asOfMin: string | null; asOfMax: string | null; distinctAsOf: number };
}

interface Aggregate {
  rows: bigint;
  lt120: bigint;
  b120: bigint;
  b200: bigint;
  gte250: bigint;
  minlen: number | null;
  p50len: number | null;
  maxlen: number | null;
  asofmin: string | null;
  asofmax: string | null;
  distinctasof: bigint;
}

const n = (v: bigint | number | null | undefined): number => Number(v ?? 0);

/**
 * 한 시장의 캐시 커버리지. 실패하면 던지지 않고 `null` — 감사 라우트가 부분 실패를
 * 정직하게 표시할 수 있어야 한다(전체 500 으로 덮으면 나머지 측정치까지 잃는다).
 */
export async function candleCoverage(market: CandleMarket): Promise<CandleCoverage | null> {
  const like = `${PREFIX[market]}%`;
  try {
    // `jsonb_array_length` 는 대상이 배열이 아니면 에러를 낸다 —
    // `jsonb_typeof` 가드로 손상된 행이 집계 전체를 죽이지 않게 한다.
    const [agg] = await prisma.$queryRaw<Aggregate[]>`
      WITH lens AS (
        SELECT
          CASE WHEN jsonb_typeof("row"->'candles') = 'array'
               THEN jsonb_array_length("row"->'candles') END AS len,
          "row"->>'asOf' AS as_of
        FROM "FeedContentCache"
        WHERE "id" LIKE ${like}
      )
      SELECT
        count(*)                                        AS rows,
        count(*) FILTER (WHERE len <  120)              AS lt120,
        count(*) FILTER (WHERE len >= 120 AND len < 200) AS b120,
        count(*) FILTER (WHERE len >= 200 AND len < 250) AS b200,
        count(*) FILTER (WHERE len >= 250)              AS gte250,
        min(len)                                        AS minlen,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY len) AS p50len,
        max(len)                                        AS maxlen,
        min(as_of)                                      AS asofmin,
        max(as_of)                                      AS asofmax,
        count(DISTINCT as_of)                           AS distinctasof
      FROM lens
    `;
    if (!agg) return null;
    const rows = n(agg.rows);
    return {
      market,
      rows,
      buckets: {
        lt120: n(agg.lt120),
        from120to199: n(agg.b120),
        from200to249: n(agg.b200),
        gte250: n(agg.gte250),
      },
      lengths:
        rows > 0 && agg.minlen != null
          ? { min: n(agg.minlen), p50: n(agg.p50len), max: n(agg.maxlen) }
          : null,
      freshness: {
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
