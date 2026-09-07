"use client";

import { QuietPickDepth } from "@/components/QuietPickDepth";
import type { QuietPick } from "@/lib/fomoApi";
import { PREVIEW_PICK } from "@/app/quiet-depth-preview/previewPick";

/**
 * THESIS-01 — 「지금 눈에 띄는 것」 확인 화면.
 *
 * ## 왜 화면을 하나 더 두나
 *
 * 2걸음은 **두 모양**을 갖는다: 항목이 2개 이상이면 「지금 눈에 띄는 것」, 아니면 종전
 * 타임라인(DETAIL-02 실적 숫자 · DETAIL-04 뜻풀이). **둘 다 살아 있는 동작**이라
 * 한 화면에 둘을 같이 그릴 수 없다 — 픽스처 하나로는 한쪽만 검사하게 된다.
 *
 * 그래서 기본 프리뷰(`/quiet-depth-preview`)는 타임라인 모양을 지키고, 이 화면이
 * 항목 모양을 지킨다. 픽스처 본문은 **한 곳**(`previewPick`)이고 여기서 항목만 얹는다 —
 * 두 화면이 갈라지면 검사도 갈라진다.
 */
const PICK = {
  ...PREVIEW_PICK,
  /**
   * THESIS-01 — 「지금 눈에 띄는 것」. **서버가 굽는 시점에 굳혀 보낸다.**
   * 이 픽스처가 있으면 2걸음이 이 모양으로 그려지고, 없으면 종전 타임라인으로 되돌아간다.
   * 값은 지시서 A-1 목업을 그대로 옮겼다(숫자·시점·확인 지점 세 요소를 눈으로 보기 위해).
   */
  thesis: [
    {
      kind: "earnings" as const,
      title: "매출 늘고 영업이익 흑자로 돌아섰어요",
      when: "8월 14일 2026년 2분기 실적",
      numbers: [
        { label: "매출", value: "1,240억", compare: "작년 2분기보다 +18%" },
        { label: "영업이익", value: "92억", compare: "작년 2분기 -14억에서 흑자로" },
      ],
      nextCheck: "다음 실적 발표는 보통 11월이에요",
    },
    {
      kind: "valuation" as const,
      title: "값이 5년 중 낮은 편이에요",
      numbers: [
        // 숫자 하나에 비교 대상 둘 — 업종 평균과 5년 위치를 함께 본다.
        { label: "PBR", value: "0.88배", compare: "다른 미디어 14곳 평균 1.42배", also: "5년 범위에서 아래 12% 지점" },
      ],
      nextCheck: "다음 분기 실적이 나오면 값이 다시 계산돼요",
    },
    {
      kind: "supply" as const,
      title: "그 사이 임원 3명이 사기 시작했어요",
      when: "8월 14일부터",
      numbers: [
        { value: "5일 연속", compare: "최근 22거래일 중 가장 길어요" },
        { value: "$2.8M", compare: "거래량은 평소의 33%" },
      ],
      nextCheck: "연속이 끊기면 이 신호는 끝나요",
    },
  ],
  thesisLine: "실적 흑자 전환 · 값은 5년 중 낮은 편",
} as unknown as QuietPick;

export default function QuietThesisPreview() {
  return <QuietPickDepth pick={PICK} onClose={() => undefined} />;
}
