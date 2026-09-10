/**
 * FOMO Club 무외부서비스 제품 지표 대시보드.
 *
 * Usage: DATABASE_URL=... npm run metrics:fomo
 * TasteSignal만 읽으며 DB를 변경하지 않는다.
 */
import { PrismaClient } from "@prisma/client";
import { calculateProductMetrics, type TasteMetricSignal } from "./fomo-product-metrics-core";

function percent(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const signals = await prisma.tasteSignal.findMany({
      select: { userId: true, sessionId: true, signal: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const events = signals.flatMap((signal) => {
      const actorId = signal.userId ? `user:${signal.userId}` : signal.sessionId ? `session:${signal.sessionId}` : null;
      return actorId
        ? [{ actorId, signal: signal.signal as TasteMetricSignal, createdAt: signal.createdAt }]
        : [];
    });
    const metrics = calculateProductMetrics(events, new Date());

    process.stdout.write(`# FOMO product metrics — ${metrics.asOf}\n\n`);
    process.stdout.write(`| Metric | Value |\n|---|---:|\n`);
    process.stdout.write(`| Active actors (30d) | ${metrics.activeActors30d} |\n`);
    process.stdout.write(`| Engaged sessions (30d) | ${metrics.engagedSessions30d} |\n`);
    process.stdout.write(`| Swipes (30d) | ${metrics.swipes30d} |\n`);
    process.stdout.write(`| Depth views (30d) | ${metrics.depthViews30d} |\n`);
    process.stdout.write(`| Swipes / session | ${metrics.swipesPerSession ?? "N/A"} |\n`);
    process.stdout.write(`| Sessions with depth | ${percent(metrics.sessionsWithDepthRate.rate)} |\n`);
    process.stdout.write(`| D1 engaged retention | ${percent(metrics.d1EngagedRetention.rate)} |\n`);
    process.stdout.write(`| D7 engaged retention | ${percent(metrics.d7EngagedRetention.rate)} |\n`);
    process.stdout.write(`\n`);
    process.stdout.write(`> Scope: TasteSignal을 남긴 참여 사용자 기준. 순수 방문자는 포함하지 않음.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[metrics:fomo] failed", error);
  process.exitCode = 1;
});
