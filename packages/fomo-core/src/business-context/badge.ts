import { isRenderable } from "./guards";
import type { BusinessContext, ContextBadge, DependencyState, SourcedSentence } from "./types";

/**
 * 정보 확보 수준 배지 (WO-SUB-03 §4-7).
 *
 * | 배지 | 조건 |
 * |---|---|
 * | `충분` | 슬롯 1·2 렌더 가능 + 슬롯 3 매핑 성공 |
 * | `보통` | 슬롯 1·2 렌더 가능, 슬롯 3 없음 |
 * | `낮음` | 슬롯 1만 렌더 가능 |
 * | `없음` | 전부 실패 → 섹션을 표시하지 않는다 |
 *
 * **한 가지 조건을 더 붙였다**: 근거가 공시(`disclosure`)가 아니라 벤더 요약(`vendor_summary`)뿐이면
 * `충분` 을 주지 않고 한 단계 내린다. 지시서 §3-2 는 슬롯 1·2 의 소스를 공시로 한정하는데,
 * KR 은 DART 미확보로 공시 본문을 가져올 수 없어 네이버 `corporationSummary`(벤더 편집 요약)를 쓴다.
 * 소스 종류를 숨기지 않고 **배지로 드러내는 것**이 배치 규칙 6(소스 종류 분리)을 지키는 방법이다.
 */

function onlyVendorBacked(slots: ReadonlyArray<SourcedSentence | null>): boolean {
  const present = slots.filter((slot): slot is SourcedSentence => slot !== null);
  if (present.length === 0) return false;
  return present.every((slot) => slot.kind === "vendor_summary");
}

export function computeBadge(context: {
  slot1_revenue_source: SourcedSentence | null;
  slot2_dependency: SourcedSentence | null;
  slot3_dependency_state: DependencyState | null;
}): ContextBadge {
  const slot1 = isRenderable(context.slot1_revenue_source, "slot1");
  const slot2 = isRenderable(context.slot2_dependency, "slot2");
  const slot3 = context.slot3_dependency_state !== null;

  if (!slot1 && !slot2) return "없음";
  if (slot1 && slot2) {
    if (!slot3) return "보통";
    // 공시 근거가 하나도 없으면 최고 등급을 주지 않는다.
    return onlyVendorBacked([context.slot1_revenue_source, context.slot2_dependency]) ? "보통" : "충분";
  }
  return slot1 ? "낮음" : "낮음";
}

/**
 * 렌더 계약 — 배지가 `없음` 이면 섹션 자체를 내보내지 않는다(완료 조건 5:
 * 빈 헤더로 남기지 않는다. "재무 한눈에"가 헤더만 남아 있던 실패를 반복하지 않는다).
 */
export interface RenderableContext {
  badge: Exclude<ContextBadge, "없음">;
  slot1: SourcedSentence;
  slot2: SourcedSentence | null;
  slot3: DependencyState | null;
  /** 근거가 벤더 요약뿐임을 화면에 밝혀야 하는가. */
  vendor_only: boolean;
  cited_source_ids: string[];
}

/**
 * 렌더 가능한 형태로 좁힌다. `null` 을 돌려주면 **섹션을 그리지 않고**
 * "사업 정보를 확보하지 못했습니다"만 표시한다.
 */
export function toRenderable(context: BusinessContext): RenderableContext | null {
  if (context.badge === "없음") return null;
  const slot1 = isRenderable(context.slot1_revenue_source, "slot1") ? context.slot1_revenue_source : null;
  if (!slot1) return null;
  const slot2 = isRenderable(context.slot2_dependency, "slot2") ? context.slot2_dependency : null;
  const slot3 = slot2 ? context.slot3_dependency_state : null;
  const badge = computeBadge({ slot1_revenue_source: slot1, slot2_dependency: slot2, slot3_dependency_state: slot3 });
  if (badge === "없음") return null;
  return {
    badge,
    slot1,
    slot2,
    slot3,
    vendor_only: onlyVendorBacked([slot1, slot2]),
    cited_source_ids: [...new Set([...slot1.source_ids, ...(slot2?.source_ids ?? [])])],
  };
}
