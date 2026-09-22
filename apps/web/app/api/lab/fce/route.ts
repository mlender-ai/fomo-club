import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { checkPayload } from "../../../../lib/lab/fce-payload";
import { rebuildCapitalSeries } from "../../../../lib/lab/capital";
import { buildSnapshots } from "../../../../lib/lab/snapshot";
import { prisma } from "../../../../lib/prisma";

/**
 * LAB-BRIDGE PART B — FCE 스냅샷을 받는 자리.
 *
 * FCE 는 로컬(127.0.0.1:8875)에서 돌기 때문에 배포된 랩이 끌어올 수 없다.
 * 그래서 **이 맥에서 도는 업로더가 밀어 올린다**(`scripts/lab/fce-upload.ts`).
 *
 * ## FCE 레포는 건드리지 않았다
 *
 * 지시서는 "FCE 쪽에 업로드 스크립트 하나만 붙인다" 였는데, FCE API 가 이 맥에서
 * 열려 있어서 **업로더를 이 레포에 두면 FCE 변경이 0** 이다. 그쪽이 낫다.
 *
 * ## 실패도 기록한다
 *
 * 성공만 적으면 "언제부터 안 들어왔는지" 를 알 수 없다. 업로더가 실패해도
 * 그 사실을 `FceUpload` 에 남기고, 화면이 그 공백을 그린다(PART B-4).
 */
export const dynamic = "force-dynamic";

/**
 * 거래 이력까지 받으면서 기본 한도로는 모자랐다. 한 바퀴 실측이 ~20초다.
 * 여유를 두되 무한정 늘리지 않는다 — 오래 걸리면 그건 고칠 신호다.
 */
export const maxDuration = 60;

/** 업로더만 부를 수 있다. 토큰이 없으면 **아예 열지 않는다.** */
/**
 * 두 실수를 **같다고 볼 것인가.**
 *
 * `===` 로 비교했다가 같은 페이로드를 다시 보내도 20건 중 18건이 "바뀜" 으로 잡혔다.
 * `DOUBLE PRECISION` 왕복에서 마지막 자리가 흔들리기 때문이다:
 *
 * ```
 * 보낸 값   2.5423573804689172
 * 읽은 값   2.542357380468917
 * ```
 *
 * 그래서 매 업로드마다 146건을 전부 다시 썼고, 그게 타임아웃의 진짜 원인이었다.
 *
 * 1e-9 USDT 는 10억분의 1달러다. **그건 정정이 아니다.** 실제 정정은 이보다 훨씬 크다.
 */
function sameNumber(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
}

function authorized(request: Request): boolean {
  const expected = process.env.LAB_INGEST_TOKEN;
  // 토큰이 설정돼 있지 않으면 거부한다 — "설정 안 됐으니 통과" 는 문을 열어두는 것이다.
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (got.length !== expected.length) return false;
  // 길이가 같을 때만 상수 시간 비교로 간다.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request): Promise<NextResponse> {
  const started = Date.now();

  // 이번에 실제로 쓴 거래 수. 받은 수와 다르다 — 안 바뀐 것은 안 쓴다.
  let tradesWritten = 0;
  /** 이번에 새로 만든 자본 곡선 점 수. */
  let capitalWritten = 0;

  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { payload, problems } = checkPayload(body);
  if (!payload) {
    // **검사에 걸린 것도 실패로 남긴다.** 조용히 400 만 주면 업로더가 며칠 헛돌아도 모른다.
    await prisma.fceUpload.create({
      data: {
        ok: false,
        error: `payload: ${problems.map((p) => `${p.path} ${p.message}`).join(" · ")}`.slice(0, 900),
        ms: Date.now() - started,
      },
    });
    return NextResponse.json({ error: "bad_payload", problems }, { status: 400 });
  }

  try {
    const asOf = new Date(payload.at);

    for (const track of payload.tracks) {
      const row = {
        label: track.label,
        currency: track.currency,
        startingCapital: track.startingCapital,
        currentCapital: track.currentCapital,
        realized: track.realized,
        unrealized: track.unrealized,
        returnPct: track.returnPct,
        trades: track.trades,
        winRatePct: track.winRatePct,
        profitFactor: track.profitFactor,
        mddPct: track.mddPct,
        sampleNote: track.sampleNote,
        status: track.status,
        statusReason: track.statusReason,
        leverage: track.leverage,
        benchmarkLabel: track.benchmarkLabel,
        benchmarkStart: track.benchmarkStart,
        benchmarkCurrent: track.benchmarkCurrent,
        benchmarkReturnPct: track.benchmarkReturnPct,
        evidenceNote: track.evidenceNote,
        elapsedDays: track.elapsedDays,
        calendarDays: track.calendarDays,
        asOf: new Date(track.asOf),
      };
      await prisma.fceTrack.upsert({
        where: { key: track.key },
        create: { key: track.key, ...row },
        update: row,
      });
    }

    // 포지션은 **지우고 다시 넣는다.** 덮어쓰기만 하면 닫힌 포지션이 표에 남는다.
    await prisma.fcePosition.deleteMany({});
    if (payload.positions.length > 0) {
      await prisma.fcePosition.createMany({
        data: payload.positions.map((p) => ({
          id: p.id,
          trackKey: p.trackKey,
          symbol: p.symbol,
          direction: p.direction,
          leverage: p.leverage,
          marginUsdt: p.marginUsdt,
          netReturnPct: p.netReturnPct,
          healthScore: p.healthScore,
          entryAt: p.entryAt ? new Date(p.entryAt) : null,
          entryPrice: p.entryPrice,
          asOf,
        })),
        skipDuplicates: true,
      });
    }

    // 닫힌 거래는 **지우지 않는다.** 포지션과 정반대다 — 닫힌 거래는 사실이고,
    // FCE 가 보관 기간을 줄이거나 리셋해도 랩에는 남아야 한다.
    //
    // ## 쓰기를 세 번으로 줄인다
    //
    // 처음에는 146건을 한 건씩 `upsert` 했다 → 업로드가 통째로 타임아웃.
    // 다음에는 50건씩 `$transaction` → **그래도 타임아웃**(FUNCTION_INVOCATION_TIMEOUT).
    // 서버리스에서 원격 DB 로 수백 번 왕복하는 것 자체가 안 되는 일이다.
    //
    // 그래서 **이미 있는 것을 먼저 읽고, 정말 바뀐 것만 쓴다.** 닫힌 거래는 원래
    // 안 바뀌므로 정상 상태에서 쓰기가 **0번**이다.
    //
    //   1. 가진 것 읽기        — 1회
    //   2. 새 거래 `createMany` — 1회 (첫 실행에 146건이 한 문장으로 들어간다)
    //   3. 바뀐 거래만 갱신     — 보통 0회
    const rows = payload.trades.map((t) => ({
      id: t.id,
      trackKey: t.trackKey,
      symbol: t.symbol,
      direction: t.direction,
      assetClass: t.assetClass,
      timeframe: t.timeframe,
      leverage: t.leverage,
      marginUsdt: t.marginUsdt,
      entryAt: t.entryAt ? new Date(t.entryAt) : null,
      entryPrice: t.entryPrice,
      exitAt: t.exitAt ? new Date(t.exitAt) : null,
      exitPrice: t.exitPrice,
      grossPnlUsdt: t.grossPnlUsdt,
      costsUsdt: t.costsUsdt,
      netPnlUsdt: t.netPnlUsdt,
      netReturnPct: t.netReturnPct,
      exitReason: t.exitReason,
      lossTags: t.lossTags,
      holdingBars: t.holdingBars,
    }));

    if (rows.length > 0) {
      const known = await prisma.fceTrade.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: {
          id: true,
          exitAt: true,
          exitPrice: true,
          grossPnlUsdt: true,
          costsUsdt: true,
          netPnlUsdt: true,
          netReturnPct: true,
          exitReason: true,
          holdingBars: true,
        },
      });
      const byId = new Map(known.map((k) => [k.id, k]));

      const fresh = rows.filter((r) => !byId.has(r.id));
      if (fresh.length > 0) {
        await prisma.fceTrade.createMany({
          data: fresh.map((r) => ({
            ...r,
            lossTags: r.lossTags.length > 0 ? (r.lossTags as Prisma.InputJsonValue) : Prisma.DbNull,
            asOf,
          })),
          skipDuplicates: true,
        });
      }

      // **무엇이 바뀌면 다시 쓰는가.** 결과 칸만 본다 — 진입 정보는 안 바뀌고,
      // FCE 가 사후에 고치는 것은 비용·손익·청산이다.
      const changed = rows.filter((r) => {
        const old = byId.get(r.id);
        if (!old) return false;
        return (
          old.exitAt?.getTime() !== (r.exitAt?.getTime() ?? undefined) ||
          !sameNumber(old.exitPrice, r.exitPrice) ||
          !sameNumber(old.grossPnlUsdt, r.grossPnlUsdt) ||
          !sameNumber(old.costsUsdt, r.costsUsdt) ||
          !sameNumber(old.netPnlUsdt, r.netPnlUsdt) ||
          !sameNumber(old.netReturnPct, r.netReturnPct) ||
          old.exitReason !== r.exitReason ||
          old.holdingBars !== r.holdingBars
        );
      });
      for (const r of changed) {
        await prisma.fceTrade.update({
          where: { id: r.id },
          data: {
            exitAt: r.exitAt,
            exitPrice: r.exitPrice,
            grossPnlUsdt: r.grossPnlUsdt,
            costsUsdt: r.costsUsdt,
            netPnlUsdt: r.netPnlUsdt,
            netReturnPct: r.netReturnPct,
            exitReason: r.exitReason,
            lossTags: r.lossTags.length > 0 ? (r.lossTags as Prisma.InputJsonValue) : Prisma.DbNull,
            holdingBars: r.holdingBars,
            asOf,
          },
        });
      }
      tradesWritten = fresh.length + changed.length;

      // **거래가 바뀐 때만 자본 곡선을 다시 만든다.** 매번 돌리면 아무것도 안
      // 바뀐 날에도 왕복이 늘고, 이 라우트는 왕복 한 번이 ~1초다.
      // 집계를 미리 해두는 자리이기도 하다(UI-02 F-1 — 요청 시점에 계산하지 않는다).
      if (tradesWritten > 0) {
        for (const key of new Set(rows.map((r) => r.trackKey))) {
          capitalWritten += await rebuildCapitalSeries(key);
        }
      }
    }

    if (payload.whale) {
      const w = payload.whale;
      const row = {
        walletsTotal: w.walletsTotal,
        eligible: w.eligible,
        rejected: w.rejected,
        passers: w.passers,
        followWinPct: w.followWinPct,
        followTrades: w.followTrades,
        followPf: w.followPf,
        followNetUsdt: w.followNetUsdt,
        // `exactOptionalPropertyTypes` — 선택적 Json 칸에 undefined 를 넣을 수 없다.
        // `Prisma.DbNull` 이 "값이 없다" 를 DB 에 명시적으로 적는 방법이다.
        latency: (w.latency ?? Prisma.DbNull) as Prisma.InputJsonValue,
        drift: (w.drift ?? Prisma.DbNull) as Prisma.InputJsonValue,
        asOf: new Date(w.asOf),
      };
      await prisma.fceWhale.upsert({ where: { id: 1 }, create: { id: 1, ...row }, update: row });
    }

    // **여섯 탭을 통째로 조립해 둔다**(UI-02 F-1). 화면 요청은 이걸 한 줄 읽는다 —
    // 원격 DB 왕복이 ~900ms 라서 쿼리 수가 곧 응답 시간이다.
    const built = await buildSnapshots();

    await prisma.fceUpload.create({
      data: {
        ok: true,
        tracks: payload.tracks.length,
        positions: payload.positions.length,
        ms: Date.now() - started,
      },
    });

    return NextResponse.json({
      ok: true,
      tracks: payload.tracks.length,
      positions: payload.positions.length,
      trades: payload.trades.length,
      // 받은 수가 아니라 **실제로 쓴 수.** 0 이면 바뀐 게 없다는 뜻이고 그게 정상이다.
      tradesWritten,
      capitalWritten,
      snapshots: built.length,
      whale: payload.whale !== null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.fceUpload.create({
      data: { ok: false, error: message.slice(0, 900), ms: Date.now() - started },
    });
    return NextResponse.json({ error: "write_failed", message }, { status: 500 });
  }
}
