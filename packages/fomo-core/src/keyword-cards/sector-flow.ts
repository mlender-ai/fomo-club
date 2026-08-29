/**
 * WO-RESET-08 §A-1 — **업종 간 자금 이동.** 순수 함수(네트워크·시간·난수 0).
 *
 * ## 왜 이 카드가 필요한가
 *
 * 지금 카드는 전부 종목 한 개 이야기라 "지금 시장이 어떻게 돌아가나" 를 알 수 없다.
 * **돈이 어디서 빠져 어디로 가는지는 그 자체로 이야기다.**
 *
 * ## 인과로 말하지 않는다 (§E-1)
 *
 * ```
 * 안 됨   반도체 자금이 방산으로 이동했어요     ← 같은 돈이라는 단정
 * 좋음    반도체에서 돈이 빠지고, 방산으로 들어오고 있어요
 * ```
 *
 * 같은 돈인지 우리는 모른다. **두 사실을 나란히 말한다.** 이 파일의 문장이 전부 그 규칙을 따른다.
 */

/** 한 종목의 하루 순매수(외국인+기관, 원). */
export interface FlowRow {
  /** `YYYY-MM-DD`. */
  date: string;
  /** 종목코드. */
  code: string;
  /** 외국인+기관 순매수 금액(원). 음수는 순매도. */
  net: number;
}

/** 업종 하나의 집계. */
export interface SectorFlow {
  sector: string;
  /** 창 안 순매수 합(원). */
  net: number;
  /** 집계에 들어간 종목 수 — 얇으면 카드를 만들지 않는다. */
  stocks: number;
  /** 순매수였던 날 수 / 창 길이 — 방향이 유지됐는지 본다. */
  positiveDays: number;
  days: number;
}

/**
 * 업종 하나가 집계에 쓰이려면 필요한 최소 종목 수.
 *
 * 두 종목짜리 업종의 합계는 사실상 **한 종목 이야기**다. 그걸 「업종에 돈이 들어온다」고
 * 말하면 업종 카드가 아니라 종목 카드를 업종인 척 포장한 것이 된다.
 */
export const FLOW_MIN_STOCKS = 5;

/** 방향이 유지됐다고 볼 최소 비율 — 창의 절반 넘게 같은 방향이어야 한다(§D-2). */
export const FLOW_DIRECTION_RATIO = 0.6;

/**
 * 창별 집계. `rows` 는 **창 안의 날짜만** 들어 있어야 한다(자르는 것은 부르는 쪽 몫).
 *
 * 업종을 못 찾은 종목은 **버리고 센다**(§E-3) — 분류가 틀리면 카드가 통째로 거짓이 되므로,
 * 모르는 종목을 「기타」로 묶지 않는다.
 */
export function aggregateSectorFlow(
  rows: readonly FlowRow[],
  sectorByCode: Readonly<Record<string, string>>
): { flows: SectorFlow[]; unclassified: number } {
  const bySector = new Map<string, { net: number; codes: Set<string>; byDate: Map<string, number> }>();
  let unclassified = 0;

  for (const row of rows) {
    const sector = sectorByCode[row.code];
    if (!sector) { unclassified += 1; continue; }
    if (!Number.isFinite(row.net)) continue;
    const bucket = bySector.get(sector) ?? { net: 0, codes: new Set<string>(), byDate: new Map<string, number>() };
    bucket.net += row.net;
    bucket.codes.add(row.code);
    bucket.byDate.set(row.date, (bucket.byDate.get(row.date) ?? 0) + row.net);
    bySector.set(sector, bucket);
  }

  const flows: SectorFlow[] = [];
  for (const [sector, bucket] of bySector) {
    const dates = [...bucket.byDate.values()];
    flows.push({
      sector,
      net: bucket.net,
      stocks: bucket.codes.size,
      positiveDays: dates.filter((v) => v > 0).length,
      days: dates.length,
    });
  }
  flows.sort((a, b) => b.net - a.net);
  return { flows, unclassified };
}

/** 흐름 카드 한 장의 재료. */
export interface FlowPair {
  /** 가장 많이 빠진 업종. */
  from: SectorFlow;
  /** 가장 많이 들어온 업종. */
  to: SectorFlow;
  /** 창 길이(거래일). */
  windowDays: number;
}

/**
 * From/To 를 고른다. 조건을 못 채우면 `null` — **아무 날에나 만들지 않는다**(§D-2).
 *
 * @param minNet 이 금액을 넘어야 카드가 된다(원). 임계는 실측 분포로 정한다.
 */
export function pickFlowPair(
  flows: readonly SectorFlow[],
  windowDays: number,
  minNet: number
): FlowPair | null {
  const usable = flows.filter((f) => f.stocks >= FLOW_MIN_STOCKS && f.days > 0);
  if (usable.length < 2) return null;

  const to = usable[0]!;
  const from = usable[usable.length - 1]!;
  if (!(to.net >= minNet) || !(from.net <= -minNet)) return null;

  /**
   * 방향이 유지됐는가 — 하루 몰빵으로 만들어진 합계는 흐름이 아니다.
   * 들어온 쪽은 순매수 날이, 빠진 쪽은 순매도 날이 창의 절반을 넘어야 한다.
   */
  if (to.positiveDays / to.days < FLOW_DIRECTION_RATIO) return null;
  if ((from.days - from.positiveDays) / from.days < FLOW_DIRECTION_RATIO) return null;
  return { from, to, windowDays };
}

/** `820000000000` → `8,200억`. 조 단위는 조로 읽는다. */
export function formatKrwShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "+";
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}조`;
  if (abs >= 100_000_000) return `${sign}${Math.round(abs / 100_000_000).toLocaleString("en-US")}억`;
  return `${sign}${Math.round(abs / 10_000).toLocaleString("en-US")}만`;
}

/**
 * 카드 결론 — **두 사실을 나란히**(§E-1).
 *
 * `이동했어요` 를 쓰지 않는다. 같은 돈인지 모르기 때문이다.
 */
export function flowHook(pair: FlowPair): string {
  return `${pair.from.sector}에서 돈이 빠지고\n${pair.to.sector}으로 들어오고 있어요`;
}

/** 보조 줄 — 창·주체·양쪽 금액. 숫자를 숨기지 않는다. */
export function flowSupport(pair: FlowPair): string[] {
  return [
    `최근 ${pair.windowDays}거래일 · 외국인·기관 기준`,
    `${pair.from.sector} ${formatKrwShort(pair.from.net)} · ${pair.to.sector} ${formatKrwShort(pair.to.net)}`,
  ];
}
