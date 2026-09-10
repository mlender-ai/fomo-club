/**
 * "이게 틀리는 경우" 블록 조립 (WO-SUB-06.5 배선 · §6).
 *
 * ## 왜 조립을 여기서 하나
 *
 * 화면이 받는 모양을 **한 곳에서** 정한다. 컴포넌트가 조각(유형 리스크·종목 리스크·무효 조건)을
 * 각자 조립하면 §6 의 세 규칙(고지 동반 · 미확보 블록 숨김 금지 · 가격·사업 병치)이 호출부마다
 * 다르게 지켜진다. 순수 함수라 렌더 경로(INV-14)에서 불러도 된다.
 *
 * ## 무엇을 넣지 않는가
 *
 * 종목 고유 리스크는 **저장된 레코드에서 온다.** 여기서 LLM 을 부르지 않는다(INV-14). 저장분이
 * 없으면 `symbol: null` 로 들어오고, 그 상태가 곧 §5-2 의 "확보하지 못함" 경로다.
 */

import { ARCHETYPE_RISK_DISCLAIMER, type ArchetypeCode, type ArchetypeRiskItem } from "../archetype/types";
import { archetypeRiskBlock } from "./archetype-risk";
import { businessInvalidationFor, NO_BUSINESS_INVALIDATION, type EarningsCheckpoint } from "./business-invalidation";
import { SYMBOL_RISK_UNAVAILABLE_TEXT, type SymbolRisk } from "./symbol-risk";

export interface WhereThisIsWrongBlock {
  symbol: {
    items: SymbolRisk[];
    /** 항목이 0개인 이유. 항목이 있으면 null. */
    unavailable_reason: string | null;
    /** 화면 문안 — 컴포넌트가 문구를 하드코딩하지 않게 데이터로 내린다. */
    unavailable_text: string;
  };
  archetype: {
    items: ArchetypeRiskItem[];
    /** 항상 채워진다(완료 조건 1). */
    disclaimer: string;
  };
  invalidation: {
    /** 기존 가격 무효선. 캔들이 부족하면 null. */
    price_text: string | null;
    business_text: string | null;
    /** 사업 조건을 만들 수 없는 유형의 사유. `business_text` 가 있으면 null. */
    business_absent_reason: string | null;
    check_at: string | null;
    check_at_status: string;
  };
}

export interface WhereThisIsWrongInput {
  archetype: ArchetypeCode;
  /** 저장된 종목 고유 리스크. 레코드가 없으면 null — 그 자체가 "확보하지 못함" 이다. */
  storedSymbolRisks: readonly SymbolRisk[] | null;
  /** 레코드가 없거나 비어 있는 이유(배치가 남긴 것). 없으면 기본 문구를 만든다. */
  symbolUnavailableReason?: string | null;
  /** `verdict.invalidation` — 가격 무효선. */
  priceInvalidationText?: string | null;
  earnings?: EarningsCheckpoint;
}

/**
 * 블록 조립.
 *
 * **빈 블록을 만들지 않는다.** 종목 리스크가 없어도 `unavailable_reason` 이 채워지고, 사업 조건이
 * 없어도 사유가 채워진다 — "리스크 없는 회사" 로 읽히는 상태(§10)를 타입 수준에서 막는다.
 */
export function composeWhereThisIsWrong(input: WhereThisIsWrongInput): WhereThisIsWrongBlock {
  const archetype = archetypeRiskBlock(input.archetype);
  const checkpoint: EarningsCheckpoint = input.earnings ?? { date: null, status: "unknown" };
  const invalidation = businessInvalidationFor(input.archetype, checkpoint);

  const items = [...(input.storedSymbolRisks ?? [])];
  const unavailableReason =
    items.length > 0 ? null : (input.symbolUnavailableReason ?? "위험요소 합성 레코드가 아직 없음");

  return {
    symbol: {
      items,
      unavailable_reason: unavailableReason,
      unavailable_text: SYMBOL_RISK_UNAVAILABLE_TEXT,
    },
    archetype: {
      items: archetype.items,
      disclaimer: ARCHETYPE_RISK_DISCLAIMER,
    },
    invalidation: {
      price_text: input.priceInvalidationText ?? null,
      business_text: invalidation?.condition_text ?? null,
      business_absent_reason: invalidation ? null : (NO_BUSINESS_INVALIDATION[input.archetype] ?? "사업 기준 무효 조건을 만들지 못했어요."),
      check_at: invalidation?.check_at ?? null,
      check_at_status: invalidation?.check_at_status ?? checkpoint.status,
    },
  };
}

/**
 * 블록을 화면에 낼 가치가 있는가.
 *
 * 유형 리스크도 없고(UNCLASSIFIED) 종목 리스크도 없고 무효 조건도 없으면 섹션 자체가 의미 없다.
 * 그 판정을 컴포넌트와 페이로드가 각자 하지 않도록 여기 둔다.
 */
export function hasWhereThisIsWrongContent(block: WhereThisIsWrongBlock): boolean {
  return (
    block.archetype.items.length > 0 ||
    block.symbol.items.length > 0 ||
    Boolean(block.invalidation.price_text) ||
    Boolean(block.invalidation.business_text)
  );
}
