import type { BusinessContext } from "@fomo/core";
import { DEPENDENCY_VARIABLES, renderableVariables } from "@fomo/core";
import { kstDate } from "../fomo";
import { readBusinessContext } from "./repository";
import { loadFundamentalsUniverse } from "../fundamentals/universe";

/**
 * 합성 커버리지 대시보드 (WO-SUB-03 §7).
 *
 * 배지 분포 · 섹션 추출 실패율 · 검증 통과율(폐기 사유별). **저장된 레코드만 읽는다** —
 * 여기서 소스를 다시 조회하거나 LLM 을 부르지 않는다.
 */

export interface BusinessContextCoverage {
  generatedAt: string;
  date: string;
  universe: number;
  records: number;
  badges: Record<string, number>;
  byMarket: Record<string, { n: number; slot1: number; slot2: number; slot3: number; badges: Record<string, number> }>;
  /** 소스 종류별 슬롯 근거 — 공시 기반이 몇 건인지가 신뢰의 축이다. */
  sourceKinds: Record<string, number>;
  /** 실패·폐기 사유별 건수(에러 문자열의 앞부분으로 묶는다). */
  failureReasons: Record<string, number>;
  /**
   * 슬롯 3 출처 분해(WO-SUB-03.5 PART E-3 폴백 승인 조건 — "폴백 비중을 측정 가능하게").
   * `observation` = 실관측 / `fallback_operating_income` = 8분기 영업이익 추이 폴백.
   * 폴백은 배지를 올리지 않으므로, 이 비중이 커지면 "충분" 이 아니라 프레임만 는 것이다.
   */
  slot3Sources: Record<string, number>;
  /** 아키타입별 슬롯 확보(E-3 — 유형별 결손 분포를 보려면 이 축이 필요하다). */
  byArchetype: Record<string, { n: number; slot1: number; slot2: number; slot3: number; slot3Fallback: number }>;
  /** 값 소스가 없어 슬롯 3 을 만들 수 없는 변수 — 카탈로그의 미확보 축. */
  variablesWithoutSource: string[];
  variablesRenderable: number;
}

function bucketReason(error: string): string {
  // "slot1: 금지 패턴(causal) \"...\" — 폐기" → "slot1: 금지 패턴(causal)"
  return error.split(/["(]/)[0]!.trim().replace(/\s*—.*$/, "").slice(0, 60) || error.slice(0, 60);
}

export function summarizeBusinessContext(
  contexts: readonly BusinessContext[],
  options: { universe: number; date?: string }
): BusinessContextCoverage {
  const badges: Record<string, number> = { 충분: 0, 보통: 0, 낮음: 0, 없음: 0 };
  const slot3Sources: Record<string, number> = {};
  const byArchetype: Record<string, { n: number; slot1: number; slot2: number; slot3: number; slot3Fallback: number }> = {};
  const byMarket: BusinessContextCoverage["byMarket"] = {};
  const sourceKinds: Record<string, number> = {};
  const failureReasons: Record<string, number> = {};

  for (const context of contexts) {
    badges[context.badge] = (badges[context.badge] ?? 0) + 1;
    const market = (byMarket[context.market] ??= { n: 0, slot1: 0, slot2: 0, slot3: 0, badges: {} });
    market.n += 1;
    if (context.slot1_revenue_source) market.slot1 += 1;
    if (context.slot2_dependency) market.slot2 += 1;
    if (context.slot3_dependency_state) market.slot3 += 1;
    // 슬롯 3 출처·아키타입 분해(E-3).
    const state = context.slot3_dependency_state;
    if (state) {
      const origin = state.slot3_source ?? "observation";
      slot3Sources[origin] = (slot3Sources[origin] ?? 0) + 1;
    }
    const archetypeKey = context.archetype ?? "(미기록)";
    const arch = (byArchetype[archetypeKey] ??= { n: 0, slot1: 0, slot2: 0, slot3: 0, slot3Fallback: 0 });
    arch.n += 1;
    if (context.slot1_revenue_source) arch.slot1 += 1;
    if (context.slot2_dependency) arch.slot2 += 1;
    if (state) {
      arch.slot3 += 1;
      if ((state.slot3_source ?? "observation") === "fallback_operating_income") arch.slot3Fallback += 1;
    }
    market.badges[context.badge] = (market.badges[context.badge] ?? 0) + 1;
    for (const slot of [context.slot1_revenue_source, context.slot2_dependency]) {
      if (slot) sourceKinds[slot.kind] = (sourceKinds[slot.kind] ?? 0) + 1;
    }
    for (const error of context.errors) {
      const key = bucketReason(error);
      failureReasons[key] = (failureReasons[key] ?? 0) + 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    date: options.date ?? kstDate(),
    universe: options.universe,
    records: contexts.length,
    badges,
    byMarket,
    sourceKinds,
    failureReasons,
    slot3Sources,
    byArchetype,
    variablesWithoutSource: DEPENDENCY_VARIABLES.filter((variable) => variable.source === null).map((variable) => variable.code),
    variablesRenderable: renderableVariables().length,
  };
}

export async function buildBusinessContextCoverage(): Promise<BusinessContextCoverage> {
  const universe = await loadFundamentalsUniverse();
  const contexts: BusinessContext[] = [];
  for (const entry of universe) {
    const context = await readBusinessContext(entry.country, entry.canonical);
    if (context) contexts.push(context);
  }
  return summarizeBusinessContext(contexts, { universe: universe.length });
}
