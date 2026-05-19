import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminApi } from "../../../../lib/admin-auth-api";
import { writeAuditLog, getRequestMeta } from "../../../../lib/admin-audit";

export async function GET(request: Request) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const prompts = await prisma.tarotPromptVersion.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(prompts);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fetch failed", code: "FETCH_FAILED" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const body = await request.json() as { version?: string; content?: string };
    const { version, content } = body;

    if (!version || !content) {
      return NextResponse.json(
        { error: "version and content are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const prompt = await prisma.tarotPromptVersion.create({
      data: { version, content, isActive: false, createdBy: "admin" },
    });

    const { ip, userAgent } = getRequestMeta(request);
    await writeAuditLog({
      action: "prompt.create",
      targetId: prompt.id,
      targetType: "TarotPromptVersion",
      after: { version },
      ip,
      userAgent,
    });

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed", code: "CREATE_FAILED" },
      { status: 500 }
    );
  }
}
