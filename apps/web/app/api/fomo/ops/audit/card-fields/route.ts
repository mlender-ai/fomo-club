import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withCors, corsJson } from "../../../../../../lib/fomo";
import { readFeedContentHistoryByPrefix } from "../../../../../../lib/feed-content-store";
import type { QuietPickResponse } from "../../../../../../lib/quiet-pick";

/**
 * CTX-00 PART A 전용 **읽기 전용** 감사 라우트.
 *
 * 왜 라우트인가: 실사에 필요한 것은 프로덕션 DB 의 과거 발행 덱인데, 공개 API 는 오늘 활성 덱
 * 10장만 준다. 자격증명을 로컬로 내리는 대신 **이미 DB 가 붙어 있는 런타임에서 집계**한다.
 * (DART 가 로컬에서만 막히고 Vercel 에서는 열렸던 전례와 같은 구조다.)
 *
 * 안전 규약 — 이 라우트는 CTX-00 의 "프로덕션 동작 변경 없음" 에 대한 **추가 전용** 예외다:
 *  - 쓰기 없음. `readFeedContentHistoryByPrefix` 한 번만 부른다.
 *  - `AUDIT_TOKEN` 필수. **미설정이면 무조건 거부**한다(설정 누락이 공개로 이어지면 안 된다).
 *  - `CRON_SECRET` 을 재사용하지 않는다 — 그 키는 크론을 호출할 수 있고 크론은 **쓴다**.
 *    감사용 능력은 "이 라우트 호출" 하나로 좁힌다.
 *  - 표본 상한을 두어 조회 부하를 묶는다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTIVE_ID = "quiet-pick:active";
const MAX_DECKS = 400;
const MAX_DUMP = 5;

function authorized(request: Request): boolean {
  const expected = process.env.AUDIT_TOKEN?.trim();
  if (!expected) return false; // 미설정 = 거부. 열려 있는 것보다 안 되는 게 낫다.
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 시드 고정 결정론 추출 — 같은 (시드, 모집단) 이면 같은 표본. */
function seededPick<T>(items: T[], key: (item: T) => string, seed: string, n: number): T[] {
  return [...items]
    .map((item) => ({ item, h: createHash("sha256").update(`${seed}${key(item)}`).digest("hex") }))
    .sort((x, y) => (x.h < y.h ? -1 : x.h > y.h ? 1 : 0))
    .slice(0, n)
    .map((x) => x.item);
}

type Pick = QuietPickResponse["picks"][number];

const bump = (acc: Record<string, number>, key: string) => {
  acc[key] = (acc[key] ?? 0) + 1;
};

function aggregate(picks: Array<{ date: string; pick: Pick }>) {
  const actors: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  const anomalyKinds: Record<string, number> = {};
  const topLevelKeys: Record<string, number> = {};
  const candles: number[] = [];
  const sparklines: number[] = [];
  let perActorFields = 0;
  let anomalyNumericFields = 0;
  let ohlc = 0;
  let background = 0;
  let whyNowPhase = 0;
  let whyNowKeyLevels = 0;
  let signalStats = 0;
  let streakMismatch = 0;

  for (const { pick } of picks) {
    const p = pick as unknown as Record<string, unknown>;
    for (const k of Object.keys(p)) bump(topLevelKeys, k);

    const signal = (p.signal ?? {}) as Record<string, unknown>;
    bump(actors, String(signal.actors ?? "(없음)"));
    bump(kinds, String(signal.kind ?? "(없음)"));
    if (signal.individualNet != null || signal.foreignNet != null || signal.institutionNet != null) perActorFields += 1;

    for (const raw of (p.anomalies as unknown[] | undefined) ?? []) {
      const a = raw as Record<string, unknown>;
      bump(anomalyKinds, String(a.kind ?? "(없음)"));
      // 페이로드에 실수치가 남는가 — 문장(text)이 아니라 필드로.
      if (Object.keys(a).some((k) => !["kind", "text", "chip", "axis", "strength"].includes(k))) {
        anomalyNumericFields += 1;
      }
    }

    const price = (p.price ?? {}) as Record<string, unknown>;
    if (Array.isArray(price.sparkline)) sparklines.push(price.sparkline.length);
    if (p.candles || p.ohlc || price.volume) ohlc += 1;
    if (p.news || p.disclosure || p.earnings || p.catalyst || p.background) background += 1;
    if (p.signalStats) signalStats += 1;

    const dq = (p.dataQuality ?? {}) as Record<string, unknown>;
    if (typeof dq.candles === "number") candles.push(dq.candles);

    const whyNow = ((p.conviction as Record<string, unknown> | undefined)?.whyNow ?? {}) as Record<string, unknown>;
    if (whyNow.phase) whyNowPhase += 1;
    if (whyNow.keyLevels) whyNowKeyLevels += 1;

    // 훅(signal.days)과 디테일 문장의 연속일수가 어긋나는가 — 2026-08-16 실측에서 발견된 결함.
    const summary = typeof whyNow.summary === "string" ? whyNow.summary : "";
    const stated = summary.match(/(\d+)일\s*연속/);
    if (stated && typeof signal.days === "number" && Number(stated[1]) !== signal.days) streakMismatch += 1;
  }

  const n = picks.length;
  const pct = (v: number) => (n === 0 ? null : Math.round((v / n) * 1000) / 10);
  const quantiles = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
    return { min: s[0]!, p50: at(0.5), max: s[s.length - 1]! };
  };

  return {
    n,
    supplyActor: {
      perActorFields,
      perActorFieldsPct: pct(perActorFields),
      actorsIsPlainString: true,
      actorsDistribution: actors,
      signalKindDistribution: kinds,
    },
    streak: { hasScalarDays: true, perActorStreakArrays: 0, hookVsDetailMismatch: streakMismatch },
    volume: { anomalyKindDistribution: anomalyKinds, anomalyNumericFields },
    priceStructure: { sparklineLength: quantiles(sparklines), whyNowPhase, whyNowKeyLevels },
    candlesOhlc: { ohlcSeriesPresent: ohlc, dataQualityCandles: quantiles(candles), candlesAtLeast250: candles.filter((c) => c >= 250).length },
    background: { newsDisclosureEarningsFields: background },
    signalStatsPresent: signalStats,
    topLevelKeys,
  };
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "dump" ? "dump" : "aggregate";
  const seed = url.searchParams.get("seed") ?? "ctx-00";
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") ?? 200)));

  try {
    const decks = (await readFeedContentHistoryByPrefix<QuietPickResponse>("quiet-pick:", MAX_DECKS))
      .filter((row) => row.id !== ACTIVE_ID);

    const all = decks.flatMap((deck) =>
      (deck.row?.picks ?? []).map((pick) => ({
        date: deck.row?.date ?? deck.id.replace("quiet-pick:", ""),
        id: `${deck.id}${pick?.subject?.canonical ?? "?"}`,
        pick,
      }))
    );

    const sample = seededPick(all, (x) => x.id, seed, limit);
    const population = { decks: decks.length, picks: all.length, dateRange: [decks[0]?.id ?? null, decks[decks.length - 1]?.id ?? null] };

    // 구조 덤프 우선 — 추측 파서로 집계하지 않는다(CTX-00 §0).
    if (mode === "dump") {
      return corsJson(
        { ok: true, mode, seed, population, sample: sample.slice(0, MAX_DUMP) },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    return corsJson(
      { ok: true, mode, seed, limit, population, sampled: sample.length, aggregate: aggregate(sample) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
