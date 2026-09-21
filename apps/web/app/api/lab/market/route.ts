import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";

/**
 * 시세·봉·펀딩비·고래를 받는 자리.
 *
 * ## 왜 필요했나 — GitHub 크론이 못 지킨다
 *
 * 수집은 `lab-collect.yml` 이 5분·매시 주기로 돌게 해뒀다. 그런데 실측이 이랬다:
 *
 * | 잡 | 걸어둔 주기 | 실측 |
 * |---|---|---|
 * | latest-price | 5분 | 19분에 한 번 |
 * | candles | 매시 | 3.5시간째 안 돎 |
 * | paper-tick | 매시 | 8시간째 안 돎 |
 * | funding | 8시간 | 연속 실패 12회 (fapi.binance.com 451) |
 *
 * `STALE_AFTER_MS` 는 3분이라 화면이 **항상 `끊김`** 이었다. 임계가 틀린 게 아니라
 * 수집이 안 된 것이다 — GitHub schedule 은 지연·누락을 보장하지 않는다.
 *
 * 그리고 451 은 **GitHub 러너(미국 IP)에서만** 난다. 이 맥에서는 200 이다.
 * 즉 수집을 로컬에서 돌리면 주기 문제와 펀딩비 문제가 **같이** 풀린다.
 *
 * ## 그래서 로컬 러너가 밀어 올린다
 *
 * 로컬에는 프로덕션 `DATABASE_URL` 이 없다(Vercel 이 암호화해 안 내려준다).
 * 그래서 FCE 브리지와 **같은 방식**을 쓴다 — 러너는 공개 소스를 읽고, 쓰기는
 * 인증된 이 엔드포인트가 한다. 토큰은 `LAB_INGEST_TOKEN` 하나를 같이 쓴다.
 *
 * ## 구멍을 메우지 않는다
 *
 * 받은 봉만 넣는다. `skipDuplicates` 라 같은 봉을 다시 보내도 덮어쓰지 않는다 —
 * 봉은 닫히면 안 바뀌고, 바뀐다면 그건 소스가 틀린 것이라 조용히 덮으면 안 된다.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.LAB_INGEST_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

interface PriceRow {
  symbol: string;
  price: number;
  at: string;
}
interface CandleRow {
  symbol: string;
  interval: "H1" | "D1";
  at: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
interface FundingRow {
  symbol: string;
  at: string;
  rate: number;
}
interface WhaleRow {
  address: string;
  symbol: string;
  side: string;
  size: number;
  at: string;
}

interface Body {
  job: string;
  source: string;
  startedAt?: string;
  prices?: PriceRow[];
  candles?: CandleRow[];
  funding?: FundingRow[];
  whale?: WhaleRow[];
  /** 러너 쪽에서 실패했을 때 그 사실만 적으러 온다. */
  error?: string;
  detail?: Record<string, unknown>;
}

/**
 * 러너가 **어느 지갑을 보고 있었는지** 물어보는 자리.
 *
 * 고래 코호트를 매 실행 리더보드에서 다시 뽑으면 순위에서 밀린 지갑의 관측이
 * 끊긴다 — 표본이 남되 자라지 않는다(FCE `c0e4805`). 그래서 **이미 보던 지갑**을
 * 그대로 돌려준다. 이건 DB 를 읽어야 아는 값이고 DB 는 여기에만 있다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("cohort") === null) {
    return NextResponse.json({ error: "unknown_query" }, { status: 400 });
  }
  const rows = await prisma.whalePosition.findMany({
    distinct: ["address"],
    select: { address: true },
    orderBy: { at: "desc" },
    take: 200,
  });
  return NextResponse.json({ addresses: rows.map((r) => r.address) });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (typeof body.job !== "string" || body.job.length === 0) {
    return NextResponse.json({ error: "job_required" }, { status: 400 });
  }

  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();
  const source = body.source ?? "local-runner";
  let rows = 0;

  // **러너가 실패한 것도 기록한다.** 성공만 적으면 언제부터 안 들어왔는지 모른다.
  if (body.error) {
    await prisma.collectionRun.create({
      data: { job: body.job, ok: false, startedAt, rows: 0, error: body.error.slice(0, 900) },
    });
    return NextResponse.json({ ok: true, logged: "error" });
  }

  try {
    if (body.prices?.length) {
      for (const p of body.prices) {
        // `fetchedAt` 을 **명시적으로** 쓴다. `@default(now())` 는 생성 때만 걸려서,
        // update 에서 빼면 시세가 영원히 stale 로 남는다 — 실제로 그렇게 짰다가 걸렸다.
        const at = new Date(p.at);
        await prisma.latestPrice.upsert({
          where: { symbol: p.symbol },
          create: {
            symbol: p.symbol,
            price: new Prisma.Decimal(p.price),
            at,
            fetchedAt: new Date(),
            source,
          },
          update: { price: new Prisma.Decimal(p.price), at, fetchedAt: new Date(), source },
        });
        rows += 1;
      }
    }

    if (body.candles?.length) {
      for (let i = 0; i < body.candles.length; i += 500) {
        const result = await prisma.candle.createMany({
          data: body.candles.slice(i, i + 500).map((c) => ({
            symbol: c.symbol,
            interval: c.interval,
            at: new Date(c.at),
            open: new Prisma.Decimal(c.open),
            high: new Prisma.Decimal(c.high),
            low: new Prisma.Decimal(c.low),
            close: new Prisma.Decimal(c.close),
            volume: new Prisma.Decimal(c.volume),
            source,
          })),
          skipDuplicates: true,
        });
        rows += result.count;
      }
    }

    if (body.funding?.length) {
      for (let i = 0; i < body.funding.length; i += 500) {
        const result = await prisma.funding.createMany({
          data: body.funding.slice(i, i + 500).map((f) => ({
            symbol: f.symbol,
            at: new Date(f.at),
            rate: new Prisma.Decimal(f.rate),
            source,
          })),
          skipDuplicates: true,
        });
        rows += result.count;
      }
    }

    if (body.whale?.length) {
      const result = await prisma.whalePosition.createMany({
        data: body.whale.map((w) => ({
          address: w.address,
          symbol: w.symbol,
          side: w.side,
          size: new Prisma.Decimal(w.size),
          at: new Date(w.at),
          source,
        })),
        skipDuplicates: true,
      });
      rows += result.count;
    }

    await prisma.collectionRun.create({
      data: {
        job: body.job,
        ok: true,
        startedAt,
        rows,
        ...(body.detail ? { detail: body.detail as Prisma.InputJsonValue } : {}),
      },
    });

    return NextResponse.json({ ok: true, job: body.job, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.collectionRun.create({
      data: { job: body.job, ok: false, startedAt, rows, error: message.slice(0, 900) },
    });
    return NextResponse.json({ error: "write_failed", message }, { status: 500 });
  }
}
