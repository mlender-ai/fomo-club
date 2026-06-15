import { NextResponse } from "next/server";
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

// 버그1(깜빡임) 수정: understandTheme 는 LLM 이라 비결정적 → 매 요청 재산출 시 강세/약세가 들쭉날쭉.
// 같은 KST 날짜 동안 한 번 뽑은 결과를 **그날 끝까지 고정**(date 키). 강력 새로고침(클라 no-cache)도
// 서버 캐시는 유지 → 같은 카드는 그날 같은 강세/약세. (LLM 호출 방식·프롬프트는 불변 — 캐시 레이어만.)
// 한계: 서버리스 인스턴스별 메모리라 콜드스타트/다중 인스턴스에선 재산출 가능 — 완전 고정은 스냅샷(DDL) 후속.
const cache = new Map<string, { date: string; payload: CondensedInsight }>();
const inflight = new Map<string, Promise<CondensedInsight>>();

async function getInsight(theme: string): Promise<CondensedInsight> {
  const today = kstDate();
  const hit = cache.get(theme);
  if (hit && hit.date === today) return hit.payload; // 그날 안에선 고정

  const running = inflight.get(theme);
  if (running) return running;

  const p = (async () => {
    const condensed = condenseThemeInsight(await understandTheme(theme));
    cache.set(theme, { date: today, payload: condensed });
    return condensed;
  })().finally(() => inflight.delete(theme));

  inflight.set(theme, p);
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
