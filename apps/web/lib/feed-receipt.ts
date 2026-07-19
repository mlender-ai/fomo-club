/**
 * R1 후회 영수증 — "어제의 영수증"(2026-07-12 User Zero 성장 로드맵 R1).
 *
 * 어제 30장 중 오늘 ±10% 이상 움직인 카드를 하이라이트 — "봤나요?". 손실회피를 판단 규율로:
 * 놓친 상승을 실데이터로 보여줘 다음 카드를 진지하게 보게 한다.
 *
 * 윤리 가드(AGENTS.md + R1 지시서): 실계산만(소급 조작 0 — 어제 스냅샷의 발견가 vs 오늘 실시세),
 * 공포·카운트다운·매매 재촉 문구 금지. 프레임은 "다음 판단을 위한 복기". LLM 없음(결정론).
 *
 * 개인화된 "넘긴 카드"(유저별 스와이프 성과)는 클라이언트 localStorage 기반(apps/fomo-web) —
 * 서버는 유저 스와이프를 모르므로, 공유 자산인 "어제 30장"만 서버 피드 카드로 만든다.
 */

import type { DeckContentCard, DeckContentFact } from "./deck-content";
import { readLatestSelectionSnapshotBefore } from "./judgment-ledger";
import { fetchCurrentPrices, type QuoteRequestItem } from "./quote-prices";
import { kstDate } from "./fomo";

interface PickSnapshot {
  canonical: string;
  headline?: string;
  price?: number;
  symbol?: string;
  naverCode?: string;
  market?: string;
  country?: string;
}
const RECEIPT_MOVE_THRESHOLD_PCT = 10; // ±10% 이상만 하이라이트(R1 지시서)
const RECEIPT_MAX_FACTS = 5;

function signedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * "어제의 영수증" 피드 카드 1장. 어제 스냅샷(발견가 포함)이 없거나 ±10% 무버가 없으면 [](노출 안 함).
 * 전향적 데이터 규약: 발견가는 어제 스냅샷에 저장된 값만 — 스냅샷에 price 없던 구버전 픽스는 자연 제외.
 */
export async function buildDailyReceiptCard(): Promise<DeckContentCard[]> {
  const today = kstDate();
  const yesterday = await readLatestSelectionSnapshotBefore(today).catch(() => []);
  const priced = yesterday.map((row): PickSnapshot => ({
    canonical: row.subject.canonical,
    price: row.priceAt,
    ...(row.payload.headline ? { headline: row.payload.headline } : {}),
    ...(row.subject.symbol ? { symbol: row.subject.symbol } : {}),
    ...(row.payload.naverCode ? { naverCode: row.payload.naverCode } : {}),
    ...(row.payload.market ? { market: row.payload.market } : {}),
    ...(row.payload.country ? { country: row.payload.country } : {}),
  })).filter(
    (p): p is PickSnapshot & { price: number } => typeof p.price === "number" && p.price > 0
  );
  if (priced.length === 0) return [];

  const items: QuoteRequestItem[] = priced.map((p) => ({
    key: p.canonical,
    stock: p.canonical,
    ...(p.symbol ? { symbol: p.symbol } : {}),
    ...(p.naverCode ? { naverCode: p.naverCode } : {}),
    ...(p.market ? { market: p.market } : {}),
    ...(p.country ? { country: p.country } : {}),
  }));
  const current = await fetchCurrentPrices(items).catch(() => new Map<string, number>());

  const moves = priced
    .map((p) => {
      const now = current.get(p.canonical);
      if (typeof now !== "number" || now <= 0) return null;
      return { canonical: p.canonical, returnPct: ((now - p.price) / p.price) * 100 };
    })
    .filter((m): m is { canonical: string; returnPct: number } => m !== null)
    .filter((m) => Math.abs(m.returnPct) >= RECEIPT_MOVE_THRESHOLD_PCT)
    .sort((a, b) => b.returnPct - a.returnPct); // 상승 큰 순(FOMO 프레임) → 하락 순

  if (moves.length === 0) return [];

  const gainers = moves.filter((m) => m.returnPct > 0).length;
  const facts: DeckContentFact[] = moves.slice(0, RECEIPT_MAX_FACTS).map((m) => ({
    label: m.canonical,
    value: signedPct(m.returnPct),
  }));
  const headline =
    gainers > 0
      ? `어제 30장 중 오늘 +10% 넘은 카드 ${gainers}장 — 봤나요?`
      : `어제 30장 중 오늘 10% 이상 움직인 카드 ${moves.length}장`;

  return [
    {
      kind: "content",
      id: `content:daily-receipt:${today}`,
      contentType: "daily-receipt",
      scope: "global",
      headline,
      facts,
      note: "어제 발견 시점 가격 대비 오늘 실시세입니다. 다음 카드를 위한 복기예요.",
      source: "FOMO 발견 기록",
      asOf: today,
    },
  ];
}
