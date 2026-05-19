import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminApi } from "../../../../../lib/admin-auth-api";
import { writeAuditLog, getRequestMeta } from "../../../../../lib/admin-audit";

const VALID_STATUSES = ["REVIEWED", "RESOLVED"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const body = await request.json() as { status?: string };
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json(
        { error: "status must be REVIEWED or RESOLVED", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }

    const report = await prisma.tarotReport.update({
      where: { id: params.id },
      data: { status: status as typeof VALID_STATUSES[number] },
    });

    const { ip, userAgent } = getRequestMeta(request);
    await writeAuditLog({
      action: status === "RESOLVED" ? "report.resolved" : "report.reviewed",
      targetId: params.id,
      targetType: "TarotReport",
      after: { status },
      ip,
      userAgent,
    });

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed", code: "UPDATE_FAILED" },
      { status: 500 }
    );
  }
}
