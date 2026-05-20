import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-jwt";
import { readTickerLogosConfig, writeTickerLogosConfig } from "@/lib/tarot/tickerLogosConfig";

export const dynamic = "force-dynamic";

async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

// GET — 전체 오버라이드 목록 반환
export async function GET() {
  const err = await requireAdminSession();
  if (err) return err;

  const config = readTickerLogosConfig();
  return NextResponse.json(config);
}

// PUT — ticker→url 오버라이드 추가/수정
export async function PUT(req: NextRequest) {
  const err = await requireAdminSession();
  if (err) return err;

  const body = (await req.json().catch(() => null)) as { ticker?: string; url?: string } | null;
  if (!body?.ticker || !body?.url) {
    return NextResponse.json({ error: "ticker and url required" }, { status: 400 });
  }

  const ticker = body.ticker.toUpperCase();
  const url = body.url.trim();

  // 간단한 URL 검증
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const config = readTickerLogosConfig();
  config.overrides[ticker] = url;
  writeTickerLogosConfig(config);

  return NextResponse.json({ ok: true, ticker, url });
}

// DELETE — 오버라이드 삭제 (auto-resolve로 복귀)
export async function DELETE(req: NextRequest) {
  const err = await requireAdminSession();
  if (err) return err;

  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker query param required" }, { status: 400 });

  const config = readTickerLogosConfig();
  delete config.overrides[ticker];
  writeTickerLogosConfig(config);

  return NextResponse.json({ ok: true, ticker });
}
