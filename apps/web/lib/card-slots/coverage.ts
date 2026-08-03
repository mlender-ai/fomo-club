import {
  RULESET_VERSION,
  buildValuationChart,
  classifyArchetype,
  toRenderable,
  type BusinessContext,
  type FactSheet,
} from "@fomo/core";
import { readBusinessContext } from "../business-context/repository";
import { readFeedContent } from "../feed-content-store";
import { kstDate } from "../fomo";
import { readFactSheet } from "../fundamentals/repository";
import { loadFundamentalsUniverse } from "../fundamentals/universe";

/**
 * 카드 3슬롯 커버리지 (WO-SUB-08 착수 조건 + AC#8 대시보드).
 *
 * ## 이 계측이 무엇을 정하는가
 *
 * 08 은 카드 앞면을 3층(① 트리거 / ② 실체 / ③ 값의 위치)으로 재구성한다. §4-1 은
 * "②③이 모두 없으면 카드는 지금과 동일한 모습이 된다" 고 적고 그 비율을 진척도로 삼는다.
 *
 * **그 비율이 다수면 레이아웃 설계의 기준이 바뀐다** — "3슬롯 채워진 카드"가 아니라
 * "①만 있는 카드"를 기준으로 가야 한다. 그래서 착수 전에 먼저 센다.
 *
 * ## 왜 필드 null 검사로 세지 않는가
 *
 * 슬롯 ② 의 렌더 게이트는 `toRenderable(context)` 다 — 배지가 `없음` 이거나 슬롯1 이
 * 검증되지 않았으면 화면에 아무것도 못 낸다. `slot1_revenue_source !== null` 로 세면
 * **화면에 못 나오는 것을 있다고 세게 된다.** 그 함수가 지금 앱 코드에서 한 번도 호출되지
 * 않고 테스트에서만 쓰이고 있어서, 여기서 처음으로 제품 경로의 기준이 된다.
 *
 * 슬롯 ③ 도 같다 — `buildValuationChart(...).renderable` 이 게이트이고,
 * 못 그리는 사유 4종(`unclassified`·`no_axes`·`bar_series_unavailable`·`no_bar_data`)을
 * 나눠 센다. 사유가 섞이면 "데이터를 더 모으면 되는 문제"와 "축을 못 만드는 문제"가 구분되지 않는다.
 *
 * ## 표본의 성격
 *
 * `loadFundamentalsUniverse()` 는 원장 발행 종목(365일)이라 **수급 엔진이 고른 표본**이다.
 * 시장 분포가 아니다. 다만 08 이 묻는 것이 정확히 "우리가 발행하는 카드가 어떤 모양인가"라
 * 여기서는 그 편향이 오히려 맞는 모수다. 02R 의 시장 분포와 혼동하지 말 것.
 */

/** 슬롯 ③ 이 안 그려지는 사유. 빌더가 돌려주는 값 + 레코드 부재. */
export type Slot3Reason =
  | "unclassified"
  | "no_axes"
  | "bar_series_unavailable"
  | "no_bar_data"
  | "no_factsheet"
  | "build_error";

/** 슬롯 ② 가 안 나오는 사유. */
export type Slot2Reason = "no_record" | "not_renderable";

export interface CardSlotRow {
  canonical: string;
  market: string;
  /** ① 트리거. 발행 카드라는 사실 자체가 근거다(§4-1: 없으면 카드가 성립하지 않는다). */
  slot1: true;
  slot2: boolean;
  slot3: boolean;
  slot2_reason: Slot2Reason | null;
  slot3_reason: Slot3Reason | null;
  archetype: string | null;
}

export interface CardSlotSummary {
  n: number;
  /** 조합별 카드 수. 08 §7 이 요구하는 4가지 경우의 수와 같은 축이다. */
  combinations: { "①만": number; "①②": number; "①③": number; "①②③": number };
  slot2: number;
  slot3: number;
  slot2_reasons: Record<string, number>;
  slot3_reasons: Record<string, number>;
  /** 아키타입별 슬롯3 성공/실패 — 어느 유형이 구조적으로 못 그리는지 보인다. */
  by_archetype: Record<string, { n: number; slot3: number }>;
}

export interface CardSlotCoverageReport {
  generatedAt: string;
  date: string;
  ruleset_version: string;
  /** 오늘 실제로 노출 중인 덱. 가장 정확한 "현재 발행 카드"다. */
  live_deck: CardSlotSummary;
  /** 365일 발행 이력. 표본이 커서 분포를 말할 수 있다. */
  universe: CardSlotSummary;
  rows: CardSlotRow[];
}

function emptySummary(): CardSlotSummary {
  return {
    n: 0,
    combinations: { "①만": 0, "①②": 0, "①③": 0, "①②③": 0 },
    slot2: 0,
    slot3: 0,
    slot2_reasons: {},
    slot3_reasons: {},
    by_archetype: {},
  };
}

export function summarizeCardSlots(rows: readonly CardSlotRow[]): CardSlotSummary {
  const out = emptySummary();
  out.n = rows.length;
  for (const row of rows) {
    const key = row.slot2 && row.slot3 ? "①②③" : row.slot2 ? "①②" : row.slot3 ? "①③" : "①만";
    out.combinations[key] += 1;
    if (row.slot2) out.slot2 += 1;
    else if (row.slot2_reason) out.slot2_reasons[row.slot2_reason] = (out.slot2_reasons[row.slot2_reason] ?? 0) + 1;
    if (row.slot3) out.slot3 += 1;
    else if (row.slot3_reason) out.slot3_reasons[row.slot3_reason] = (out.slot3_reasons[row.slot3_reason] ?? 0) + 1;
    const archetype = row.archetype ?? "(분류 불가)";
    const bucket = out.by_archetype[archetype] ?? { n: 0, slot3: 0 };
    bucket.n += 1;
    if (row.slot3) bucket.slot3 += 1;
    out.by_archetype[archetype] = bucket;
  }
  return out;
}

/** 슬롯 ② — `toRenderable` 이 게이트다. 필드 존재가 아니라 화면에 낼 수 있는지를 본다. */
function evaluateSlot2(context: BusinessContext | null): { ok: boolean; reason: Slot2Reason | null } {
  if (context === null) return { ok: false, reason: "no_record" };
  return toRenderable(context) === null ? { ok: false, reason: "not_renderable" } : { ok: true, reason: null };
}

/** 슬롯 ③ — 차트 빌더가 게이트다. 아키타입은 저장돼 있지 않아 팩트시트에서 다시 분류한다. */
function evaluateSlot3(factsheet: FactSheet | null): {
  ok: boolean;
  reason: Slot3Reason | null;
  archetype: string | null;
} {
  if (factsheet === null) return { ok: false, reason: "no_factsheet", archetype: null };
  let archetype: string;
  try {
    archetype = classifyArchetype(factsheet).code;
  } catch {
    return { ok: false, reason: "build_error", archetype: null };
  }
  try {
    // `frameOf` 는 독트린에 없는 코드에 대해 던진다 — 배치 루프가 통째로 죽지 않게 감싼다.
    const chart = buildValuationChart(factsheet, archetype as never, RULESET_VERSION);
    if (chart.renderable) return { ok: true, reason: null, archetype };
    return { ok: false, reason: (chart.unavailable_reason as Slot3Reason) ?? "build_error", archetype };
  } catch {
    return { ok: false, reason: "build_error", archetype };
  }
}

async function rowFor(market: string, canonical: string): Promise<CardSlotRow> {
  const [context, record] = await Promise.all([
    readBusinessContext(market, canonical).catch(() => null),
    readFactSheet(market, canonical).catch(() => null),
  ]);
  const slot2 = evaluateSlot2(context);
  const slot3 = evaluateSlot3(record?.factsheet ?? null);
  return {
    canonical,
    market,
    slot1: true,
    slot2: slot2.ok,
    slot3: slot3.ok,
    slot2_reason: slot2.reason,
    slot3_reason: slot3.reason,
    archetype: slot3.archetype,
  };
}

interface LiveDeckShape {
  picks?: Array<{ subject?: { canonical?: string; country?: string } }>;
}

/** 저장된 레코드만 읽는다 — 대시보드가 소스를 두들기면 그게 요청 시점 계산이다. */
export async function buildCardSlotCoverage(): Promise<CardSlotCoverageReport> {
  const universe = await loadFundamentalsUniverse();
  const rows: CardSlotRow[] = [];
  for (const entry of universe) rows.push(await rowFor(entry.country, entry.canonical));

  const live = await readFeedContent<LiveDeckShape>("quiet-pick:active").catch(() => null);
  const liveKeys = new Set(
    (live?.picks ?? [])
      .map((pick) => pick.subject?.canonical)
      .filter((canonical): canonical is string => typeof canonical === "string")
  );
  const liveRows = rows.filter((row) => liveKeys.has(row.canonical));

  return {
    generatedAt: new Date().toISOString(),
    date: kstDate(),
    ruleset_version: RULESET_VERSION,
    live_deck: summarizeCardSlots(liveRows),
    universe: summarizeCardSlots(rows),
    rows,
  };
}
