import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const allowedFields = [
      "nameKo",
      "meaningUpright",
      "meaningReversed",
      "toneGuide",
      "imageUrl",
      "status",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update", code: "INVALID_FIELDS" },
        { status: 400 }
      );
    }

    const card = await prisma.tarotCard.update({
      where: { id: params.id },
      data: updateData,
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
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const card = await prisma.tarotCard.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { drawHistoryCards: true } },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: "Card not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fetch failed", code: "FETCH_FAILED" },
      { status: 500 }
    );
  }
}
