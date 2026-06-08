/**
 * FOMO Index 일일 산출 파이프라인.
 * 당일 감정 투표 집계 + (향후) 시장/소셜/웨일 신호 → FOMO Index 스냅샷 저장.
 * docs/FOMO_INDEX.md. Phase 2: market/community/whale은 안전한 중립 폴백,
 * emotion만 실제 집계. 라이브 소스 연동은 후속.
 *
 * DATABASE_URL 없으면 계산만 하고 로그(드라이런). 절대 에러로 죽지 않는다.
 */
import {
  computeFomoIndex,
  buildSummary,
  summarizeHealth,
  renderHealthReport,
  type EmotionTally,
  type EmotionType,
} from "@fomo/core";
import { writeFileSync } from "node:fs";

/** Asia/Seoul 기준 YYYY-MM-DD. */
function kstDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  // en-CA 로케일은 YYYY-MM-DD 형식
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

async function loadPrisma() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const mod = await import("../apps/web/lib/tarot/prisma");
    return mod.prisma;
  } catch (err) {
    process.stderr.write(`prisma load 실패(드라이런 진행): ${String(err)}\n`);
    return null;
  }
}

async function main() {
  const date = kstDate(0);
  const prisma = await loadPrisma();

  // 1. 당일 감정 투표 집계
  let tally: EmotionTally = {};
  if (prisma) {
    try {
      const rows = await prisma.emotionVote.groupBy({
        by: ["emotion"],
        where: { votedDate: date },
        _count: { _all: true },
      });
      tally = rows.reduce<EmotionTally>((acc, r) => {
        acc[r.emotion as EmotionType] = r._count._all;
        return acc;
      }, {});
    } catch (err) {
      process.stderr.write(`감정 집계 실패(중립 폴백): ${String(err)}\n`);
    }
  }

  // 2. FOMO Index 산출 (market/community/whale은 Phase 2 중립 폴백)
  const index = computeFomoIndex({ emotion: tally }, date);
  const aiSummary = buildSummary(index, tally);

  // 3. 전일/30일 평균 대비
  let prevDayDelta = 0;
  let avg30Delta = 0;
  if (prisma) {
    try {
      const prev = await prisma.fomoIndexSnapshot.findUnique({ where: { date: kstDate(-1) } });
      if (prev) prevDayDelta = index.score - prev.score;
      const recent = await prisma.fomoIndexSnapshot.findMany({
        orderBy: { date: "desc" },
        take: 30,
      });
      if (recent.length > 0) {
        const avg = recent.reduce((a, s) => a + s.score, 0) / recent.length;
        avg30Delta = Math.round(index.score - avg);
      }
    } catch (err) {
      process.stderr.write(`델타 계산 실패(0 폴백): ${String(err)}\n`);
    }
  }

  const heat = (key: string) => index.components.find((c) => c.key === key)?.score ?? 0;
  const record = {
    date,
    score: index.score,
    state: index.state,
    marketHeat: heat("market"),
    communityHeat: heat("community"),
    emotionHeat: heat("emotion"),
    whaleHeat: heat("whale"),
    aiSummary,
    insights: [] as unknown,
    prevDayDelta,
    avg30Delta,
  };

  // 4. 저장 (upsert) 또는 드라이런 로그
  if (prisma) {
    try {
      await prisma.fomoIndexSnapshot.upsert({
        where: { date },
        create: { ...record, insights: record.insights as object },
        update: { ...record, insights: record.insights as object },
      });
      process.stdout.write(`saved date=${date} score=${index.score} state=${index.state}\n`);
    } catch (err) {
      process.stderr.write(`스냅샷 저장 실패: ${String(err)}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stdout.write(
      `[dry-run] date=${date} score=${index.score} state=${index.state} summary=${aiSummary}\n`
    );
  }

  // 5. 운영 관측 — 건강 요약(정직한 숫자: 실데이터 vs 폴백) 산출 + 파일 기록.
  //    워크플로가 이 파일을 읽어 Slack 에 푸시하고 저하/실패를 가시화한다.
  const voteCount = Object.values(tally).reduce((a, n) => a + (n ?? 0), 0);
  const health = summarizeHealth(index, voteCount);
  try {
    writeFileSync("fomo-index-health.json", JSON.stringify(health), "utf8");
  } catch (err) {
    process.stderr.write(`건강 리포트 기록 실패(무시): ${String(err)}\n`);
  }
  process.stdout.write(renderHealthReport(health) + "\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
