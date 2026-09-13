/**
 * LAB-03 PART C — 고래 포지션 (Hyperliquid). **FCE 이식.**
 *
 * ## 이식 출처와 결함 수정 이력
 *
 * FCE `b1c5211` (2026-09-11) 기준. 원본은
 * `backend/app/onchain/hyperliquid/{client,collector,leaderboard}.py`.
 *
 * | 커밋 | 날짜 | 무엇을 고쳤나 | 여기 반영 |
 * |---|---|---|---|
 * | `3eb5f15` | 2026-07-15 | 고래 발굴 자동화(최초) | 리더보드 → 지갑 후보 |
 * | `6bb0f1f` | 2026-07-16 | 발굴이 한쪽 방향으로 쏠리던 것 | 방향으로 거르지 않는다 — 롱·숏 다 담는다 |
 * | `c0e4805` | 2026-08-25 | **코호트 회전 결함**: 매 실행 재선발이 빠진 지갑을 비활성으로 내려 관측이 끊기고 표본이 안 자랐다. 그리고 **선발에서 성과 입력 제거**(생존 편향) | **코호트를 한 번만 정하고 유지한다.** 선발 기준은 계좌 규모뿐 — pnl·roi 를 쓰지 않는다 |
 *
 * ## 안 가져온 것
 *
 * FCE 의 `userFillsByTime` 기반 **체결 이벤트 분류**(open/flip/close)는 가져오지 않았다.
 * LAB-03 PART C 가 요구하는 것은 `주소 · 종목 · 방향 · 규모 · 시각` 스냅샷이고,
 * 체결 이벤트는 `LAB-04` 의 `whale_flow` 지표가 스냅샷 차분으로 낼 수 있다.
 * **필요해지면 그때 가져온다** — 지금 가져오면 쓰지 않는 코드가 는다.
 *
 *   npm run lab:whale
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { SOURCE_WHALE, SYMBOLS, WHALE_COHORT_SIZE, WHALE_MIN_SIZE_USD } from "./collect/config";
import { fetchHyperliquidLeaderboard, fetchHyperliquidPositions } from "./collect/sources";
import { finish, runJob, type JobResult } from "./collect/job";

const prisma = new PrismaClient();
const RESELECT = process.argv.includes("--reselect");

/**
 * 관측할 지갑 코호트를 정한다. **이미 정해져 있으면 그걸 쓴다.**
 *
 * FCE `c0e4805` 가 고친 결함이 이것이다 — 매 실행 리더보드에서 다시 뽑으면
 * 순위에서 밀린 지갑의 관측이 끊긴다. 그 지갑의 표본은 남지만 **자라지 않는다.**
 * 코호트를 바꿔야 할 때는 `--reselect` 로 명시한다.
 */
async function cohort(): Promise<string[]> {
  if (!RESELECT) {
    const known = await prisma.whalePosition.findMany({
      distinct: ["address"],
      select: { address: true },
      take: WHALE_COHORT_SIZE * 4,
    });
    if (known.length >= WHALE_COHORT_SIZE) {
      return known.slice(0, WHALE_COHORT_SIZE).map((r) => r.address);
    }
  }

  // 성과가 아니라 **계좌 규모**로 뽑는다. pnl·roi 로 뽑으면 생존 편향이 들어간다.
  const rows = await fetchHyperliquidLeaderboard();
  return rows
    .sort((a, b) => b.accountValue - a.accountValue)
    .slice(0, WHALE_COHORT_SIZE)
    .map((r) => r.address);
}

async function main(): Promise<void> {
  const outcome = await runJob(prisma, "whale", async (): Promise<JobResult> => {
    const addresses = await cohort();
    const at = new Date();
    const watched = new Set<string>(SYMBOLS);

    let rows = 0;
    let scanned = 0;
    let skippedSmall = 0;
    const errors: string[] = [];
    const bySymbol: Record<string, { long: number; short: number; usd: number }> = {};

    for (const address of addresses) {
      try {
        const positions = await fetchHyperliquidPositions(address);
        scanned += 1;
        for (const position of positions) {
          // 유니버스 밖 종목은 담지 않는다 — 지금 쓰지 않는 데이터다.
          if (!watched.has(position.symbol)) continue;
          if (position.sizeUsd < WHALE_MIN_SIZE_USD) {
            skippedSmall += 1;
            continue;
          }
          await prisma.whalePosition.upsert({
            where: {
              address_symbol_at: { address: position.address, symbol: position.symbol, at },
            },
            create: {
              address: position.address,
              symbol: position.symbol,
              side: position.side,
              size: new Prisma.Decimal(position.sizeUsd),
              at,
              source: SOURCE_WHALE,
            },
            update: { side: position.side, size: new Prisma.Decimal(position.sizeUsd) },
          });
          rows += 1;
          const bucket = (bySymbol[position.symbol] ??= { long: 0, short: 0, usd: 0 });
          if (position.side === "LONG") bucket.long += 1;
          else bucket.short += 1;
          bucket.usd += position.sizeUsd;
        }
      } catch (error) {
        errors.push(`${address.slice(0, 10)}…: ${String(error).slice(0, 80)}`);
      }
    }

    // 지갑 하나가 죽는 것은 정상이다. **전부 죽으면 수집이 실패한 것이다.**
    if (scanned === 0) {
      throw new Error(`지갑 ${addresses.length}개 전부 실패 — ${errors[0] ?? "사유 없음"}`);
    }

    return {
      rows,
      detail: {
        코호트: addresses.length,
        스캔성공: scanned,
        지갑실패: errors.length,
        작아서제외: skippedSmall,
        종목별: bySymbol,
        스냅샷: at.toISOString(),
      },
    };
  });
  await finish(prisma, outcome);
}

void main();
