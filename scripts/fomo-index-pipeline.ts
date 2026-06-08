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
  fetchCommunity,
  whaleEventsFromCrypto,
  type EmotionTally,
  type EmotionType,
  type CommunitySourceSignal,
  type WhaleEvent,
  type CryptoSignals,
} from "@fomo/core";
import { writeFileSync } from "node:fs";

/** CoinGecko 공개 API에서 24h 변동(글로벌 시총 + 상위 코인)을 가져온다(실패 시 빈 신호). */
async function fetchCrypto(): Promise<CryptoSignals> {
  try {
    const [g, m] = await Promise.all([
      fetch("https://api.coingecko.com/api/v3/global"),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h",
      ),
    ]);
    let marketCapChangePct: number | undefined;
    if (g.ok) {
      const gj = (await g.json()) as { data?: { market_cap_change_percentage_24h_usd?: number } };
      marketCapChangePct = gj.data?.market_cap_change_percentage_24h_usd;
    }
    let coins: CryptoSignals["coins"] = [];
    if (m.ok) {
      const mj = (await m.json()) as { symbol: string; price_change_percentage_24h: number | null }[];
      coins = mj
        .filter((c) => c.price_change_percentage_24h != null)
        .map((c) => ({ symbol: c.symbol.toUpperCase(), change24h: c.price_change_percentage_24h as number }));
    }
    return { coins, marketCapChangePct };
  } catch {
    return { coins: [] };
  }
}

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

  // 1.5 라이브 소스 — Community(다중 프로바이더: Reddit 라이브 + 확장 스텁) + Whale(CoinGecko).
  //     실패는 빈 값으로 degrade(정직한 폴백). Market 은 무료 실시간 소스 부재로 폴백 유지.
  let communitySignals: CommunitySourceSignal[] = [];
  try {
    const c = await fetchCommunity();
    communitySignals = c.sources;
    process.stdout.write(
      `community: ${c.providersAvailable}/${c.providersEnabled} provider 가용(등록 ${c.providersTotal}) · 시그널 ${c.sources.length}건\n`,
    );
  } catch (err) {
    process.stderr.write(`community 수집 실패(폴백): ${String(err)}\n`);
  }

  let whaleEvents: WhaleEvent[] = [];
  try {
    whaleEvents = whaleEventsFromCrypto(await fetchCrypto());
    process.stdout.write(`whale: 이벤트 ${whaleEvents.length}건\n`);
  } catch (err) {
    process.stderr.write(`whale(coingecko) 수집 실패(폴백): ${String(err)}\n`);
  }

  // 2. FOMO Index 산출 (Market 은 무료 소스 부재로 폴백 유지 — 정직)
  const index = computeFomoIndex(
    { emotion: tally, community: { sources: communitySignals }, whale: whaleEvents },
    date,
  );
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
