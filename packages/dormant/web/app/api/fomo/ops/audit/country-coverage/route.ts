import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { countryCoverage } from "../../../../../../lib/country-coverage";

/**
 * US-02 D-2·D-3 전용 **읽기 전용** 감사 라우트 — 국가별 카드 수(일별)와 신호별 국가 분포.
 *
 * 왜 라우트인가: 판단 원장은 프로덕션 DB 안에 있고, 자격증명을 로컬로 내리는 대신
 * **이미 DB 가 붙어 있는 런타임에서 집계**한다(`candle-coverage` 와 같은 구조).
 *
 * 안전 규약(candle-coverage 와 동일):
 *  - 쓰기 없음. `SELECT` 둘.
 *  - `AUDIT_TOKEN` 필수. **미설정이면 무조건 거부**.
 *  - `CRON_SECRET` 재사용 금지 — 크론 키는 크론을 부르고 크론은 쓴다.
 *
 * `alert` 는 이 라우트가 직접 내리는 판정이다 — 미국 0장이 **이틀 연속**이면 `us-zero-2d`.
 * 알림을 워크플로 셸에서 계산하지 않는 이유: 기준이 두 곳에 흩어지면 갈라진다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;
const NO_STORE = { "Cache-Control": "no-store" } as const;

/** WO D-2: "덱에 미국 카드가 이틀 연속 0장이면 알림". */
const US_ZERO_ALERT_STREAK = 2;

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
  const raw = Number(url.searchParams.get("days"));
  const days = Number.isFinite(raw) && raw > 0 ? raw : 14;

  const coverage = await countryCoverage(days);
  if (!coverage) {
    return NextResponse.json(
      { ok: false, error: "집계 실패 — 미확인" },
      { status: 503, headers: { ...CORS, ...NO_STORE } }
    );
  }

  const alerts: string[] = [];
  if (coverage.usZeroStreak >= US_ZERO_ALERT_STREAK) {
    alerts.push(`us-zero-${coverage.usZeroStreak}d`);
  }

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      alertThresholdDays: US_ZERO_ALERT_STREAK,
      ...coverage,
      alerts,
      notes: {
        denominator:
          "usSharePct 의 분모는 종목 카드(kr + us)다. 코인·거시는 국가가 없어 비중 계산에서 뺀다.",
        missingDates:
          "원장에 selection 행이 하나도 없는 날이다. 미국 0장과 다른 사고(빌드·적재 실패)이므로 " +
          "usZeroStreak 계산에서 제외한다 — 빈 날을 0장으로 세면 없는 사고를 만들어낸다.",
        source: "JudgmentLedger — kind='selection'(카드 수) · kind='signal'(payload.signalTypes).",
      },
    },
    { headers: { ...CORS, ...NO_STORE } }
  );
}
