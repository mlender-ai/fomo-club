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
