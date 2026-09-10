import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { buildExposureHistory } from "@fomo/core/keyword-cards/exposure-history";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { readFeedContentMany, readFeedContentStrict, writeFeedContent } from "../../../../../lib/feed-content-store";
import { appendJudgmentLedger } from "../../../../../lib/judgment-ledger";
import {
  buildQuietPickResponse,
  quietPickLedgerEntries,
  quietPickPriorState,
  quietPickPage1Streaks,
  quietPickPublishBlockReason,
  type QuietPickResponse,
} from "../../../../../lib/quiet-pick";
import { buildQuietPickStamps, type PublicationStamp } from "../../../../../lib/publication-stamp";
import { DECK_ALERT_MIN } from "../../../../../lib/deck-ranking";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTIVE_ID = "quiet-pick:active";
const dateId = (date: string) => `quiet-pick:${date}`;
/**
 * 단계별 통과 수의 **일별 보관함**(HOTFIX-DECK §C-3).
 *
 * 페이로드 안에도 `qualification.funnel` 이 있지만 그것은 발행분과 함께 덮어써진다 —
 * **차단된 굽기의 숫자는 남지 않는다.** 원인을 찾을 때 정작 필요한 게 그 숫자다.
 * 그래서 성공·차단 양쪽에서 별도 키로 굳힌다. 가볍고(수십 바이트) 매일 한 줄이다.
 */
const funnelId = (date: string) => `deck-funnel:${date}`;

/**
 * 덱이 사고 수준으로 짧으면 **즉시 알린다**(§C-2).
 *
 * 2026-08-28 에 덱이 1장인 것을 **사용자가 화면을 보고** 알았다. 알림이 없으면 다음에도
 * 그렇게 안다. 웹훅이 없는 환경(로컬·프리뷰)에서는 콘솔만 남기고 조용히 넘어간다 —
 * 알림 실패가 발행을 막으면 그게 더 큰 사고다.
 */
async function alertSmallDeck(text: string): Promise<"sent" | "skipped" | "failed"> {
  console.error(`[fomo/cron/quiet-pick] ${text}`);
  const webhook = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhook) return "skipped";
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `🚨 ${text}` }),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** 단계별 숫자 한 줄 — 성공이든 차단이든 남긴다. 쓰기 실패가 발행을 막지 않는다. */
async function recordFunnel(
  date: string,
  row: { published: number; blocked: string | null; qualification: QuietPickResponse["qualification"]; rotation?: QuietPickResponse["rotation"] }
): Promise<void> {
  try {
    await writeFeedContent(funnelId(date), {
      date,
      recordedAt: new Date().toISOString(),
      published: row.published,
      blocked: row.blocked,
      funnel: row.qualification.funnel ?? null,
      exposure: row.qualification.exposure ?? null,
      drops: row.qualification.drops ?? null,
      relaxations: row.rotation?.relaxations ?? [],
      compositionSkipped: row.rotation?.compositionSkipped ?? null,
    });
  } catch (error) {
    console.warn("[fomo/cron/quiet-pick] funnel record skipped", error instanceof Error ? error.message : error);
  }
}
/**
 * 1페이지 쿨다운 이력 창(일). 최장 계단이 7일 연속이므로 그보다 하루 넉넉하게 읽는다 —
 * 더 읽어도 계수는 안 바뀌고 DB 왕복만 늘어난다.
 */
const PAGE1_HISTORY_DAYS = 8;
/** 거시 카드가 「최근 짚은 종목」으로 볼 창(일) — WO-RESET-09 §B-3. */
const RECENT_PICK_DAYS = 30;

/** KST 기준 `date` 에서 하루씩 거슬러 올라간 날짜들(오늘 제외 — 자기 자신 때문에 감점되면 안 된다). */
function priorDates(date: string, count: number): string[] {
  const base = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(base)) return [];
  return Array.from({ length: count }, (_, i) => new Date(base - (i + 1) * 86_400_000).toISOString().slice(0, 10));
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const startedAt = Date.now();
  try {
    const date = kstDate();
    // 신선도 — 어제 픽과 같은 종목·같은 신호 시작이면 제외(신호 갱신 시만 재편입).
    //
    // **strict** 로 읽는다. 삼킨 null 은 "아직 안 구웠다" 와 "DB 읽기가 실패했다" 를 같게 만들고,
    // 후자라면 아래 발행 가드의 붕괴 기준선이 조용히 0 이 되어 가드가 무력해진다. 여기서 던지면
    // 아래 catch 가 500 을 주고 **아무것도 쓰지 않는다** — 커넥션 풀이 마른 날 원하는 결과다.
    const prior = await readFeedContentStrict<QuietPickResponse>(ACTIVE_ID);
    const priorPicks = prior && prior.date !== date ? quietPickPriorState(prior) : new Map();

    // 1페이지 재노출 쿨다운(WO-DECK-01 §3) — 최근 스냅샷에서 연속 점유일수를 센다.
    //
    // **한 쿼리로** 읽는다. `Promise.all` 로 8개를 병렬 조회하면 커넥션 풀에서 8슬롯을 동시에
    // 잡고, 실측(2026-08-18)에서 그것이 `EMAXCONNSESSION`(pool_size 15) 을 유발해 조회 라우트가
    // 503 으로 넘어갔다. 스냅샷이 없는 날(크론 실패)은 자연히 연속을 끊는다.
    // 이력 조회 실패가 발행을 막지는 않는다 — 쿨다운 없는 덱이 덱 없는 것보다 낫다.
    const wanted = priorDates(date, PAGE1_HISTORY_DAYS);
    const snapshots = await readFeedContentMany<QuietPickResponse>(wanted.map(dateId)).catch(
      () => new Map<string, QuietPickResponse>()
    );
    const page1Streaks = quietPickPage1Streaks(wanted.map((d) => snapshots.get(dateId(d)) ?? null));

    /**
     * WO-RESET-09 §B-3 — 거시 카드는 **우리가 최근 30일 안에 짚은 종목**과 연결될 때만 만든다.
     *
     * 위 스냅샷은 8일치라 모자란다. **한 쿼리로** 30일치를 더 읽는다 — 날짜마다 따로 읽으면
     * 커넥션 풀에서 30슬롯을 잡고, 그것이 §12 의 사고였다.
     */
    const recentDates = priorDates(date, RECENT_PICK_DAYS);
    const recentSnaps = await readFeedContentMany<QuietPickResponse>(recentDates.map(dateId)).catch(
      () => new Map<string, QuietPickResponse>()
    );
    const recentPicks = new Map<string, string>();
    for (const d of recentDates) {
      for (const pick of recentSnaps.get(dateId(d))?.picks ?? []) {
        // 가장 **최근에** 짚은 날을 남긴다 — 화면이 「8월 20일에 짚었어요」로 쓴다.
        if (!recentPicks.has(pick.subject.canonical)) recentPicks.set(pick.subject.canonical, d);
      }
    }

    /**
     * WO-RESET-06 §A — 재노출 규칙과 노출 이력의 입력.
     *
     * ## 8일 → 30일 (FIX-03 PART A)
     *
     * 종전에는 위 `snapshots`(8일치)로 만들었다. 그래서 **「우리가 8월 26일에도 짚었어요」가
     * 8일 안쪽만 기억했다** — 실측(2026-09-04)에서 종근당의 8월 26일 노출은 창 밖이라
     * `exposure` 가 아예 없었고, 카드의 「다시 나왔어요」·처음 가격·상세 이력이 전부 꺼졌다.
     * 그 표시들은 **구현돼 있었고 재료가 없었을 뿐이다.**
     *
     * 30일치(`recentSnaps`)는 거시 카드용으로 **이미 한 쿼리로 읽어둔 것**이라 커넥션을 더
     * 잡지 않는다(§12 의 교훈). 오늘자는 두 목록 모두에 애초에 없다.
     *
     * **덱 반복 규칙은 그대로다** — 보류 판정은 `RECENT_EXPOSURE_DAYS`(2일) 안의 항목만
     * 보므로 이력이 길어져도 오늘 덱 구성은 달라지지 않는다.
     */
    const exposureHistory = buildExposureHistory(recentDates.map((d) => recentSnaps.get(dateId(d)) ?? null));

    const response = await buildQuietPickResponse({ date, priorPicks, page1Streaks, exposureHistory, recentPicks });

    // WO-P1 자가검증 — 발행 픽 전원 캔들 ≥200일. 게이트가 이미 걸렀으므로 여기서 걸리면 게이트 회귀다.
    const thin = response.picks.filter((pick) => pick.dataQuality.candles < 200);
    if (thin.length > 0) {
      const detail = thin.map((pick) => `${pick.subject.canonical}:${pick.dataQuality.candles}`).join(", ");
      console.error("[fomo/cron/quiet-pick] data completeness gate regression", detail);
      return withCors(
        NextResponse.json(
          { ok: false, error: `데이터 미완결 픽 발행 시도: ${detail}`, date },
          { status: 500 }
        )
      );
    }

    // ── 발행 가드(fail-closed) — **쓰기 전에** 판정한다.
    //
    // 2026-08-23 사고(`docs/STATUS.md` §12): 검증이 쓰기 뒤에 있어 `picks: 0` 이 먼저 발행되고
    // 그 다음에 워크플로가 실패를 알렸다. 사용자는 2분간 빈 덱을 봤다. 차단 시 직전 페이로드는
    // 손대지 않는다 — 하루 묵은 덱은 `asOf` 로 정직하게 표시되지만 빈 덱은 회귀다.
    const blockReason = quietPickPublishBlockReason(response, prior);
    if (blockReason) {
      console.error(`[fomo/cron/quiet-pick] 발행 차단 — ${blockReason}`);
      // 차단된 굽기의 숫자야말로 원인 추적에 필요하다 — 페이로드에 안 남으므로 여기서 남긴다.
      await recordFunnel(date, { published: 0, blocked: blockReason, qualification: response.qualification, ...(response.rotation ? { rotation: response.rotation } : {}) });
      await alertSmallDeck(`덱 발행이 차단됐어요 (${date}) — ${blockReason}. 직전 ${prior?.picks.length ?? 0}장을 유지합니다.`);
      return withCors(
        NextResponse.json(
          {
            ok: false,
            blocked: blockReason,
            date,
            // 직전 페이로드가 그대로 살아 있다는 사실을 응답에 박아둔다 — 재실행 판단의 근거다.
            keptPriorPicks: prior?.picks.length ?? 0,
            attemptedPicks: response.picks.length,
            qualification: response.qualification,
            ms: Date.now() - startedAt,
          },
          { status: 503 }
        )
      );
    }

    await writeFeedContent(dateId(date), response);
    await writeFeedContent(ACTIVE_ID, response);

    // ── 단계별 숫자 기록 + 짧은 덱 알림(§C-2·§C-3) ──
    //
    // 발행 **뒤에** 한다. 알림이나 기록이 실패해도 덱은 이미 나가 있어야 한다 —
    // 관측 때문에 제품이 멈추면 관측이 제품을 망친 것이다.
    await recordFunnel(date, { published: response.picks.length, blocked: null, qualification: response.qualification, ...(response.rotation ? { rotation: response.rotation } : {}) });
    const deckAlert = response.picks.length < DECK_ALERT_MIN
      ? await alertSmallDeck(
          `오늘 덱이 ${response.picks.length}장이에요 (${date}, 기준 ${DECK_ALERT_MIN}장). ` +
          `푼 규칙: ${response.rotation?.relaxations.join(", ") || "없음"} · ` +
          `재노출 보류 ${response.qualification.exposure?.blocked ?? 0}장 · ` +
          `품질 통과 ${response.qualification.funnel?.qualified ?? 0}장`
        )
      : null;

    // 발행 즉시 원장 append(성적표 채점 원료 — G1-C). 원장 실패가 픽 발행을 막지 않는다.
    //
    // 발행 시점 스탬프(WO-SUB-07 [F])를 같이 싣는다. **소급 불가** — 이 순간을 놓치면 아키타입·
    // 팩트시트 해시·무효선을 나중에 복원할 수 없다. 저장 레코드만 읽으므로 외부 소스 장애와 무관하고,
    // 스탬프 조립이 실패해도 스탬프 없이 원장은 쓴다(기록 자체가 늦는 쪽이 더 큰 손실).
    let ledgerAppended = 0;
    let stamps = new Map<string, PublicationStamp>();
    try {
      stamps = await buildQuietPickStamps(response);
    } catch (error) {
      // 스탬프 실패가 원장 기록을 막지 않는다 — 스탬프 없는 행이라도 발행 사실은 남아야 한다.
      console.warn("[fomo/cron/quiet-pick] publication stamp skipped", error instanceof Error ? error.message : error);
    }
    try {
      ledgerAppended = await appendJudgmentLedger(quietPickLedgerEntries(response, stamps));
    } catch (error) {
      console.warn("[fomo/cron/quiet-pick] ledger append deferred", error instanceof Error ? error.message : error);
    }

    revalidateTag("quiet-pick", { expire: 0 });
    return withCors(
      NextResponse.json({
        ok: true,
        date,
        published: response.picks.length,
        // 짧은 덱 알림 결과 — `skipped` 는 웹훅 미설정(로컬·프리뷰), `failed` 는 전송 실패다.
        // 응답에 박아둬야 "알림이 안 왔다" 와 "알림 채널이 죽었다" 가 갈린다.
        ...(deckAlert ? { deckAlert } : {}),
        ledgerAppended,
        // 스탬프 확보 현황(WO-SUB-07 [F]) — 몇 장이 발행 시점 기록을 갖췄고 무엇이 비었는지.
        // 소급 불가라 여기서 0 이 보이면 그날 기록은 영구 결손이다. 크론 응답에 그대로 노출한다.
        stamped: stamps.size,
        stampMissing: Object.entries(
          [...stamps.values()].reduce<Record<string, number>>((acc, stamp) => {
            for (const field of stamp.missing) acc[field] = (acc[field] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([field, count]) => ({ field, count })),
        qualification: response.qualification,
        // 회전율(WO-DECK-01 PHASE 5) — 1페이지가 어제와 겹치면 여기서 바로 보인다.
        rotation: response.rotation ?? null,
        // 픽별 데이터 완결성 로그(WO-P1 수용 기준 — 하이드레이션 로그 첨부용).
        dataQuality: response.picks.map((pick) => ({
          stock: pick.subject.canonical,
          ...pick.dataQuality,
          tickerValue: pick.subject.symbol ?? null,
          identityValue: pick.subject.identity ?? null,
        })),
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

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
