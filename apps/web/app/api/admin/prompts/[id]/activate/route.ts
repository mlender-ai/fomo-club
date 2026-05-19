import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { requireAdminApi } from "../../../../../../lib/admin-auth-api";
import { writeAuditLog, getRequestMeta } from "../../../../../../lib/admin-audit";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const before = await prisma.tarotPromptVersion.findFirst({ where: { isActive: true } });

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

    const { ip, userAgent } = getRequestMeta(request);
    await writeAuditLog({
      action: "prompt.activate",
      targetId: params.id,
      targetType: "TarotPromptVersion",
      before: before ? { id: before.id, version: before.version } : null,
      after: { id: params.id },
      ip,
      userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Activation failed", code: "ACTIVATION_FAILED" },
      { status: 500 }
    );
  }
}
