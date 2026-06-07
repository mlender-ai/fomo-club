/**
 * 임시 인메모리 비밀번호 재설정 토큰 저장소.
 * TODO: 프로덕션 배포 전 `PasswordResetToken` Prisma 모델로 교체.
 * 필요 스키마:
 *   model PasswordResetToken {
 *     id        String    @id @default(cuid())
 *     email     String
 *     token     String    @unique
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

export const tokenStore = new Map<string, ResetTokenEntry>();
