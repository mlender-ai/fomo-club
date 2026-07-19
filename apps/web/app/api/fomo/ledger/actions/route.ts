import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";
import {
  appendUserAction,
  userLedgerActor,
  type LedgerAsset,
  type LedgerSubject,
} from "@/lib/judgment-ledger";
import { corsJson, withCors } from "@/lib/fomo";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const ACTIONS = new Set(["seen", "pass", "star", "depth"] as const);
const ASSETS = new Set(["kr-stock", "us-stock", "coin", "macro"] as const);
const MAX_SESSION_LEN = 128;
const MAX_CANONICAL_LEN = 100;
const MAX_BATCH = 80;

interface ActionBodyEntry {
  action?: string;
  occurredAt?: string | number;
  subject?: { asset?: string; canonical?: string; symbol?: string };
  priceAt?: number;
  details?: Record<string, unknown>;
  imported?: boolean;
}

interface ActionBody extends ActionBodyEntry {
  sessionId?: string;
  entries?: ActionBodyEntry[];
}

function parsedEntry(value: ActionBodyEntry): {
  action: "seen" | "pass" | "star" | "depth";
  occurredAt: Date;
  subject: LedgerSubject;
  priceAt: number;
  details: Record<string, unknown>;
  imported: boolean;
} | null {
  if (!ACTIONS.has(value.action as "seen" | "pass" | "star" | "depth")) return null;
  const canonical = value.subject?.canonical?.trim() ?? "";
  const asset = value.subject?.asset as LedgerAsset;
  if (!canonical || canonical.length > MAX_CANONICAL_LEN || !ASSETS.has(asset)) return null;
  if (!Number.isFinite(value.priceAt) || (value.priceAt ?? 0) <= 0) return null;
  const occurredAt = value.occurredAt ? new Date(value.occurredAt) : new Date();
  const now = Date.now();
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > now + 60_000 || occurredAt.getTime() < Date.UTC(2024, 0, 1)) {
    return null;
  }
  const rawDetails = value.details && typeof value.details === "object" && !Array.isArray(value.details) ? value.details : {};
  const details = Object.fromEntries(
    Object.entries(rawDetails)
      .filter(([key, item]) => key.length <= 40 && (["string", "number", "boolean"].includes(typeof item)))
      .slice(0, 16)
      .map(([key, item]) => [key, typeof item === "string" ? item.slice(0, 500) : item])
  );
  return {
    action: value.action as "seen" | "pass" | "star" | "depth",
    occurredAt,
    subject: {
      asset,
      canonical,
      ...(value.subject?.symbol?.trim() ? { symbol: value.subject.symbol.trim().slice(0, 24) } : {}),
    },
    priceAt: value.priceAt!,
    details,
    imported: value.imported === true,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as ActionBody;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (sessionId.length > MAX_SESSION_LEN) return corsJson({ error: "입력이 너무 깁니다" }, { status: 400 });
    const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
    const actor = userLedgerActor({ userId, sessionId });
    if (!actor) return corsJson({ error: "userId 또는 sessionId 필요" }, { status: 400 });

    const rawEntries = Array.isArray(body.entries) ? body.entries.slice(0, MAX_BATCH) : [body];
    const entries = rawEntries.map(parsedEntry);
    if (entries.some((entry) => !entry)) return corsJson({ error: "유효한 action·subject·priceAt 필요" }, { status: 400 });
    let appended = 0;
    for (const entry of entries as Array<NonNullable<ReturnType<typeof parsedEntry>>>) {
      appended += await appendUserAction({ actor, ...entry });
    }
    return corsJson({ ok: true, appended });
  } catch (error) {
    console.warn("[ledger/actions] append failed", error);
    return corsJson({ error: "판단 기록 실패" }, { status: 500 });
  }
}
