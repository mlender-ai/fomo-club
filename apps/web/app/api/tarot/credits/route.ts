import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tarot/auth";
import { getCreditBalance } from "@/lib/tarot/credits";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const credits = await getCreditBalance(auth.userId);
  return NextResponse.json({ userId: auth.userId, credits });
}
