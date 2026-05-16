import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
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
  try {
    const body = await request.json();
    const { version, content } = body;

    if (!version || !content) {
      return NextResponse.json(
        { error: "version and content are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const prompt = await prisma.tarotPromptVersion.create({
      data: {
        version,
        content,
        isActive: false,
        createdBy: "admin",
      },
    });

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed", code: "CREATE_FAILED" },
      { status: 500 }
    );
  }
}
