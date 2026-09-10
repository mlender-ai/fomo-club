import { NextResponse } from "next/server";
import { SECTORS, stocksBySector, type StockSector, type SectorStock } from "@fomo/core";
import { withCors } from "../../../../lib/fomo";

/**
 * 섹터 → 종목 풀 API — SECTOR_STRUCTURE_HANDOFF §2(종목 풀 연결, Stage ②).
 *
 * 순수 데이터(LLM·외부소스 0): 큐레이션된 STOCK_VOCAB 을 섹터로 묶어 노출 순서(콜드스타트 기본)로 돌려준다.
 * 카드 해석(이해 레이어)·baseline 은 스와이프가 그 종목에 *도달할 때* 각 종목 API 로 lazy 로 부른다(비용 방어).
 * 여기선 풀의 "바닥 목록"만 — 빈 카드 방지를 위해 baseline 보장(국내 상장)만 받고 싶으면 ?baseline=1.
 *
 * 개인화 정렬은 다음 트랙(seam 은 @fomo/core sortStocksForFeed 에 이미 열림) — 지금은 콜드스타트 순.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export interface SectorStocksResponse {
  sector: StockSector;
  /** 섹터 풀(콜드스타트 노출 순: 대표 대장주 먼저). 카드 해석은 도달 시 lazy. */
  stocks: SectorStock[];
}

function isSector(v: string): v is StockSector {
  return (SECTORS as readonly string[]).includes(v);
}

export function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("sector")?.trim() ?? "";
  if (!isSector(raw)) {
    return withCors(
      NextResponse.json(
        { error: "valid sector required", sectors: SECTORS },
        { status: 400 }
      )
    );
  }
  // baseline=1 이면 baseline 보장(국내 상장, naverCode 보유)만 — 무한 스와이프의 빈 카드 방지(§2 전제).
  const baselineOnly = new URL(req.url).searchParams.get("baseline") === "1";
  const stocks = stocksBySector(raw, baselineOnly ? { requireNaverCode: true } : {});
  const payload: SectorStocksResponse = { sector: raw, stocks };
  return withCors(
    NextResponse.json(payload, {
      // 풀 목록은 거의 정적(코드 기반) — 길게 캐시. 개인화 정렬 들어오면 그때 정책 조정.
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    })
  );
}
