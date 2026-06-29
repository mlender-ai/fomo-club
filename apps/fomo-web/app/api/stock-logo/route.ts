import { NextResponse } from "next/server";
import { isKrStockCode, krStockLogoUrl, stockLogoFallbackSvg } from "@/lib/stockLogo";

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

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim() ?? "";
  const name = searchParams.get("name")?.trim().slice(0, 24) ?? "";

  if (!isKrStockCode(code)) {
    return svgResponse(stockLogoFallbackSvg({ name }));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(krStockLogoUrl(code), {
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
      return new NextResponse(body, {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": contentType,
          "X-Fomo-Logo-Source": "naver",
        },
      });
    }
  } catch {
    // Fall through to a deterministic local SVG so the card never shows a broken image.
  } finally {
    clearTimeout(timeout);
  }

  return svgResponse(stockLogoFallbackSvg({ code, name }));
}
