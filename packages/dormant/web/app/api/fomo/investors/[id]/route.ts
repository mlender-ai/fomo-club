import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { INVESTORS } from "../../../../../lib/investor-collect";
import { readInvestorCollection } from "../../../../../lib/investor-store";
import { diffHoldings, topWeightHoldings, formatShares, formatUsd } from "@fomo/core/keyword-cards/investor-holdings";
import { whenLabel } from "@fomo/core";

/**
 * INFLUENCER-01 PART D-2·E — **한 인물의 포트폴리오.**
 *
 * `GET /api/fomo/investors/cathie-wood`
 *
 * ## 왜 페이로드가 아니라 라우트인가
 *
 * ARK 는 90종목을 들고 있다. 그걸 픽 페이로드에 넣으면 **같은 인물의 카드마다 90줄이
 * 복제**되고, 그 인물 카드를 안 여는 대다수 사용자에게도 실린다. 상세를 열 때 받는다 —
 * 회사 설명(`stock-basics`)과 같은 방식이다.
 *
 * ## 계산은 여기서 하지 않는다
 *
 * 변화 판정은 `diffHoldings`, 상위 보유는 `topWeightHoldings` 가 한다(카드·덱이 쓰는 것과
 * **같은 함수**다). 화면과 카드가 다른 규칙으로 같은 것을 말하는 일을 막는다.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 인물 페이지에 싣는 보유 상한. 90종목을 다 내리면 스크롤이 끝나지 않는다. */
const MAX_HOLDINGS = 40;
/** 최근 매매 목록 상한(산 것·판 것 각각). */
const MAX_RECENT = 5;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const profile = INVESTORS.find((i) => i.id === id.trim());
  if (!profile) {
    return withCors(NextResponse.json({ ok: false, error: "unknown investor" }, { status: 404 }));
  }

  const collection = await readInvestorCollection();
  const entry = collection?.byInvestor?.[profile.id];
  if (!entry?.latest) {
    /**
     * 수집 전이거나 그 인물만 실패한 상태다. **빈 목록을 만들어 보내지 않는다** —
     * 화면은 이 응답을 보고 섹션을 그리지 않는다(없는 것을 0으로 채우지 않는다).
     */
    return withCors(
      NextResponse.json(
        { ok: false, error: "no snapshot", investor: { id: profile.id, name: profile.name, firm: profile.firm } },
        { status: 404 }
      )
    );
  }

  const latest = entry.latest;
  const prior = entry.prior;
  const priorByTicker = new Map((prior?.holdings ?? []).map((h) => [h.ticker.toUpperCase(), h]));
  const changes = diffHoldings(latest, prior);

  /** 비중 순. 직전 대비 증감(%p)은 **직전 스냅샷이 있을 때만** 붙는다(PART E 「변화」열). */
  const holdings = [...latest.holdings]
    /**
     * **비중이 없는 보유는 내려주지 않는다.** 비중 순으로 세우는 화면이라 값이 없으면 자리를
     * 정할 수 없고, 화면은 그 칸에 대시를 넣게 된다 — DS-05 §3 이 금지하는 모양이다.
     */
    .filter((h) => typeof h.weightPct === "number" && h.weightPct > 0)
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0))
    .slice(0, MAX_HOLDINGS)
    .map((h) => {
      const was = priorByTicker.get(h.ticker.toUpperCase());
      const delta =
        typeof h.weightPct === "number" && typeof was?.weightPct === "number" ? h.weightPct - was.weightPct : null;
      return {
        ticker: h.ticker.toUpperCase(),
        name: h.name,
        ...(typeof h.weightPct === "number" ? { weightPct: Math.round(h.weightPct * 100) / 100 } : {}),
        shares: h.shares,
        sharesText: formatShares(h.shares),
        ...(typeof h.valueUsd === "number" ? { valueText: formatUsd(h.valueUsd) } : {}),
        ...(delta !== null ? { deltaWeightPct: Math.round(delta * 100) / 100 } : {}),
      };
    });

  /** 최근 매매 — 산 것과 판 것을 나눠 준다(D-2 화면이 두 묶음으로 그린다). */
  const label = (kind: string): string =>
    kind === "new" ? "새로 샀어요" : kind === "added" ? "더 샀어요" : kind === "exited" ? "전부 팔았어요" : "줄였어요";
  const bought = changes
    .filter((c) => c.kind === "new" || c.kind === "added")
    .sort((a, b) => Math.abs(b.weightDeltaPct ?? 0) - Math.abs(a.weightDeltaPct ?? 0))
    .slice(0, MAX_RECENT)
    .map((c) => ({ ticker: c.ticker, name: c.name, text: label(c.kind) }));
  const sold = changes
    .filter((c) => c.kind === "reduced" || c.kind === "exited")
    .sort((a, b) => Math.abs(b.weightDeltaPct ?? 0) - Math.abs(a.weightDeltaPct ?? 0))
    .slice(0, MAX_RECENT)
    .map((c) => ({ ticker: c.ticker, name: c.name, text: label(c.kind) }));

  /** 상위 보유 한 줄 — 카드·덱이 쓰는 것과 **같은 함수**로 뽑는다. */
  const top = topWeightHoldings(latest, { limit: 3 }).map((h) => ({
    ticker: h.ticker,
    weightPct: Math.round((h.weightPct ?? 0) * 100) / 100,
  }));

  const totalValueUsd = latest.holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
  return withCors(
    NextResponse.json({
      ok: true,
      investor: { id: profile.id, name: profile.name, firm: profile.firm, source: profile.source },
      /** **공시일을 그대로 쓴다** — 지연을 숨기지 않는다(WO 하지 말 것). */
      asOf: latest.asOf,
      asOfLabel: whenLabel(latest.asOf) ?? latest.asOf,
      ...(prior ? { priorAsOf: prior.asOf, priorAsOfLabel: whenLabel(prior.asOf) ?? prior.asOf } : {}),
      totals: {
        holdings: latest.holdings.length,
        ...(totalValueUsd > 0 ? { valueText: formatUsd(totalValueUsd) } : {}),
        bought: changes.filter((c) => c.kind === "new" || c.kind === "added").length,
        sold: changes.filter((c) => c.kind === "reduced" || c.kind === "exited").length,
      },
      top,
      recent: { bought, sold },
      holdings,
      // 화면이 「40종목만 받았다」를 알 수 있게 남긴다(전체 수는 `totals.holdings`).
      truncated: latest.holdings.length > MAX_HOLDINGS,
      today: kstDate(),
    })
  );
}
