import { NextResponse } from "next/server";
import { isKrStockCode, krStockLogoUrl, stockLogoFallbackSvg, usStockLogoUrls } from "@/lib/stockLogo";

export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const TIMEOUT_MS = 3_500;

function svgResponse(svg: string): NextResponse {
  return new NextResponse(svg, {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Fomo-Logo-Source": "fallback",
    },
  });
}

/** 원본 로고 후보 1개 시도 — 이미지면 그대로 프록시, 아니면 null(다음 후보). */
async function tryUpstream(url: string, source: string): Promise<NextResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      cache: "force-cache",
      headers: {
        Accept: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "FOMO Club stock-logo proxy",
      },
      next: { revalidate: 604_800 },
      signal: controller.signal,
    });

    const contentType = upstream.headers.get("content-type") ?? "image/svg+xml";
    if (upstream.ok && contentType.toLowerCase().includes("image")) {
      const body = await upstream.arrayBuffer();
      if (body.byteLength > 0) {
        return new NextResponse(body, {
          headers: { "Cache-Control": CACHE_CONTROL, "Content-Type": contentType, "X-Fomo-Logo-Source": source },
        });
      }
    }
  } catch {
    // Fall through — 카드가 깨진 이미지를 보이지 않게 항상 폴백까지 간다.
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

/**
 * 종목 로고 프록시 — KR(네이버) + **US·해외(티커)** 모두 서버에서 받아 캐시한다.
 * 클라이언트가 외부 호스트를 직접 때리면 핫링크 차단·CORS·429 로 로고 자리가 비어 보인다
 * (US 로고가 안 채워지던 원인). 여기서 후보를 순서대로 시도하고, 전부 실패하면 이니셜 SVG.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim() ?? "";
  const symbol = searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const name = searchParams.get("name")?.trim().slice(0, 24) ?? "";

  if (isKrStockCode(code)) {
    return (await tryUpstream(krStockLogoUrl(code), "naver")) ?? svgResponse(stockLogoFallbackSvg({ code, name }));
  }

  if (/^[A-Z][A-Z.-]{0,5}$/.test(symbol)) {
    for (const candidate of usStockLogoUrls(symbol)) {
      const res = await tryUpstream(candidate.url, candidate.source);
      if (res) return res;
    }
    return svgResponse(stockLogoFallbackSvg({ code: symbol, name: name || symbol }));
  }

  return svgResponse(stockLogoFallbackSvg({ name }));
}
