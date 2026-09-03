import { josa } from "./josa";
import { sectorDisplayName } from "./sector-display";

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
  /**
   * **화면에 나가는 이름은 표시명이다**(FLOW-01 §A-1). 분류 원문(`반도체와반도체장비`)은
   * 카드 폭을 넘겨 `반도체와반...` 으로 잘렸다. 자르는 대신 짧은 이름을 쓴다.
   * 집계·조인은 여전히 `pair.*.sector` 원문으로 한다 — 표시만 바꾼다.
   */
  const fromName = sectorDisplayName(pair.from.sector);
  const toName = sectorDisplayName(pair.to.sector);
  /**
   * **조사를 받침 따라 붙인다.** 고정 `으로` 를 쓰면 `전자장비와기기으로` 가 나온다
   * (2026-08-29 프로덕션 실측). 업종 이름은 받침이 있는 것과 없는 것이 섞여 있어
   * 고정 조사는 **반드시** 어딘가에서 틀린다 — 이 레포에서 세 번째다.
   * 표시명으로 바꾼 뒤에도 같다: 조사는 **표시명 기준**으로 붙여야 맞다.
   */
  const to = `${toName}${josa(toName, "으로")}`;
  return `${fromName}에서 돈이 빠지고\n${to} 들어오고 있어요`;
}

/**
 * 보조 줄 — **창과 주체 한 줄뿐이다.**
 *
 * 종전에는 여기서 양쪽 금액도 같이 냈다. 그런데 카드의 막대가 **이미 그 숫자를 옆에
 * 적고 있다**(FLOW-01 §B-2 이후) — 같은 금액이 한 카드에 두 번 나왔다.
 * `macroSupport` 가 같은 이유로 값 줄을 내려놓은 것과 같은 판단이다:
 * **값은 그림이 그리고, 이 줄은 무엇을 기준으로 잰 것인지만 말한다.**
 *
 * 숫자를 숨기는 것이 아니다 — 자리를 옮긴 것이다. 상세 1걸음은 여섯 업종의 금액을
 * 전부 보여준다.
 */
export function flowSupport(pair: FlowPair): string[] {
  return [`최근 ${pair.windowDays}거래일 · 외국인·기관 기준`];
}

/* ────────────────────────────────────────────────────────────────────────────
   상세 다섯 걸음 (DETAIL-01 PART B)

   카드는 한 쌍만 말한다. 상세는 **그 한 쌍이 전부가 아님을 보여주는 자리**다 —
   빠진 곳 셋 · 들어온 곳 셋, 그리고 어떤 종목이었는지까지.

   업종 이름만 보고 나가면 이 카드는 쓸모없다(§B). 2걸음이 이 화면의 존재 이유다.
   ──────────────────────────────────────────────────────────────────────────── */

/** 상세 1걸음 — 업종 한 줄. */
export interface FlowSectorRow {
  /** 집계 원문 — 조인 키다. 화면은 `displayName` 을 쓴다. */
  sector: string;
  net: number;
  stocks: number;
}

/** 상세 2·3걸음 — 종목 한 줄. */
export interface FlowStockRow {
  code: string;
  /** 사람이 읽는 이름. 못 찾으면 비운다 — 코드를 이름 자리에 쓰지 않는다. */
  name?: string;
  /** 창 안 순매수 합(원). */
  net: number;
  /** 20일 평균 거래량 대비 배수. 이력이 모자라면 없다(지어내지 않는다). */
  volumeRatio?: number;
}

/** 상세 4걸음 — 하루치. */
export interface FlowDayRow {
  date: string;
  net: number;
}

export interface FlowDepth {
  /** 많이 빠진 순 — 최대 3. */
  outflows: FlowSectorRow[];
  /** 많이 들어온 순 — 최대 3. */
  inflows: FlowSectorRow[];
  /** 빠진 업종에서 가장 많이 판 종목 — 최대 5. */
  fromStocks: FlowStockRow[];
  /** 들어온 업종에서 가장 많이 산 종목 — 최대 5. */
  toStocks: FlowStockRow[];
  /**
   * 들어온 업종에서 거래가 실제로 붙은 종목 — 최대 5.
   * **비어 있는 것도 정보다**(§D-4): 돈은 들어오는데 거래는 평소와 비슷하다는 뜻이다.
   */
  toVolumeStocks: FlowStockRow[];
  /** 들어온 업종의 일별 순매수 — 최대 20거래일, 오래된 것부터. */
  toDaily: FlowDayRow[];
  /** 위 창에서 순매수였던 날 수 — "20일 중 14일" 문장의 근거. */
  toPositiveDays: number;
}

/** 상세 목록 상한. 더 보여줘도 읽히지 않는다. */
export const FLOW_DEPTH_SECTORS = 3;
export const FLOW_DEPTH_STOCKS = 5;
export const FLOW_DEPTH_DAYS = 20;
/** 거래가 "붙었다"고 볼 배수 — 평소의 1.5배. 이 아래는 조용히 산 것이다(§D-4). */
export const FLOW_VOLUME_ATTACHED_RATIO = 1.5;

function topByNet(rows: readonly FlowStockRow[], count: number, direction: "buy" | "sell"): FlowStockRow[] {
  const filtered = rows.filter((row) => (direction === "buy" ? row.net > 0 : row.net < 0));
  filtered.sort((a, b) => (direction === "buy" ? b.net - a.net : a.net - b.net));
  return filtered.slice(0, count);
}

/**
 * 다섯 걸음 재료를 한 번에 만든다. 순수 함수 — 부르는 쪽이 창을 잘라서 넘긴다.
 *
 * @param windowRows  카드 창(3·5·20일) 안의 행. 1~3걸음이 쓴다.
 * @param dailyRows   20거래일 창의 행. 4걸음 전용 — 카드 창이 3일이어도 추세는 20일로 본다.
 * @param nameByCode  종목코드 → 이름. 없는 코드는 이름 없이 간다.
 * @param volumeRatioByCode 종목코드 → 20일 평균 대비 거래량 배수.
 */
export function buildFlowDepth(
  pair: FlowPair,
  windowRows: readonly FlowRow[],
  dailyRows: readonly FlowRow[],
  flows: readonly SectorFlow[],
  sectorByCode: Readonly<Record<string, string>>,
  nameByCode: Readonly<Record<string, string>> = {},
  volumeRatioByCode: Readonly<Record<string, number>> = {}
): FlowDepth {
  // 얇은 업종은 상세에서도 뺀다 — 카드와 같은 기준이어야 표가 서로를 배신하지 않는다.
  const usable = flows.filter((f) => f.stocks >= FLOW_MIN_STOCKS && f.days > 0);
  const sorted = [...usable].sort((a, b) => b.net - a.net);
  const inflows = sorted.filter((f) => f.net > 0).slice(0, FLOW_DEPTH_SECTORS);
  const outflows = sorted
    .filter((f) => f.net < 0)
    .sort((a, b) => a.net - b.net)
    .slice(0, FLOW_DEPTH_SECTORS);
  const row = (f: SectorFlow): FlowSectorRow => ({ sector: f.sector, net: f.net, stocks: f.stocks });

  /** 업종 하나의 종목별 합. */
  const byStock = (sector: string): FlowStockRow[] => {
    const net = new Map<string, number>();
    for (const r of windowRows) {
      if (sectorByCode[r.code] !== sector || !Number.isFinite(r.net)) continue;
      net.set(r.code, (net.get(r.code) ?? 0) + r.net);
    }
    return [...net.entries()].map(([code, value]) => ({
      code,
      net: value,
      ...(nameByCode[code] ? { name: nameByCode[code]! } : {}),
      ...(typeof volumeRatioByCode[code] === "number" ? { volumeRatio: volumeRatioByCode[code]! } : {}),
    }));
  };

  const fromAll = byStock(pair.from.sector);
  const toAll = byStock(pair.to.sector);

  /** 4걸음 — 들어온 업종의 일별 합. 20거래일 창을 쓴다(카드 창이 3일이어도). */
  const byDate = new Map<string, number>();
  for (const r of dailyRows) {
    if (sectorByCode[r.code] !== pair.to.sector || !Number.isFinite(r.net)) continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.net);
  }
  const toDaily = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-FLOW_DEPTH_DAYS)
    .map(([date, net]) => ({ date, net }));

  return {
    outflows: outflows.map(row),
    inflows: inflows.map(row),
    fromStocks: topByNet(fromAll, FLOW_DEPTH_STOCKS, "sell"),
    toStocks: topByNet(toAll, FLOW_DEPTH_STOCKS, "buy"),
    // 산 종목 중 거래도 붙은 것만. 배수 순 — 금액 순으로 정렬하면 3걸음이 2걸음과 같아진다.
    toVolumeStocks: toAll
      .filter((s) => s.net > 0 && typeof s.volumeRatio === "number" && s.volumeRatio >= FLOW_VOLUME_ATTACHED_RATIO)
      .sort((a, b) => (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0))
      .slice(0, FLOW_DEPTH_STOCKS),
    toDaily,
    toPositiveDays: toDaily.filter((d) => d.net > 0).length,
  };
}
