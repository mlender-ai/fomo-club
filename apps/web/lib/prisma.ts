import { PrismaClient } from "@prisma/client";

function applyConnectionLimit(): void {
  const limit = process.env.PRISMA_CONNECTION_LIMIT;
  const databaseUrl = process.env.DATABASE_URL;
  if (!limit || !databaseUrl) return;

  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", limit);
      process.env.DATABASE_URL = url.toString();
    }
  } catch (err) {
    console.warn("[prisma] PRISMA_CONNECTION_LIMIT ignored", err instanceof Error ? err.message : String(err));
  }
}

applyConnectionLimit();

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
