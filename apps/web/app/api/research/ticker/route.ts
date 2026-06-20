import { NextRequest, NextResponse } from "next/server";

import { type ResearchSectorTag } from "@fomo/shared/src/research";
import { analyzeLiveTicker } from "@fomo/shared/src/researchLive";

import { parseResearchPreferences } from "../../../../lib/research";

export const dynamic = "force-dynamic";

function isSectorTag(value: string): value is ResearchSectorTag {
  return (
    value === "semiconductors" ||
    value === "energy-oil" ||
    value === "ai-infra" ||
    value === "industrial-tech" ||
    value === "ev-mobility" ||
    value === "battery-chain"
  );
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    ticker?: string;
    sectorTag?: string;
    preferences?: ReturnType<typeof parseResearchPreferences>;
  };
  const ticker = payload.ticker?.trim().toUpperCase();
  const sectorTag = payload.sectorTag;

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  if (!sectorTag || !isSectorTag(sectorTag)) {
    return NextResponse.json({ error: "valid sectorTag is required" }, { status: 400 });
  }

  const result = await analyzeLiveTicker(ticker, sectorTag, payload.preferences);
  return NextResponse.json(result);
}
