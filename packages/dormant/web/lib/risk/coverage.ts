import { loadFundamentalsUniverse } from "../fundamentals/universe";
import { readAllSymbolRisks } from "./repository";

/**
 * 종목 고유 리스크 확보 현황 (WO-SUB-FILL PART 2-3).
 *
 * **저장된 레코드만 읽는다** — 소스 재조회·LLM 호출 없음(INV-14).
 *
 * ## 왜 필요한가
 *
 * 06.5 가 만든 배치가 한 번도 돌지 않아 레코드가 1건이었는데, 그 사실을 아무 화면도 말하지
 * 않았다. 소급 스캔에 검사를 붙이고 나서야 드러났다. 배치가 매일 얼마나 늘고 있는지는
 * 화면에서 보여야 한다 — 안 보이면 멈춘 것도 모른다.
 *
 * ## 확보와 실패를 나눠 센다
 *
 * `records` 는 시도한 수이고 `withItems` 가 실제로 화면에 리스크가 뜨는 수다. 둘을 합쳐 세면
 * "레코드 400건"이 "리스크 400종목"으로 읽힌다 — 실패 레코드도 저장되므로 거짓이 된다.
 */

export interface RiskCoverage {
  generatedAt: string;
  /** 대상 종목 수(팩트시트 유니버스). */
  universe: number;
  /** 합성을 시도해 레코드가 남은 종목 수. 실패 레코드도 포함한다. */
  records: number;
  /** **항목이 1개 이상 있는** 종목 수 — 화면에 실제로 리스크가 뜨는 수다. */
  withItems: number;
  /** `withItems / universe` (%). 유니버스가 0 이면 null. */
  ratePct: number | null;
  /** 확보한 항목 총수. */
  items: number;
  /** 아직 시도조차 안 된 종목 수. */
  untouched: number;
  /** 항목 0건인 레코드의 사유 분포 — 무엇이 막고 있는지 화면에서 보인다. */
  unavailableReasons: Record<string, number>;
  /** 소스 종류 분포. `filing` 이 아닌 것이 섞이면 여기서 보인다. */
  sourceKinds: Record<string, number>;
  byMarket: Record<string, { n: number; withItems: number; items: number }>;
}

/**
 * 사유를 앞머리로 묶는다. 낱말이 아니라 **원인**으로 나눈다 —
 * 배선된 것을 미배선으로 읽는 오라벨을 WO-SUB-CLOSE 에서 겪었다.
 */
function reasonBucket(reason: string): string {
  if (reason.includes("쿼터")) return "일일 LLM 쿼터 소진";
  if (reason.includes("검증에서 전부 탈락")) return "후보가 검증에서 탈락";
  if (reason.includes("호출 실패")) return "LLM 호출 실패";
  if (reason.includes("참조 편입")) return "위험요소가 참조 편입";
  if (reason.includes("청크 0건") || reason.includes("섹션")) return "위험 섹션 추출 실패";
  if (reason.includes("소스가 없음") || reason.includes("공시 위험요소 소스가 없음")) return "공시 소스 없는 자산(코인 등)";
  if (reason.includes("CIK") || reason.includes("종목코드") || reason.includes("API_KEY")) return "식별자·키 부재";
  return reason.slice(0, 28);
}

export async function buildRiskCoverage(): Promise<RiskCoverage> {
  const [universe, records] = await Promise.all([loadFundamentalsUniverse(), readAllSymbolRisks()]);

  const unavailableReasons: Record<string, number> = {};
  const sourceKinds: Record<string, number> = {};
  const byMarket: RiskCoverage["byMarket"] = {};
  let withItems = 0;
  let items = 0;

  for (const record of records) {
    const market = record.market || "(미기록)";
    const bucket = (byMarket[market] ??= { n: 0, withItems: 0, items: 0 });
    bucket.n += 1;
    if (record.items.length > 0) {
      withItems += 1;
      items += record.items.length;
      bucket.withItems += 1;
      bucket.items += record.items.length;
      for (const item of record.items) sourceKinds[item.source_kind] = (sourceKinds[item.source_kind] ?? 0) + 1;
      continue;
    }
    // 항목 0건인데 사유가 없으면 그 자체가 이상 신호다 — 조용히 넘기지 않고 세어 둔다.
    const key = record.unavailable_reason ? reasonBucket(record.unavailable_reason) : "사유 미기록(이상)";
    unavailableReasons[key] = (unavailableReasons[key] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    universe: universe.length,
    records: records.length,
    withItems,
    ratePct: universe.length > 0 ? (withItems / universe.length) * 100 : null,
    items,
    untouched: Math.max(0, universe.length - records.length),
    unavailableReasons,
    sourceKinds,
    byMarket,
  };
}
