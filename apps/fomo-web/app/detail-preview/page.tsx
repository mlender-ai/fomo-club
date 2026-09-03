"use client";

import { useState } from "react";
import type { QuietPickFlowCard, QuietPickMacroCard } from "@/lib/fomoApi";
import { FlowDepth } from "@/components/FlowDepth";
import { MacroDepth } from "@/components/MacroDepth";

/**
 * DETAIL-01 렌더 프리뷰 — 거시 4걸음 · 자금 흐름 5걸음.
 *
 * ## 왜 픽스처 페이지가 필요한가
 *
 * 두 상세는 **크론이 구운 재료**로만 선다. 거시 카드는 「우리가 짚은 종목 2곳 이상」과
 * 닿는 날에만 만들어지고(실측 2026-09-02: 그날은 0장), 흐름 상세는 수급 이력과 업종
 * 분류표가 둘 다 있어야 한다. 그날 데이터가 없다는 이유로 화면을 못 보면 **고칠 수도 없다.**
 *
 * 여기 값은 전부 **가짜다.** 실제 판정·문구 규칙은 서버가 만들고, 이 페이지는 그 모양이
 * 화면에서 어떻게 서는지만 본다.
 */

const MACRO: QuietPickMacroCard = {
  indicatorId: "wti",
  indicatorName: "국제 유가",
  asOf: "2026-09-01",
  asOfLabel: "어제 기준",
  kind: "streak",
  category: "commodity",
  streakDays: 3,
  direction: "down",
  fromText: "$89.8",
  toText: "$83.9",
  changePct: -6.5,
  series: [89.8, 88.4, 87.1, 85.2, 84.0, 83.9],
  detailSeries: Array.from({ length: 60 }, (_, i) => 90 - i * 0.1 + Math.sin(i / 4) * 0.8),
  hook: "국제 유가가 3일째 내리고 있어요",
  // FIX-01 F — `여기 닿아요` → `영향받아요`(서버가 보내는 모양).
  support: ["우리가 최근 짚은 종목 중 5곳이 영향받아요"],
  principle: "유가가 내리면 연료를 많이 쓰는 회사에 유리하고, 에너지를 파는 회사에 불리해요",
  band: { low: 71.2, high: 96.4, percentile: 18, label: "최근 1년 중 낮은 편이에요", points: 248 },
  favorSectors: ["항공", "해운", "육상운송", "화학"],
  hurtSectors: ["정유·가스", "전력"],
  favored: [
    { canonical: "대한항공", pickedAt: "2026-08-28", naverCode: "003490" },
    { canonical: "HMM", pickedAt: "2026-08-26", naverCode: "011200" },
    { canonical: "롯데케미칼", pickedAt: "2026-08-24", naverCode: "011170" },
  ],
  hurt: [
    { canonical: "S-Oil", pickedAt: "2026-08-27", naverCode: "010950" },
    { canonical: "GS", pickedAt: "2026-08-25", naverCode: "078930" },
  ],
};

const FLOW: QuietPickFlowCard = {
  fromSector: "반도체와반도체장비",
  toSector: "전자장비와기기",
  fromNet: -934_600_000_000,
  toNet: 639_900_000_000,
  fromStocks: 90,
  toStocks: 26,
  windowDays: 3,
  hook: "반도체에서 돈이 빠지고\n전자부품으로 들어오고 있어요",
  support: ["최근 3거래일 · 외국인·기관 기준", "반도체 -9,346억 · 전자부품 +6,399억"],
  depth: {
    outflows: [
      { sector: "반도체와반도체장비", net: -934_600_000_000, stocks: 90 },
      { sector: "2차전지", net: -312_000_000_000, stocks: 22 },
      { sector: "화학", net: -184_000_000_000, stocks: 31 },
    ],
    inflows: [
      { sector: "전자장비와기기", net: 639_900_000_000, stocks: 26 },
      { sector: "우주항공과국방", net: 284_000_000_000, stocks: 12 },
      { sector: "조선", net: 121_000_000_000, stocks: 9 },
    ],
    fromStocks: [
      { code: "005930", name: "삼성전자", net: -421_000_000_000 },
      { code: "000660", name: "SK하이닉스", net: -289_000_000_000 },
      { code: "042700", name: "한미반도체", net: -82_000_000_000 },
      { code: "039030", name: "이오테크닉스", net: -31_000_000_000 },
    ],
    toStocks: [
      { code: "011070", name: "LG이노텍", net: 214_000_000_000, volumeRatio: 2.4 },
      { code: "009150", name: "삼성전기", net: 168_000_000_000, volumeRatio: 1.1 },
      { code: "090460", name: "비에이치", net: 49_000_000_000, volumeRatio: 1.8 },
      { code: "222800", name: "심텍", net: 22_000_000_000, volumeRatio: 1.5 },
    ],
    toVolumeStocks: [
      { code: "011070", name: "LG이노텍", net: 214_000_000_000, volumeRatio: 2.4 },
      { code: "090460", name: "비에이치", net: 49_000_000_000, volumeRatio: 1.8 },
      { code: "222800", name: "심텍", net: 22_000_000_000, volumeRatio: 1.5 },
    ],
    toDaily: Array.from({ length: 20 }, (_, i) => ({
      date: `2026-08-${String(i + 5).padStart(2, "0")}`,
      net: (i % 6 === 0 ? -1 : 1) * (40 + i * 7) * 1_000_000_000,
    })),
    toPositiveDays: 14,
  },
};

export default function DetailPreview() {
  const [open, setOpen] = useState<"macro" | "flow" | null>(null);

  if (open === "macro") return <MacroDepth card={MACRO} onClose={() => setOpen(null)} />;
  if (open === "flow") return <FlowDepth card={FLOW} onClose={() => setOpen(null)} />;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col justify-center gap-s3 px-gutter">
      <h1 className="text-ds-display-sm text-ds-text-1">상세 프리뷰</h1>
      <button
        type="button"
        onClick={() => setOpen("macro")}
        data-testid="open-macro-depth"
        className="tap-button h-touch rounded-block bg-ds-accent text-[15px] font-medium text-ds-bg"
      >
        거시 상세 — 네 걸음
      </button>
      <button
        type="button"
        onClick={() => setOpen("flow")}
        data-testid="open-flow-depth"
        className="tap-button h-touch rounded-block border-hair border-ds-border bg-ds-surface-2 text-[15px] text-ds-text-1"
      >
        자금 흐름 상세 — 다섯 걸음
      </button>
    </main>
  );
}
