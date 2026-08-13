import { asBusinessInvalidationOutcome, type BusinessInvalidationOutcome } from "./business-invalidation-judge";
import { prisma } from "../prisma";
import { kstDate } from "../fomo";
import { readLedgerSelections } from "../judgment-ledger";
import { asOutcome } from "../ledger-track-record";

/**
 * 무효 조건 집계 (WO-SUB-07 §8 "무효 조건" 블록).
 *
 * 성적표에 두 줄을 낸다: **가격 무효선 도달률**과 **사업 무효 도달률**.
 *
 * ## 판정 불가를 분모에서 빼지 않는다
 *
 * §6-4 규칙이다. 판정 못 한 건을 분모에서 빼면 비율이 조용히 좋아진다. 셋을 모두 세고
 * 화면에 함께 낸다 — `충족 / 미충족 / 판정 불가`.
 *
 * ## 표본 수를 항상 병기한다
 *
 * §8 요구. n 이 작으면 작다고 보여야 한다. 비율만 내면 n=3 의 33% 와 n=300 의 33% 가 같아 보인다.
 *
 * ## 생존 편향 (§6-5)
 *
 * 폐지·정지 종목을 **집계에서 빼지 않는다.** 이 집계는 원장의 발행 레코드를 분모로 삼고,
 * 발행분은 그 종목이 이후 사라져도 원장에 남는다 — 분모가 줄지 않는 것이 설계다.
 * 가격 무효선 도달은 `outcome` 수익률 레코드가 아니라 **발행 시점 무효선과 이후 관측**으로
 * 판정하므로, 상장폐지로 가격이 끊긴 종목은 `판정 불가`로 남고 분모에 그대로 있다.
 */

export interface InvalidationMetric {
  /** 분모 — 그 조건이 박힌 발행 수. 판정 불가도 포함한다. */
  n: number;
  reached: number;
  notReached: number;
  /** 판정하지 못한 수. 미충족으로 세지 않는다. */
  undetermined: number;
  /** `reached / n`. n 이 0 이면 null — 0% 로 쓰지 않는다. */
  rate: number | null;
}

export interface InvalidationSummary {
  generatedAt: string;
  /** 가격 무효선 — 발행 시점에 무효선이 박힌 건만 분모. */
  price: InvalidationMetric;
  /** 사업 무효 조건 — 06 이후 발행분만 조건이 박힌다. */
  business: InvalidationMetric;
  /**
   * 사업 무효 판정 불가 사유 분포. 무엇이 막고 있는지 보인다 —
   * "대손 수집 미배선" 같은 항목이 여기 뜨면 그게 다음 작업이다.
   */
  businessUndeterminedReasons: Record<string, number>;
  /** 룰셋 버전 분포(§7) — 버전이 다른 판정을 섞어 집계하지 않기 위한 표기. */
  rulesetVersions: Record<string, number>;
}

function metric(reached: number, notReached: number, undetermined: number): InvalidationMetric {
  const n = reached + notReached + undetermined;
  return { n, reached, notReached, undetermined, rate: n > 0 ? (reached / n) * 100 : null };
}

/**
 * 사유 문자열을 그대로 키로 쓰면 종류가 폭발한다 — 앞머리로 묶는다.
 *
 * ## "수집" 이라는 단어로 묶지 않는다
 *
 * 종전에는 사유에 `수집` 이 있으면 전부 `지표 수집 미배선` 으로 묶었다. 대손 수집이 배선된 뒤
 * (WO-SUB-CLOSE PART A) 그 사유가 "관측 0건(비은행이거나 SEC **수집** 실패)" 로 바뀌었는데,
 * `수집` 이 들어 있다는 이유로 여전히 **미배선**으로 묶였다 — **배선된 것을 화면이 미배선이라고
 * 말했다.** 원인 분포는 다음 작업을 정하는 데 쓰이므로, 이 오라벨은 이미 한 일을 다시 하게 만든다.
 *
 * 그래서 **파이프라인 부재는 `미배선` 이라는 말로만** 판정한다. 순서도 중요하다 —
 * 관측 부족이 먼저 걸러져야 "관측 0건(… 수집 실패)" 가 미배선으로 새지 않는다.
 */
function reasonBucket(reason: string | null): string {
  if (!reason) return "기타";
  if (reason.includes("스냅샷")) return "직전 스냅샷 필요";
  if (reason.includes("관측") || reason.includes("분기 부족")) return "관측 부족";
  if (reason.includes("팩트시트")) return "팩트시트 없음";
  if (reason.includes("미배선")) return "지표 수집 미배선";
  return reason.slice(0, 24);
}

export async function readInvalidationSummary(options: { lookbackDays?: number } = {}): Promise<InvalidationSummary> {
  const today = kstDate();
  const lookback = options.lookbackDays ?? 400;
  const fromDate = new Date(Date.parse(`${today}T00:00:00Z`) - lookback * 86_400_000).toISOString().slice(0, 10);

  const [selections, outcomeRows] = await Promise.all([
    readLedgerSelections({ fromDate, take: 5_000 }),
    prisma.judgmentLedger.findMany({
      where: { kind: "outcome", date: { gte: fromDate } },
      select: { payload: true },
      take: 20_000,
    }),
  ]);

  const judgments = new Map<string, BusinessInvalidationOutcome>();
  /** 발행 → 이후 평가가 목록. 수익률 outcome 이 창별로 하나씩 있으므로 창 수만큼 쌓인다. */
  const pricesBySelection = new Map<string, number[]>();
  for (const row of outcomeRows) {
    const business = asBusinessInvalidationOutcome(row.payload);
    if (business) {
      judgments.set(business.selectionId, business);
      continue;
    }
    const outcome = asOutcome(row.payload);
    if (!outcome || outcome.selectedPrice <= 0) continue;
    const evaluated = outcome.selectedPrice * (1 + outcome.returnPct / 100);
    const list = pricesBySelection.get(outcome.selectionId) ?? [];
    list.push(evaluated);
    pricesBySelection.set(outcome.selectionId, list);
  }

  const rulesetVersions: Record<string, number> = {};
  const businessUndeterminedReasons: Record<string, number> = {};
  let businessReached = 0;
  let businessNot = 0;
  let businessUndetermined = 0;
  let priceReached = 0;
  let priceNot = 0;
  let priceUndetermined = 0;

  for (const selection of selections) {
    const stamp = selection.payload.publication;
    if (!stamp) continue;
    const version = stamp.ruleset_version ?? "(없음)";
    rulesetVersions[version] = (rulesetVersions[version] ?? 0) + 1;

    /**
     * 가격 무효선 — 발행 시점에 무효선이 박힌 건만 분모.
     *
     * **방향은 무효선의 위치가 정한다.** 스탬프에 direction 필드가 없으므로 추정하지 않고
     * 기하학으로 읽는다: 무효선이 발행가보다 **아래**면 이탈은 아래로(하방 무효선), 위면 위로.
     * 이건 추정이 아니라 무효선의 정의다.
     *
     * 도달 여부는 **이후 관측**으로만 판정한다. 발행 시점 값끼리 비교하면 아무것도 재지 않는다.
     * 관측은 수익률 outcome 이 갖고 있고(평가가 = 발행가 × (1 + 수익률)), 없으면 판정 불가다 —
     * 상장폐지로 가격이 끊긴 종목이 여기 남는다(§6-5: 분모에서 빼지 않는다).
     */
    if (typeof stamp.invalidation_price === "number" && stamp.reference_price > 0) {
      const level = stamp.invalidation_price;
      const downside = level < stamp.reference_price;
      const observed = pricesBySelection.get(selection.id) ?? [];
      if (observed.length === 0) priceUndetermined += 1;
      else if (observed.some((price) => (downside ? price <= level : price >= level))) priceReached += 1;
      else priceNot += 1;
    }

    if (!stamp.invalidation_business_rule) continue;
    const judgment = judgments.get(selection.id);
    if (!judgment) {
      businessUndetermined += 1;
      businessUndeterminedReasons["아직 판정 전"] = (businessUndeterminedReasons["아직 판정 전"] ?? 0) + 1;
      continue;
    }
    if (judgment.verdict === "invalidated") businessReached += 1;
    else if (judgment.verdict === "holding") businessNot += 1;
    else {
      businessUndetermined += 1;
      const bucket = reasonBucket(judgment.reason);
      businessUndeterminedReasons[bucket] = (businessUndeterminedReasons[bucket] ?? 0) + 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    price: metric(priceReached, priceNot, priceUndetermined),
    business: metric(businessReached, businessNot, businessUndetermined),
    businessUndeterminedReasons,
    rulesetVersions,
  };
}
