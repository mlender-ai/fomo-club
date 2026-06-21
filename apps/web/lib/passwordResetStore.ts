import { createHash } from "crypto";

/**
 * 임시 인메모리 비밀번호 재설정 토큰 저장소.
 * TODO: 프로덕션 배포 전 `PasswordResetToken` Prisma 모델로 교체.
 * 필요 스키마:
 *   model PasswordResetToken {
 *     id        String    @id @default(cuid())
 *     email     String
 *     tokenHash String    @unique
 *     expiresAt DateTime
 *     usedAt    DateTime?
 *     createdAt DateTime  @default(now())
 *   }
 */

export interface ResetTokenEntry {
  email: string;
  expiresAt: number;
  used: boolean;
}

/** 원문 토큰은 메모리에도 보관하지 않는다. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// key는 원문 토큰이 아니라 SHA-256 digest다.
export const tokenStore = new Map<string, ResetTokenEntry>();
