import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type AuditAction =
  | "admin.login"
  | "admin.logout"
  | "admin.login_failed"
  | "card.update"
  | "card.status_toggle"
  | "prompt.create"
  | "prompt.activate"
  | "report.reviewed"
  | "report.resolved"
  | "session.invalidate_all";

export async function writeAuditLog({
  action,
  targetId,
  targetType,
  before,
  after,
  ip,
  userAgent,
}: {
  action: AuditAction;
  targetId?: string;
  targetType?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        action,
        targetId: targetId ?? null,
        targetType: targetType ?? null,
        before: before !== undefined ? (before as Prisma.InputJsonValue) : Prisma.DbNull,
        after: after !== undefined ? (after as Prisma.InputJsonValue) : Prisma.DbNull,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });
  } catch (err) {
    // 감사 로그 실패가 실제 작업을 막아서는 안 되지만 반드시 서버 로그에 남긴다
    console.error("[AuditLog] Failed to write audit log:", { action, err });
  }
}

export function getRequestMeta(request: Request): {
  ip: string;
  userAgent: string;
} {
  const headers = request.headers as Headers;
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded ? (forwarded.split(",")[0]?.trim() ?? "unknown") : "unknown";
  const userAgent = headers.get("user-agent") ?? "unknown";
  return { ip, userAgent };
}
