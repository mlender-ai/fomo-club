import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { condenseThemeInsight, emptyThemeInsight, stockDef, supplyDemandFact, type CondensedInsight } from "@fomo/core";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { understandStock } from "../../../../lib/theme-understanding";
import { readLatestSupplyDemand } from "../../../../lib/supply-demand-store";

/**
 * 개별 종목 이해·응축 API — NEXT_FEATURES_HANDOFF 작업3(BM 심장). 읽기 전용.
 *
 * 테마 뎁스의 종목 라벨(삼성전자 등)을 탭하면 호출. understandStock(A 엔진 종목 단위) → condense(B).
 * 비용 통제: 탭한 종목만 산출 + 테마별 캐시(TTL). 무분별 전체 종목 생성 안 함.
 * 정직성: AI 미설정·원문 부족 → confidence:"insufficient"(가짜 생성 금지) — 화면은 "자료 아직 적어".
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// theme-insight 와 동일 정책 — (KST날짜, 종목) 키로 cold 를 하루 1회로. revalidate 6h(SWR — 대기 없이 갱신).
const REVALIDATE_S = 21_600; // 6h
const USER_WAIT_MS = 4_500;
const inflight = new Map<string, Promise<CondensedInsight>>();

async function getInsight(stock: string): Promise<CondensedInsight> {
  const today = kstDate();
  const key = `${today}:${stock}`;
  const running = inflight.get(key);
  if (running) return running;

  const load = unstable_cache(
    async () => condenseThemeInsight(await understandStock(stock)),
    ["fomo-stock-insight", cacheVersion(), today, stock],
    { revalidate: REVALIDATE_S }
  );

  const p = load().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function timeoutFallback(stock: string): CondensedInsight {
  return condenseThemeInsight(emptyThemeInsight(stock, "인사이트 캐시 준비 중 — 원문 근거가 아직 충분히 모이지 않았어요."));
}

async function getInsightForRequest(stock: string, blocking: boolean): Promise<{ payload: CondensedInsight; coldFallback: boolean }> {
  if (blocking) return { payload: await getInsight(stock), coldFallback: false };

  let timedOut = false;
  const timeout = new Promise<CondensedInsight>((resolve) => {
    windowlessSetTimeout(() => {
      timedOut = true;
      resolve(timeoutFallback(stock));
    }, USER_WAIT_MS);
  });
  const payload = await Promise.race([
    getInsight(stock).catch((err) => {
      console.warn("[stock-insight] getInsight failed", stock, (err as Error)?.message);
      return timeoutFallback(stock);
    }),
    timeout,
  ]);
  return { payload, coldFallback: timedOut || payload.confidence === "insufficient" };
}

function windowlessSetTimeout(fn: () => void, ms: number): void {
  setTimeout(fn, ms);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const stock = url.searchParams.get("stock")?.trim();
  if (!stock) {
    return withCors(NextResponse.json({ error: "stock required" }, { status: 400 }));
  }
  const blocking = url.searchParams.get("blocking") === "1" || req.headers.get("x-warm") === "1";
  const { payload, coldFallback } = await getInsightForRequest(stock, blocking);

  // 수급(외인·기관 장마감 확정) — 공식 지표 섹션에 객관 사실로 동봉(§4). 데이터 없으면 미표시(정직).
  // 캐시 밖에서 1회 조회(일별이라 가벼움). 테이블 전/미수집이면 null → 기존 응답 그대로.
  const code = stockDef(stock)?.naverCode;
  const flow = code ? await readLatestSupplyDemand(code) : null;
  const out = flow
    ? { ...payload, officialFacts: [supplyDemandFact(flow), ...(payload.officialFacts ?? [])] }
    : payload;

  return withCors(
    NextResponse.json(out, {
      headers: {
        "Cache-Control": coldFallback
          ? "public, s-maxage=30, stale-while-revalidate=120"
          : "public, s-maxage=900, stale-while-revalidate=1800",
      },
    })
  );
}
