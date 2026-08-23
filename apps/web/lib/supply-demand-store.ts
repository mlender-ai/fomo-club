import type { InvestorFlow } from "@fomo/core";
import { prisma } from "./prisma";

/**
 * 수급 누적 저장/조회 — SupplyDemandDaily. SUPPLY DEMAND SCORE HANDOFF §2(기준선 씨앗).
 *
 * db push 게이트: 테이블이 아직 prod 에 없을 수 있다(운영 규약 — DDL 직접 승인).
 *   그 동안에도 cron/라우트가 죽지 않게, 읽기·쓰기 모두 실패하면 조용히 폴백(null/0)한다.
 *   테이블이 생기면 자동 활성화(코드 변경 불필요).
 */

/** flows 를 (ticker,date) unique 로 upsert. 저장 건수 반환. 테이블 미생성이면 0(중단). */
export async function writeSupplyDemand(
  ticker: string,
  flows: readonly InvestorFlow[]
): Promise<number> {
  let n = 0;
  for (const f of flows) {
    try {
      await prisma.supplyDemandDaily.upsert({
        where: { ticker_date: { ticker, date: f.date } },
        create: {
          ticker,
          date: f.date,
          foreignNet: f.foreignNet,
          institutionNet: f.institutionNet,
          individualNet: f.individualNet ?? null,
        },
        update: {
          foreignNet: f.foreignNet,
          institutionNet: f.institutionNet,
          individualNet: f.individualNet ?? null,
        },
      });
      n++;
    } catch (err) {
      // 테이블 미생성(P2021) 등 — 조용히 폴백. 누적은 테이블 생기면 시작된다.
      console.warn("[supply-demand-store] write skipped (table missing?)", (err as Error)?.message);
      return n;
    }
  }
  return n;
}

/** 한 종목의 가장 최근(장마감 확정) 수급. 없거나 테이블 미생성이면 null(정직한 폴백). */
export async function readLatestSupplyDemand(ticker: string): Promise<InvestorFlow | null> {
  try {
    const row = await prisma.supplyDemandDaily.findFirst({
      where: { ticker },
      orderBy: { date: "desc" },
    });
    if (!row) return null;
    return {
      date: row.date,
      foreignNet: row.foreignNet,
      institutionNet: row.institutionNet,
      ...(row.individualNet != null ? { individualNet: row.individualNet } : {}),
    };
  } catch (err) {
    console.warn("[supply-demand-store] read skipped (table missing?)", (err as Error)?.message);
    return null;
  }
}

/** 여러 종목의 최신 수급을 한 번에 조회. 키워드 파이프라인에서 DB 세션 폭주를 막기 위한 배치 경로. */
export async function readLatestSupplyDemandByTickers(
  tickers: readonly string[]
): Promise<Record<string, InvestorFlow>> {
  const unique = Array.from(new Set(tickers.filter(Boolean)));
  if (unique.length === 0) return {};

  try {
    const rows = await prisma.supplyDemandDaily.findMany({
      where: { ticker: { in: unique } },
      orderBy: [{ ticker: "asc" }, { date: "desc" }],
    });

    const out: Record<string, InvestorFlow> = {};
    for (const row of rows) {
      if (out[row.ticker]) continue;
      out[row.ticker] = {
        date: row.date,
        foreignNet: row.foreignNet,
        institutionNet: row.institutionNet,
        ...(row.individualNet != null ? { individualNet: row.individualNet } : {}),
      };
    }
    return out;
  } catch (err) {
    console.warn("[supply-demand-store] batch read skipped (table missing?)", (err as Error)?.message);
    return {};
  }
}

/** 한 종목의 최근 N거래일 수급(최신순). 연속 순매수/순매도(streak) 계산용. 테이블 미생성이면 빈 배열. */
export async function readSupplyDemandHistory(
  ticker: string,
  days = 20
): Promise<InvestorFlow[]> {
  try {
    const rows = await prisma.supplyDemandDaily.findMany({
      where: { ticker },
      orderBy: { date: "desc" },
      take: Math.max(1, Math.min(days, 60)),
    });
    return rows.map((row) => ({
      date: row.date,
      foreignNet: row.foreignNet,
      institutionNet: row.institutionNet,
      ...(row.individualNet != null ? { individualNet: row.individualNet } : {}),
    }));
  } catch (err) {
    console.warn("[supply-demand-store] history read skipped (table missing?)", (err as Error)?.message);
    return [];
  }
}

/**
 * 오류를 삼키지 않는 배치 조회.
 *
 * `readSupplyDemandHistoryByTickers` 는 "수급 이력이 없다" 와 "DB 조회가 실패했다" 를
 * **똑같이 빈 객체로** 준다. 발행 파이프라인이 그 빈 객체를 "오늘은 신호가 없는 날" 로
 * 번역하면 장애가 정상 상태로 위장된다.
 *
 * 2026-08-23 빈 덱 사고가 정확히 이것이었다(`docs/STATUS.md` §12): 커넥션 풀이 마르자
 * (`FATAL: (EMAXCONNSESSION) pool_size: 15`) 이 함수가 `{}` 를 돌려주고 → `krWithSignal: 0`
 * → `published: 0` 이 되어, `qualification` 에는 **평범한 0** 이 찍힌 채 빈 페이로드가
 * 정규 도메인에 발행됐다. 숫자만 보면 조용한 날과 구별할 방법이 없었다.
 *
 * `feed-content-store.readFeedContentStrict` 와 같은 규약이다 — 삼킴 자체가 죄는 아니고,
 * 삼킨 것을 사용자에게 "신호 없음" 이라고 **말하는** 호출자만 이 함수를 쓴다.
 */
export async function readSupplyDemandHistoryByTickersStrict(
  tickers: readonly string[],
  days = 10
): Promise<Record<string, InvestorFlow[]>> {
  if (!process.env.DATABASE_URL) return {};
  const unique = Array.from(new Set(tickers.filter(Boolean)));
  if (unique.length === 0) return {};
  const take = Math.max(1, Math.min(days, 60));

  const rows = await prisma.supplyDemandDaily.findMany({
    where: { ticker: { in: unique } },
    orderBy: [{ ticker: "asc" }, { date: "desc" }],
  });

  const out: Record<string, InvestorFlow[]> = {};
  for (const row of rows) {
    const current = out[row.ticker] ?? [];
    if (current.length >= take) continue;
    current.push({
      date: row.date,
      foreignNet: row.foreignNet,
      institutionNet: row.institutionNet,
      ...(row.individualNet != null ? { individualNet: row.individualNet } : {}),
    });
    out[row.ticker] = current;
  }
  return out;
}

/** 여러 종목의 최근 N거래일 수급을 한 번에 조회. 발견 덱에서 카드별 DB 왕복을 막기 위한 배치 경로. */
export async function readSupplyDemandHistoryByTickers(
  tickers: readonly string[],
  days = 10
): Promise<Record<string, InvestorFlow[]>> {
  try {
    return await readSupplyDemandHistoryByTickersStrict(tickers, days);
  } catch (err) {
    console.warn("[supply-demand-store] batch history read skipped (table missing?)", (err as Error)?.message);
    return {};
  }
}
