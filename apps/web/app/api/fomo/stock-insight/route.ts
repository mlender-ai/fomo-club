import { NextResponse } from "next/server";
import { condenseThemeInsight, type CondensedInsight } from "@fomo/core";
import { withCors, kstDate } from "../../../../lib/fomo";
import { understandStock } from "../../../../lib/theme-understanding";

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

// 버그1(깜빡임) 수정: 같은 KST 날짜 동안 결과 고정(date 키). theme-insight 와 동일 정책.
const cache = new Map<string, { date: string; payload: CondensedInsight }>();
const inflight = new Map<string, Promise<CondensedInsight>>();

async function getInsight(stock: string): Promise<CondensedInsight> {
  const today = kstDate();
  const hit = cache.get(stock);
  if (hit && hit.date === today) return hit.payload;

  const running = inflight.get(stock);
  if (running) return running;

  const p = (async () => {
    const condensed = condenseThemeInsight(await understandStock(stock));
    cache.set(stock, { date: today, payload: condensed });
    return condensed;
  })().finally(() => inflight.delete(stock));

  inflight.set(stock, p);
  return p;
}

export async function GET(req: Request) {
  const stock = new URL(req.url).searchParams.get("stock")?.trim();
  if (!stock) {
    return withCors(NextResponse.json({ error: "stock required" }, { status: 400 }));
  }
  const payload = await getInsight(stock);
  return withCors(
    NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    })
  );
}
