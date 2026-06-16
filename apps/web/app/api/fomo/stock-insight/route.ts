import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
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

// 성능(PERF LOADING HANDOFF §1·§2): understandStock 은 종목별 LLM 이라 더 느릴 수 있다.
// theme-insight 와 동일 정책 — Vercel Data Cache(unstable_cache)로 영속화해 (KST날짜,종목)당 한 번만 LLM.
// 인스턴스 무관·DDL 불필요. date 를 키에 넣어 그날 고정 + 익일 자동 새 키. inflight 로 인스턴스 내 dedup.
const inflight = new Map<string, Promise<CondensedInsight>>();

async function getInsight(stock: string): Promise<CondensedInsight> {
  const today = kstDate();
  const key = `${today}:${stock}`;
  const running = inflight.get(key);
  if (running) return running;

  const load = unstable_cache(
    async () => condenseThemeInsight(await understandStock(stock)),
    ["fomo-stock-insight", today, stock],
    { revalidate: 86400 }
  );

  const p = load().finally(() => inflight.delete(key));
  inflight.set(key, p);
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
