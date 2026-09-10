/**
 * 유형 리스크 로더 (WO-SUB-06 §5-1, 커밋 1).
 *
 * ## 왜 로더가 따로 있나
 *
 * 독트린을 컴포넌트가 직접 읽으면 두 가지가 새어 나간다: ① 유형당 상한(UI 예산)을 각
 * 호출자가 알아야 하고 ② 고지 문구를 붙이는 것을 잊을 수 있다. 리스크는 **고지 없이 나가면
 * 거짓말이 되는 콘텐츠**라서(유형 리스크를 종목 고유 리스크처럼 보이게 함) 문구를 옵션으로
 * 두지 않고 반환값에 묶어 함께 내보낸다. 완료 조건 1("유형 리스크가 항상 disclaimer 와 함께
 * 렌더된다")을 타입으로 지탱하는 것이 목적이다.
 *
 * 순수 함수다 — IO 없음, 같은 입력 → 같은 출력.
 */

import { frameOf } from "../archetype/classify";
import {
  ARCHETYPE_RISK_DISCLAIMER,
  ARCHETYPE_RISK_MAX,
  type ArchetypeCode,
  type ArchetypeRiskCategory,
  type ArchetypeRiskItem,
} from "../archetype/types";

export interface ArchetypeRiskBlock {
  archetype: ArchetypeCode;
  items: ArchetypeRiskItem[];
  /**
   * 항상 채워진다. 호출자가 이걸 렌더하지 않으면 완료 조건 1 위반이고,
   * `risk-archetype.test.ts` 가 렌더 경로에서 이 문구를 찾는다.
   */
  disclaimer: string;
  /** 상한 때문에 잘린 항목 수. 0 이 아니면 문서·리포트에 남긴다(조용한 절단 금지). */
  truncated: number;
}

/**
 * 유형 리스크 블록.
 *
 * 항목이 0개인 유형(`UNCLASSIFIED`)은 `items: []` 로 돌려준다. **빈 블록과 "확보하지 못함"은
 * 다른 말이므로** 여기서 대체 문구를 만들지 않는다 — 표시 판단은 호출자(§6 UI)가 한다.
 */
export function archetypeRiskBlock(code: ArchetypeCode): ArchetypeRiskBlock {
  // frameOf 는 독트린에 없는 코드에서 throw 한다 — 조용히 빈 블록을 돌려주면
  // "리스크 없음" 으로 렌더돼 §10 실패 모드("없다고 표시해 안전해 보이게")가 된다.
  const all = frameOf(code).risks;
  return {
    archetype: code,
    items: all.slice(0, ARCHETYPE_RISK_MAX),
    disclaimer: ARCHETYPE_RISK_DISCLAIMER,
    truncated: Math.max(0, all.length - ARCHETYPE_RISK_MAX),
  };
}

/** 범주별 분해 — 한 유형의 리스크가 한쪽으로만 몰렸는지 점검한다(사람 검토용). */
export function riskCategoryCounts(items: readonly ArchetypeRiskItem[]): Record<ArchetypeRiskCategory, number> {
  const counts: Record<ArchetypeRiskCategory, number> = {
    supply: 0,
    demand: 0,
    financial: 0,
    regulatory: 0,
    concentration: 0,
  };
  for (const item of items) counts[item.category] += 1;
  return counts;
}
