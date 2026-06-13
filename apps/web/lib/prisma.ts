import { PrismaClient } from "@prisma/client";

// 공유 Prisma 클라이언트(단일 인스턴스). dev HMR에서 커넥션 폭증 방지용 globalThis 캐시.
declare global {
  // eslint-disable-next-line no-var
  var __fomoPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__fomoPrisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.__fomoPrisma = prisma;
}
