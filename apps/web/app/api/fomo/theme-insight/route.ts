import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { condenseThemeInsight, type CondensedInsight } from "@fomo/core";
import { withCors, kstDate } from "../../../../lib/fomo";
import { understandTheme } from "../../../../lib/theme-understanding";

/**
 * 테마 이해·응축 API — DATA_ENGINE_STRATEGY Track A+B. 뎁스 페이지가 카드 탭 시 lazy 로 부른다.
 *
 * understandTheme(A: 원문 읽고 grounded 구조화) → condenseThemeInsight(B: 한 카드 분량 결정론적 응축).
 * 메인 피드(/api/fomo/keywords)는 안 건드린다 — 무겁기 때문(LLM+종토 fetch)에 *탭할 때만* 산출.
 *
 * 정직성: AI 미설정·원문 부족 → confidence:"insufficient"(가짜 응축 금지). 뎁스는 그때 기존 소스로 폴백.
 */
export const dynamic = "force-dynamic";
// 원문 수집 + LLM 이해가 수십 초 걸릴 수 있어 데드라인 넉넉히.
export const maxDuration = 60;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// 성능(PERF LOADING HANDOFF §1·§2): understandTheme 는 LLM+원문 fetch 라 20~30초.
// 인스턴스 메모리 Map 은 Vercel 서버리스 콜드/다중 인스턴스에서 미스 잦아 매번 재산출됐다.
// → Vercel Data Cache(unstable_cache)로 영속화: 인스턴스 무관, 같은 (KST날짜,테마)면 한 번만 LLM,
//   이후 모든 인스턴스가 즉시 읽기(warm 즉시). DDL/외부 KV 불필요(빌트인).
// date 를 캐시 키에 넣어 "그날 고정"(깜빡임 방지) + 익일 자동 새 키. revalidate 24h(키가 매일 바뀌므로 상한일 뿐).
// inflight: 한 인스턴스 내 동시 요청이 cold 산출을 중복 호출하지 않게 dedup.
const inflight = new Map<string, Promise<CondensedInsight>>();

async function getInsight(theme: string): Promise<CondensedInsight> {
  const today = kstDate();
  const key = `${today}:${theme}`;
  const running = inflight.get(key);
  if (running) return running;

  const load = unstable_cache(
    async () => condenseThemeInsight(await understandTheme(theme)),
    ["fomo-theme-insight", today, theme],
    { revalidate: 86400 }
  );

  const p = load().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function GET(req: Request) {
  const theme = new URL(req.url).searchParams.get("theme")?.trim();
  if (!theme) {
    return withCors(NextResponse.json({ error: "theme required" }, { status: 400 }));
  }
  const payload = await getInsight(theme);
  return withCors(
    NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    })
  );
}
