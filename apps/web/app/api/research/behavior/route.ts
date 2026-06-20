import { NextRequest, NextResponse } from "next/server";

import { RESEARCH_BEHAVIOR_EVENT_LABELS, type ResearchBehaviorEventName } from "@fomo/shared/src/research";
import { readResearchBehaviorSummary, recordResearchBehaviorEvent } from "@fomo/shared/src/researchBehaviorStore";

export const dynamic = "force-dynamic";

function isBehaviorEventName(value: string): value is ResearchBehaviorEventName {
  return value in RESEARCH_BEHAVIOR_EVENT_LABELS;
}

export async function GET() {
  const summary = await readResearchBehaviorSummary();
  return NextResponse.json(summary);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as { eventName?: string; value?: string | null };

  if (!payload.eventName || !isBehaviorEventName(payload.eventName)) {
    return NextResponse.json({ error: "Invalid behavior event name." }, { status: 400 });
  }

  const summary = await recordResearchBehaviorEvent(payload.eventName, payload.value);
  return NextResponse.json(summary);
}
