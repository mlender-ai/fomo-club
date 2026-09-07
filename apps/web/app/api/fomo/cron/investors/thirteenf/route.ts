import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { withCors, kstDate } from "../../../../../../lib/fomo";
import { readInvestorCollection, writeInvestorCollection } from "../../../../../../lib/investor-store";
import { mergeThirteenF } from "../../../../../../lib/thirteenf-ingest";

/**
 * LAUNCH-P1 §C-3 — **13F 수집물 받는 창구.**
 *
 * `POST /api/fomo/cron/investors/thirteenf`
 *
 * ## 왜 쓰기 엔드포인트를 만들었나
 *
 * SEC EDGAR 가 Vercel 런타임에서 막힌다(INFLUENCER-01 실측: 같은 코드가 로컬에서는 된다).
 * 수집을 GitHub Actions 로 옮기고 결과만 여기로 받는다 — 그러면 **밖에서 우리 저장소에
 * 쓰는 경로가 새로 생긴다.** 그게 이 파일에서 가장 조심할 지점이다.
 *
 * ## 인증 — 비밀값이 없으면 거부한다
 *
 * 크론 라우트의 관행은 이렇다:
 *
 * ```ts
 * return !secret || header === `Bearer ${secret}`;   // ← 환경변수가 비면 전부 통과
 * ```
 *
 * 읽기 크론에서는 넘어갔지만 **쓰기에서는 그게 공개 쓰기다.** 감사 라우트의 규칙
 * (`미설정 = 거부`)을 따른다. 비교는 `timingSafeEqual` 로 한다.
 *
 * `CRON_SECRET` 을 쓴다 — 이 값은 **이미 GitHub Actions 에 있다**(`investor-collect.yml`
 * 이 크론 라우트를 부를 때 쓴다). 새 비밀값을 만들면 관리할 것이 하나 늘 뿐이고
 * 노출면은 그대로다.
 *
 * ## 무엇을 받나
 *
 * `{ byInvestor: { <13F 인물 id>: { latest, prior, unresolved } } }`.
 * 검사·병합은 `lib/thirteenf-ingest.ts`(순수 함수)가 하고, ARK 칸은 건드리지 않는다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 미설정 = 거부. **열려 있는 것보다 안 되는 게 낫다**(감사 라우트와 같은 규칙). */
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/** GET 은 쓰기 창구가 아니다 — 무엇을 받는 곳인지만 알린다(인증 필요). */
export function GET(request: Request) {
  if (!authorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  return withCors(NextResponse.json({ ok: true, method: "POST", body: "{ byInvestor: { <id>: { latest, prior } } }" }));
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => null);
    const previous = await readInvestorCollection();
    const result = mergeThirteenF(body, previous, kstDate());

    /**
     * 받은 것이 없으면 **쓰지 않는다.** 빈 payload 로 기존 저장분을 덮으면
     * 그날 인물 카드가 통째로 사라진다(§12 와 같은 사고).
     */
    if (!result.merged) {
      return withCors(
        NextResponse.json(
          { ok: false, blocked: "받을 수 있는 13F 인물이 0명 — 저장분을 유지한다", rejected: result.rejected.slice(0, 10), ms: Date.now() - startedAt },
          { status: 422 }
        )
      );
    }

    await writeInvestorCollection(result.merged);
    return withCors(
      NextResponse.json({
        ok: true,
        accepted: result.accepted,
        detail: result.byInvestor,
        // 버린 것을 밝힌다 — 조용히 버리면 왜 카드가 안 나오는지 알 수 없다.
        rejectedCount: result.rejected.length,
        rejected: result.rejected.slice(0, 10),
        ms: Date.now() - startedAt,
      })
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - startedAt },
        { status: 500 }
      )
    );
  }
}
