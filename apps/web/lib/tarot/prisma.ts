import { PrismaClient } from "@prisma/client";

declare global {
  var __tarotPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__tarotPrisma ??
  new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.__tarotPrisma = prisma;
}
