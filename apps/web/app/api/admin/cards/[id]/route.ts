import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminApi } from "../../../../../lib/admin-auth-api";
import { writeAuditLog, getRequestMeta } from "../../../../../lib/admin-audit";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const body = await request.json() as Record<string, unknown>;
    const allowedFields = [
      "nameKo", "keywordsKo", "meaningUpright",
      "meaningReversed", "toneGuide", "imageUrl", "status",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update", code: "INVALID_FIELDS" },
        { status: 400 }
      );
    }

    // 변경 전 값 스냅샷
    const before = await prisma.tarotCard.findUnique({ where: { id: params.id } });
    const card = await prisma.tarotCard.update({ where: { id: params.id }, data: updateData });

    const { ip, userAgent } = getRequestMeta(request);
    await writeAuditLog({
      action: updateData.status !== undefined && Object.keys(updateData).length === 1
        ? "card.status_toggle"
        : "card.update",
      targetId: params.id,
      targetType: "TarotCard",
      before,
      after: updateData,
      ip,
      userAgent,
    });

    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed", code: "UPDATE_FAILED" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const card = await prisma.tarotCard.findUnique({
      where: { id: params.id },
      include: { _count: { select: { drawHistoryCards: true } } },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fetch failed", code: "FETCH_FAILED" },
      { status: 500 }
    );
  }
}
