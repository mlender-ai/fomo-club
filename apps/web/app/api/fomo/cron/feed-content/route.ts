import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { writeFeedContent } from "../../../../../lib/feed-content-store";
import {
  buildBuzzStory,
  buildKrBriefing,
  buildKrMarketPulse,
  buildUsBriefing,
  buildWeeklyRecap,
  type FeedBriefingRow,
} from "../../../../../lib/feed-briefing";
import { processSearchQueue, rebuildSymbolIndex } from "../../../../../lib/symbol-index";
import { translateAndStoreUsTitles } from "../../../../../lib/content-i18n";
import { buildAndStoreWeeklyCalendar } from "../../../../../lib/earnings-calendar";
import { isAiConfigured } from "@fomo/shared";
import { fetchAllNews, fetchYahooStockNews } from "../../../../../lib/fomo-news-sources";
import { readUsMarketQuoteRows } from "../../../../../lib/us-market-cache";

/**
 * 피드 콘텐츠 프리웜 크론 (WO 피드 강화) — ?slot=morning|close|weekly
 * - morning: 간밤의 미장 브리핑
 * - close: 오늘의 국장 브리핑 + 버즈 스토리(언급 스냅샷 포함)
 * - weekly: "일주일 전에 샀으면" 주간 회고
 * LLM은 여기(크론)에서만 — 요청 경로는 캐시 읽기 전용. 빌드 후 daily-30 캐시 태그 무효화.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * US 덱 재료 기사 수집(WO-22) — 무버 상위 심볼별 Yahoo RSS 제목을 번역 캐시에 적재해
 * 발견 카드/뎁스 훅(koreanTitle)이 영어 원문으로 떨어지지 않게 한다. 실패는 [](fail-open).
 */
const US_DECK_I18N_SYMBOLS = 25;
const US_DECK_I18N_PER_SYMBOL = 3;
const US_DECK_I18N_CONCURRENCY = 6;

async function fetchUsDeckArticles(): Promise<Array<{ url: string; title: string; lang?: string }>> {
  const rows = await readUsMarketQuoteRows().catch(() => []);
  const symbols = rows
    .filter((row) => typeof row.changePct === "number")
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
    .slice(0, US_DECK_I18N_SYMBOLS)
    .map((row) => row.symbol);
  const out: Array<{ url: string; title: string; lang?: string }> = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= symbols.length) return;
      const articles = await fetchYahooStockNews(symbols[index]!, US_DECK_I18N_PER_SYMBOL).catch(() => []);
      for (const a of articles) out.push({ url: a.url, title: a.title, lang: a.lang });
    }
  }
  await Promise.all(Array.from({ length: US_DECK_I18N_CONCURRENCY }, () => worker()));
  return out;
}

function isoWeekOf(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const slot = new URL(request.url).searchParams.get("slot") ?? "";
  const startedAt = Date.now();
  const date = kstDate();
  const written: string[] = [];
  try {
    const save = async (id: string, row: FeedBriefingRow | null) => {
      if (!row) return;
      await writeFeedContent(id, row);
      written.push(id);
    };
    if (slot === "index") {
      // 심볼 마스터 인덱스 재구축(일 1회) + 검색 알림 신청 큐 처리(WO 검색 ①·④).
      const stats = await rebuildSymbolIndex();
      const queue = await processSearchQueue();
      // 주간 판단 캘린더(2026-07-15) — Nasdaq 어닝 7일치 + 매크로 일정 프리웜.
      const calendar = await buildAndStoreWeeklyCalendar().catch(() => null);
      revalidateTag("daily-30", { expire: 0 });
      revalidateTag("feed-hub", { expire: 0 });
      return withCors(
        NextResponse.json(
          { ok: true, slot, index: stats, queue, calendarDays: calendar?.days.length ?? null, elapsedMs: Date.now() - startedAt },
          { headers: { "Cache-Control": "no-store" } }
        )
      );
    }
    if (slot === "morning") {
      await save(`briefing:us:${date}`, await buildUsBriefing());
      const news = await fetchAllNews().catch(() => []);
      const usDeck = await fetchUsDeckArticles().catch(() => []);
      // 덱 훅 제목이 우선(가시 표면) — 번역 상한(MAX_TITLES_PER_RUN)에 걸려도 덱부터 채운다.
      const translated = await translateAndStoreUsTitles([...usDeck, ...news]).catch(() => 0);
      written.push(
        `ai=${isAiConfigured()} enNews=${news.filter((a) => (a.lang ?? "en") === "en").length} usDeck=${usDeck.length} translated=${translated}`
      );
    } else if (slot === "close") {
      const kr = await buildKrBriefing();
      if (kr) await save(`briefing:kr:${date}`, kr);
      else written.push("briefing:kr=skipped");
      await save(`buzz:${date}`, await buildBuzzStory());
      const usDeck = await fetchUsDeckArticles().catch(() => []);
      const translated = await translateAndStoreUsTitles([...usDeck, ...(await fetchAllNews().catch(() => []))]).catch(() => 0);
      written.push(`i18n:usDeck=${usDeck.length} translated=${translated}`);
    } else if (slot === "pulse") {
      // 장중 급변 감지(WO-21 Phase 1) — 임계 미달·휴장·스테일이면 아무것도 쓰지 않는다(결정론·LLM 없음).
      await save(`briefing:kr-pulse:${date}`, await buildKrMarketPulse());
    } else if (slot === "weekly") {
      await save(`recap:${isoWeekOf()}`, await buildWeeklyRecap());
    } else {
      return withCors(NextResponse.json({ ok: false, error: "slot must be morning|close|weekly|index|pulse" }, { status: 400 }));
    }
    // daily-30·feed-hub 서버 캐시 즉시 만료 — 다음 요청이 새 콘텐츠를 포함해 재빌드.
    revalidateTag("daily-30", { expire: 0 });
    revalidateTag("feed-hub", { expire: 0 });
    return withCors(
      NextResponse.json(
        { ok: true, slot, written, elapsedMs: Date.now() - startedAt },
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/cron/feed-content] failed", slot, (err as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, slot, written, error: (err as Error)?.message ?? "feed content failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
