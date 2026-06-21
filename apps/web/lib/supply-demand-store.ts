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
