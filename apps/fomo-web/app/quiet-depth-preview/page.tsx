"use client";

import { QuietPickDepth } from "@/components/QuietPickDepth";
import type { QuietPick } from "@/lib/fomoApi";
import { PREVIEW_PICK } from "./previewPick";

/**
 * 상세 4걸음 프리뷰 — **2걸음은 종전 타임라인 모양**이다(DETAIL-02 실적 숫자 ·
 * DETAIL-04 뜻풀이). 항목(`thesis`)이 붙은 모양은 `/quiet-thesis-preview` 가 지킨다.
 */
export default function QuietDepthPreview() {
  return <QuietPickDepth pick={PREVIEW_PICK as unknown as QuietPick} onClose={() => undefined} />;
}
