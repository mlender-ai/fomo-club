import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 트랜잭션: 모든 버전 비활성화 → 대상 버전 활성화
    await prisma.$transaction([
      prisma.tarotPromptVersion.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      }),
      prisma.tarotPromptVersion.update({
        where: { id: params.id },
        data: { isActive: true, activatedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Activation failed", code: "ACTIVATION_FAILED" },
      { status: 500 }
    );
  }
}
