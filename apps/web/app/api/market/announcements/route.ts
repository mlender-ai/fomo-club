import { NextRequest, NextResponse } from "next/server";
import { type Announcement, deduplicateByTitle, sortByDateDesc } from "./utils";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15분 — 공시는 실시간 갱신 불필요

interface CacheEntry {
  data: Announcement[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json({ items: hit.data.slice(0, limit) });
  }

  // 실제 외부 API 연동 전 단계: 빈 배열 반환 + 캐시에 저장 (연동 후 여기를 교체)
  const items: Announcement[] = [];

  try {
    // TODO: DART(한국) 또는 SEC EDGAR(미국) API 연동으로 교체
    // 현재는 빈 배열 반환 — 연동 전 UI·테스트 인프라만 구축
  } catch (err) {
    console.warn("[announcements] fetch error:", err instanceof Error ? err.message : err);
  }

  const deduplicated = sortByDateDesc(deduplicateByTitle(items));
  cache.set(symbol, { data: deduplicated, expiresAt: now + CACHE_TTL_MS });

  return NextResponse.json({ items: deduplicated.slice(0, limit) });
}
