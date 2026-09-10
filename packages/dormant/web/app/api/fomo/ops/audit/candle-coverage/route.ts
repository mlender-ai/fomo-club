import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  candleCoverage,
  denominatorWarning,
  universeRatePct,
  type CandleMarket,
} from "../../../../../../lib/candle-coverage";

/**
 * CTX-00 B-2 전용 **읽기 전용** 감사 라우트 — 일봉 ≥250거래일 확보율.
 *
 * 왜 라우트인가: 캔들 캐시는 프로덕션 DB 안에 있고, 자격증명을 로컬로 내리는 대신
 * **이미 DB 가 붙어 있는 런타임에서 집계**한다(`card-fields` 라우트와 같은 구조).
 * 집계는 SQL 이 하고 배열은 전송하지 않는다 — `lib/candle-coverage.ts` 주석 참조.
 *
 * 안전 규약 — CTX-00 「프로덕션 동작 변경 없음」의 추가 전용 예외(R1):
 *  - 쓰기 없음. `SELECT` 하나.
 *  - `AUDIT_TOKEN` 필수. **미설정이면 무조건 거부**.
 *  - `CRON_SECRET` 재사용 금지(R2) — 크론 키는 크론을 부르고 크론은 쓴다.
 *
 * ## 분모 주의 — 이 라우트가 스스로 확보율을 단정하지 않는 이유
 *
 * 캐시에는 **저장에 성공한 종목만** 행이 있다. 이력이 짧거나(<120) fetch 가 실패한 종목은
 * 행이 없다. 따라서 `gte250 / rows` 는 확보율이 **아니다** — 실제보다 좋게 나온다.
 * 진짜 분모는 프리웜이 돈 **유니버스 크기**이고 그 값은 워크플로 실행 산출물에 있다.
 * 그래서 `?universe=<n>` 으로 받았을 때만 `universeRatePct` 를 낸다. 안 주면 `null` 이다 —
 * **모르는 분모를 지어내지 않는다.**
 *
 * ## 분자도 조심해야 했다 — 첫 실측(2026-08-17)이 174.7% 를 냈다
 *
 * 캐시는 정리되지 않아 한 달치가 쌓인다(KR 802행 vs 유니버스 450). 지금 유니버스에 없는
 * 종목의 옛 행도 남아 있다. 그래서 분자를 **신선분**(`asOf` 가 각 캐시의 `MAX_STALE_DAYS` 안)
 * 으로 좁혔다 — 스테일 행은 읽기 경로가 버리므로 애초에 확보가 아니다.
 * 그래도 100% 를 넘으면 `denominatorWarning` 이 **인용하지 말라고 명시**한다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function authorized(request: Request): boolean {
  const expected = process.env.AUDIT_TOKEN?.trim();
  if (!expected) return false; // 미설정 = 거부. 열려 있는 것보다 안 되는 게 낫다.
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { ...CORS, ...NO_STORE } });
  }
  const url = new URL(request.url);
  const raw = url.searchParams.get("universe");
  const universe = raw && Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;

  const markets: CandleMarket[] = ["KR", "US"];
  const results = await Promise.all(markets.map((m) => candleCoverage(m)));

  const byMarket = Object.fromEntries(
    markets.map((market, i) => {
      const cov = results[i] ?? null;
      return [
        market,
        cov === null
          ? { error: "집계 실패 — 미확인" }
          : (() => {
              // **신선분만** 분자로 쓴다. 스테일 행은 `readKrCandleCache` 가 버리므로 확보가 아니다.
              const rate = universeRatePct(cov.freshBuckets.gte250, universe);
              return {
                ...cov,
                universe,
                universeRateGte250Pct: rate,
                /** 100% 를 넘으면 분자·분모 모집단이 다르다는 뜻이다. 조용히 깎지 않고 알린다. */
                denominatorWarning: denominatorWarning(rate),
                cacheRateGte250Pct:
                  cov.freshRows > 0
                    ? Math.round((cov.freshBuckets.gte250 / cov.freshRows) * 1000) / 10
                    : null,
              };
            })(),
      ];
    })
  );

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      byMarket,
      notes: {
        denominator:
          "cacheRate 의 분모는 캐시 보유 종목이다. 저장 실패·이력 부족 종목은 행이 없으므로 확보율보다 좋게 나온다. " +
          "유니버스 확보율은 ?universe=<프리웜 실행의 universe 값> 을 줘야 나온다.",
        freshness:
          "buckets 는 스테일 포함 전체, freshBuckets 는 asOf 가 staleDays 안인 것만이다. " +
          "확보율의 분자는 freshBuckets 다 — 스테일 행은 읽기 경로(readKrCandleCache)가 null 로 버린다.",
        KR: "kr-candle-prewarm 크론이 유니버스 전수를 돈다(=universe 분모가 의미 있다). MIN_USEFUL_DAYS=120 미만은 저장하지 않는다. 캐시는 정리되지 않아 rows 가 유니버스보다 클 수 있다.",
        US: "us-candles 는 유니버스 프리웜이 아니라 **픽 크론이 발행 시점에 봉인**한 것이다. 유니버스 확보율의 분모로 쓸 수 없다 — 발행분 성질이다.",
      },
    },
    { headers: { ...CORS, ...NO_STORE } }
  );
}
