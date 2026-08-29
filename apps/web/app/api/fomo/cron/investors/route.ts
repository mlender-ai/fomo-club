import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import {
  INVESTORS,
  fetchArkSnapshot,
  fetchThirteenF,
  fetchSecNameIndex,
  curatedCusipMap,
  normalizeCompanyName,
  type InvestorCollection,
} from "../../../../../lib/investor-collect";
import { readInvestorCollection, writeInvestorCollection } from "../../../../../lib/investor-store";
import { diffHoldings, isFreshDisclosure } from "@fomo/core/keyword-cards/investor-holdings";

/**
 * WO-RESET-07 PART A — 유명 투자자 보유 내역 수집 크론.
 *
 * `GET /api/fomo/cron/investors`
 *
 * ## 왜 라우트인가
 *
 * SEC 는 연락처 포함 UA 를 요구하고 그 값이 Vercel 환경변수에 있다. 공시 수집과 같은 이유로
 * **키가 있는 런타임에서** 돌리고 워크플로는 호출만 한다.
 *
 * ## 직전 시점을 어떻게 잡나
 *
 * ARK 는 매일 나오므로 **어제 저장분이 직전**이다. 13F 는 분기라 같은 파일에서 최근 두 건을
 * 받아 그 자리에서 비교한다. 첫 실행에는 직전이 없어 변화가 0건인데, 그게 정상이다 —
 * 비교 대상 없이 「처음 샀어요」를 말할 수 없다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const startedAt = Date.now();
  try {
    const today = kstDate();
    const previous = await readInvestorCollection();
    const errors: string[] = [];
    const byInvestor: InvestorCollection["byInvestor"] = {};

    /**
     * CUSIP 사전 — 손으로 확인한 씨앗 + ARK 가 매일 주는 진짜 쌍.
     * 회사명 매칭은 **정확히 일치할 때만** 마지막에 쓴다(오인식 금지).
     */
    const cusipMap = curatedCusipMap();
    const nameIndex = await fetchSecNameIndex();
    if (nameIndex.size === 0) errors.push("sec: company_tickers 조회 실패 — 이름 매칭 없이 진행");

    // ── ARK 먼저: CUSIP 쌍을 얻어 13F 해석률을 올린다 ──
    for (const investor of INVESTORS) {
      if (investor.source !== "ark" || !investor.arkFunds) continue;
      const snap = await fetchArkSnapshot(investor.arkFunds);
      if (!snap || !snap.asOf) { errors.push(`${investor.id}: ARK CSV 조회 실패`); continue; }
      for (const [cusip, ticker] of snap.cusipToTicker) if (!cusipMap.has(cusip)) cusipMap.set(cusip, ticker);
      const priorEntry = previous?.byInvestor?.[investor.id]?.latest ?? null;
      byInvestor[investor.id] = {
        latest: { asOf: snap.asOf, holdings: snap.holdings },
        // 같은 날 다시 돌면 직전을 그대로 물려받는다 — 오늘과 오늘을 비교하면 변화가 0 이 된다.
        prior: priorEntry && priorEntry.asOf !== snap.asOf ? priorEntry : (previous?.byInvestor?.[investor.id]?.prior ?? null),
      };
    }

    const resolve = (cusip: string, name: string): string | undefined =>
      cusipMap.get(cusip.toUpperCase()) ?? nameIndex.get(normalizeCompanyName(name));

    // ── 13F ──
    for (const investor of INVESTORS) {
      if (investor.source !== "13f" || !investor.cik) continue;
      const filings = await fetchThirteenF(investor.cik, resolve, 2);
      if (filings.length === 0) { errors.push(`${investor.id}: 13F 조회 실패 또는 없음`); continue; }
      const [latest, prior] = filings;
      byInvestor[investor.id] = {
        latest: { asOf: latest!.asOf, holdings: latest!.holdings },
        prior: prior ? { asOf: prior.asOf, holdings: prior.holdings } : null,
        unresolved: latest!.unresolved,
      };
    }

    const collected = Object.keys(byInvestor).length;
    /**
     * 빈 수집으로 기존 저장분을 덮지 않는다(§12). 0명이 나왔는데 이전에 있었다면
     * 그건 새 사실이 아니라 장애다.
     */
    const priorCount = Object.keys(previous?.byInvestor ?? {}).length;
    if (collected === 0 && priorCount > 0) {
      return withCors(
        NextResponse.json(
          { ok: false, blocked: "수집 결과가 0명 — 직전 저장분을 유지한다", keptPriorInvestors: priorCount, errors: errors.slice(0, 5), ms: Date.now() - startedAt },
          { status: 503 }
        )
      );
    }

    await writeInvestorCollection({ asOf: today, byInvestor, errors });

    return withCors(
      NextResponse.json({
        ok: true,
        asOf: today,
        investors: collected,
        // 인물별 확보 현황 — WO 보고할 것 1번의 재료다.
        detail: Object.fromEntries(
          Object.entries(byInvestor).map(([id, entry]) => {
            const profile = INVESTORS.find((i) => i.id === id);
            /**
             * **카드가 몇 장 나올지 여기서 밝힌다.**
             *
             * 「인물 카드 0장」이 나왔을 때 원인이 셋인데(공시가 낡음 · 직전이 없음 ·
             * 변화가 없음) 응답만 보고는 구분이 안 됐다. 세 가지를 갈라서 남긴다 —
             * WO 보고할 것 2번(하루 평균 인물 카드 발생 수)의 재료이기도 하다.
             */
            const fresh = profile ? isFreshDisclosure(profile.source, entry.latest.asOf, today) : false;
            const changes = entry.prior ? diffHoldings(entry.latest, entry.prior) : [];
            const byKind: Record<string, number> = {};
            for (const c of changes) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
            return [
              id,
              {
                asOf: entry.latest.asOf,
                holdings: entry.latest.holdings.length,
                hasPrior: Boolean(entry.prior),
                /** 노출 기간(§E-3) 안인가 — 아니면 카드가 안 나온다. */
                fresh,
                changes: changes.length,
                ...(changes.length > 0 ? { byKind } : {}),
                ...(entry.unresolved ? { unresolved: entry.unresolved } : {}),
              },
            ];
          })
        ),
        /** 오늘 카드가 될 수 있는 변화 총수 — 0 이면 왜 0인지 `detail` 이 답한다. */
        cardCandidates: Object.entries(byInvestor).reduce((sum, [id, entry]) => {
          const profile = INVESTORS.find((i) => i.id === id);
          if (!profile || !isFreshDisclosure(profile.source, entry.latest.asOf, today)) return sum;
          return sum + (entry.prior ? diffHoldings(entry.latest, entry.prior).length : 0);
        }, 0),
        errorCount: errors.length,
        errors: errors.slice(0, 5),
        ms: Date.now() - startedAt,
      })
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - startedAt },
        { status: 500 }
      )
    );
  }
}
