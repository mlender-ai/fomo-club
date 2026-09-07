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
 *
 * ## 한 쌍만 말하지 않는다 (FLOW-02 §E)
 *
 * 같은 데이터에서 **여러 이야기**가 나온다 — 업종 간 이동 하나로는 "저기서 저기로만 갔다"
 * 는 인상을 준다. 그래서 네 종류를 만든다.
 *
 * ```
 * rotation        반도체에서 돈이 빠지고 전자부품으로 들어오고 있어요
 * concentration   방산에 5거래일째 돈이 들어오고 있어요
 * persistent      반도체에서 12거래일째 돈이 빠지고 있어요
 * reversal        15거래일 만에 처음 반도체로 돈이 들어왔어요
 * ```
 *
 * 넷 다 **같은 원장**(업종별 일별 순매수)에서 나온다. 새 데이터를 들이지 않았다.
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

/** 흐름 카드 한 장의 재료 — 업종 간 이동. */
export interface FlowPair {
  /** 가장 많이 빠진 업종. */
  from: SectorFlow;
  /** 가장 많이 들어온 업종. */
  to: SectorFlow;
  /** 창 길이(거래일). */
  windowDays: number;
}

/**
 * 흐름 카드 한 장의 재료 — **한 업종 이야기**(FLOW-02 §E).
 *
 * 업종 간 이동은 두 업종을 나란히 놓지만, 이 셋은 한 업종의 **시간**을 말한다.
 * 그래서 창이 고정된 3·5·20일이 아니라 **연속이 이어진 만큼**이다.
 */
export interface FlowStreak {
  /** 그 업종의 연속 구간 집계. */
  flow: SectorFlow;
  /** 들어오는 중인가 빠지는 중인가. */
  direction: "in" | "out";
  /** 같은 방향이 이어진 연속 거래일 수 — 이 카드의 창이다. */
  windowDays: number;
  /** 연속의 첫 거래일 `YYYY-MM-DD` — 부르는 쪽이 상세 창을 자를 때 쓴다. */
  since: string;
  /** 방향 전환에서 되짚은 창(거래일). **그 창에는 같은 방향 날이 하나도 없었다.** */
  lookbackDays?: number;
}

/** 카드 종류(§E). 종류가 하나면 "저기서 저기로만 갔다" 는 인상을 준다. */
export type FlowCardKind = "rotation" | "concentration" | "persistent" | "reversal";

/**
 * 카드 한 장의 재료. 종류로 갈린다 —
 * `rotation` 만 두 업종이고 나머지는 한 업종이다.
 */
export type FlowStory =
  | ({ kind: "rotation" } & FlowPair)
  | ({ kind: "concentration" | "persistent" | "reversal" } & FlowStreak);

/** 그 이야기가 짚는 업종 전부 — 같은 업종으로 두 장 만들지 않으려고 부르는 쪽이 쓴다. */
export function storySectors(story: FlowStory): string[] {
  return story.kind === "rotation" ? [story.from.sector, story.to.sector] : [story.flow.sector];
}

/** 이야기의 **초점** 업종 — 일별 막대와 즐겨찾기가 이걸 쓴다. */
export function storyFocus(story: FlowStory): { sector: string; direction: "in" | "out" } {
  return story.kind === "rotation"
    ? { sector: story.to.sector, direction: "in" }
    : { sector: story.flow.sector, direction: story.direction };
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

/* ────────────────────────────────────────────────────────────────────────────
   한 업종 이야기 고르기 (FLOW-02 PART E)

   전부 **업종별 일별 순매수** 하나에서 나온다. 새 소스를 들이지 않았다.
   ──────────────────────────────────────────────────────────────────────────── */

/** 업종 하나의 일별 순매수 — 오래된 것부터. */
export interface SectorDailyFlow {
  sector: string;
  /** 오래된 것부터. 거래가 없는 날은 없다(행이 없으면 날짜도 없다). */
  days: FlowDayRow[];
  /** 그 업종에서 집계에 들어간 종목 수. */
  stocks: number;
}

/**
 * 연속으로 볼 최소 거래일 수.
 *
 * 셋은 우연히 자주 나온다(방향이 무작위라도 8분의 1). **넷부터 이야기로 본다** —
 * 하루 몰빵을 거르는 `FLOW_DIRECTION_RATIO` 와 같은 취지의 다른 잣대다.
 */
export const FLOW_STREAK_MIN_DAYS = 4;
/** 방향 전환에서 되짚는 창(거래일) — 이만큼 반대 방향뿐이었어야 「처음」이라고 말한다. */
export const FLOW_REVERSAL_LOOKBACK_DAYS = 15;
/** 방향 전환으로 볼 최대 연속일 — 이보다 길면 그건 이미 「집중」이다. */
export const FLOW_REVERSAL_MAX_DAYS = 2;

/** 업종별 일별 순매수. 창을 자르는 것은 부르는 쪽 몫이다. */
export function sectorDailyFlows(
  rows: readonly FlowRow[],
  sectorByCode: Readonly<Record<string, string>>
): SectorDailyFlow[] {
  const bySector = new Map<string, { byDate: Map<string, number>; codes: Set<string> }>();
  for (const row of rows) {
    const sector = sectorByCode[row.code];
    if (!sector || !Number.isFinite(row.net)) continue;
    const bucket = bySector.get(sector) ?? { byDate: new Map<string, number>(), codes: new Set<string>() };
    bucket.byDate.set(row.date, (bucket.byDate.get(row.date) ?? 0) + row.net);
    bucket.codes.add(row.code);
    bySector.set(sector, bucket);
  }
  return [...bySector.entries()].map(([sector, bucket]) => ({
    sector,
    days: [...bucket.byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, net]) => ({ date, net })),
    stocks: bucket.codes.size,
  }));
}

/** 끝에서부터 같은 방향이 이어진 구간. 방향이 끊기면 멈춘다. */
function tailStreak(days: readonly FlowDayRow[], direction: "in" | "out"): FlowDayRow[] {
  const out: FlowDayRow[] = [];
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i]!;
    const sameWay = direction === "in" ? day.net > 0 : day.net < 0;
    if (!sameWay) break;
    out.unshift(day);
  }
  return out;
}

/** 연속 구간을 `SectorFlow` 로 — 카드가 말하는 금액은 **그 구간의 합**이다. */
function streakFlow(daily: SectorDailyFlow, streak: readonly FlowDayRow[], direction: "in" | "out"): FlowStreak | null {
  const first = streak[0];
  if (!first) return null;
  const net = streak.reduce((sum, d) => sum + d.net, 0);
  return {
    flow: {
      sector: daily.sector,
      net,
      stocks: daily.stocks,
      positiveDays: direction === "in" ? streak.length : 0,
      days: streak.length,
    },
    direction,
    windowDays: streak.length,
    since: first.date,
  };
}

/**
 * **한 곳 집중** — 연속으로 들어오고 있는 업종 하나(§E 표 2행).
 *
 * `에만` 이라고 쓰지 않는다. 우리가 아는 것은 「가장 오래·많이 들어온 곳」이고
 * 「거기에만 들어왔다」는 아니다 — 다른 업종에도 들어왔을 수 있다.
 */
export function pickConcentration(dailies: readonly SectorDailyFlow[], minNet: number): FlowStory | null {
  const candidates: FlowStreak[] = [];
  for (const daily of dailies) {
    if (daily.stocks < FLOW_MIN_STOCKS) continue;
    const streak = tailStreak(daily.days, "in");
    if (streak.length < FLOW_STREAK_MIN_DAYS) continue;
    const made = streakFlow(daily, streak, "in");
    if (!made || made.flow.net < minNet) continue;
    candidates.push(made);
  }
  if (candidates.length === 0) return null;
  // 오래 이어진 것 우선, 같으면 금액 큰 것. 「5거래일째」가 이 카드의 이야기다.
  candidates.sort((a, b) => b.windowDays - a.windowDays || b.flow.net - a.flow.net);
  return { kind: "concentration", ...candidates[0]! };
}

/** **오래된 흐름** — 연속으로 빠지고 있는 업종 하나(§E 표 5행). */
export function pickPersistentOutflow(dailies: readonly SectorDailyFlow[], minNet: number): FlowStory | null {
  const candidates: FlowStreak[] = [];
  for (const daily of dailies) {
    if (daily.stocks < FLOW_MIN_STOCKS) continue;
    const streak = tailStreak(daily.days, "out");
    if (streak.length < FLOW_STREAK_MIN_DAYS) continue;
    const made = streakFlow(daily, streak, "out");
    if (!made || made.flow.net > -minNet) continue;
    candidates.push(made);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.windowDays - a.windowDays || a.flow.net - b.flow.net);
  return { kind: "persistent", ...candidates[0]! };
}

/**
 * **방향 전환** — 오래 빠지던 업종에 처음 들어온 날(§E 표 6행).
 *
 * 「처음」은 무거운 말이다. 그래서 되짚은 창(`lookbackDays`)에 **들어온 날이 하나도
 * 없었을 때만** 쓴다. 창을 벗어난 과거는 우리가 안 본 것이므로 카드도 창을 밝힌다.
 */
export function pickReversal(dailies: readonly SectorDailyFlow[], minNet: number): FlowStory | null {
  const candidates: FlowStreak[] = [];
  for (const daily of dailies) {
    if (daily.stocks < FLOW_MIN_STOCKS) continue;
    const streak = tailStreak(daily.days, "in");
    if (streak.length === 0 || streak.length > FLOW_REVERSAL_MAX_DAYS) continue;
    const before = daily.days.slice(0, daily.days.length - streak.length);
    const lookback = before.slice(-FLOW_REVERSAL_LOOKBACK_DAYS);
    // 되짚을 만큼 이력이 없으면 「처음」을 말할 수 없다.
    if (lookback.length < FLOW_REVERSAL_LOOKBACK_DAYS) continue;
    if (lookback.some((d) => d.net > 0)) continue;
    const made = streakFlow(daily, streak, "in");
    if (!made || made.flow.net < minNet) continue;
    candidates.push({ ...made, lookbackDays: lookback.length });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.flow.net - a.flow.net);
  return { kind: "reversal", ...candidates[0]! };
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
 *
 * **화면에 나가는 이름은 표시명이다**(FLOW-01 §A-1). 분류 원문(`반도체와반도체장비`)은
 * 카드 폭을 넘겨 `반도체와반...` 으로 잘렸다. 자르는 대신 짧은 이름을 쓴다.
 * 집계·조인은 여전히 원문으로 한다 — 표시만 바꾼다.
 *
 * **조사를 받침 따라 붙인다.** 고정 `으로` 를 쓰면 `전자장비와기기으로` 가 나온다
 * (2026-08-29 프로덕션 실측). 업종 이름은 받침이 있는 것과 없는 것이 섞여 있어
 * 고정 조사는 **반드시** 어딘가에서 틀린다 — 이 레포에서 세 번째다.
 * 표시명으로 바꾼 뒤에도 같다: 조사는 **표시명 기준**으로 붙여야 맞다.
 */
export function flowHook(story: FlowStory): string {
  if (story.kind === "rotation") {
    const fromName = sectorDisplayName(story.from.sector);
    const toName = sectorDisplayName(story.to.sector);
    const to = `${toName}${josa(toName, "으로")}`;
    return `${fromName}에서 돈이 빠지고\n${to} 들어오고 있어요`;
  }
  const name = sectorDisplayName(story.flow.sector);
  if (story.kind === "concentration") {
    return `${name}에 ${story.windowDays}거래일째\n돈이 들어오고 있어요`;
  }
  if (story.kind === "persistent") {
    return `${name}에서 ${story.windowDays}거래일째\n돈이 빠지고 있어요`;
  }
  const to = `${name}${josa(name, "으로")}`;
  return `${story.lookbackDays ?? FLOW_REVERSAL_LOOKBACK_DAYS}거래일 만에 처음\n${to} 돈이 들어왔어요`;
}

/** 카드 맨 위 라벨 — 종목 카드가 아니라는 것을 먼저 밝힌다(§B-4). */
export function flowEyebrow(kind: FlowCardKind): string {
  if (kind === "concentration") return "한 곳으로 돈이 모이고 있어요";
  if (kind === "persistent") return "돈이 계속 빠지고 있어요";
  if (kind === "reversal") return "방향이 바뀌었어요";
  return "돈이 옮겨가고 있어요";
}

/** 카드 한 줄에 넣는 대표 종목 수(§C-1) — **둘만**. 이름이 보이면 누르고 싶어진다. */
export const FLOW_CARD_STOCK_NAMES = 2;

/**
 * **카드에도 종목 이름을 한 줄 넣는다**(FLOW-02 §C-1).
 *
 * ```
 * 없을 때   전기장비에서 돈이 빠지고 무역으로 들어오고 있어요   ← 어떤 회사인지 모른다
 * 있을 때   LG이노텍 · 삼성전기 등을 사고 있어요
 * ```
 *
 * WO 가 이걸 「가장 중요하다」고 했다 — 업종 이름만 보고 나가면 이 카드는 쓸모없다.
 * 상세 2걸음이 본체지만, **눌러야 보이는 것은 안 본 것과 같다.**
 *
 * 이름이 없는 줄은 버린다 — 종목코드는 사람이 읽는 이름이 아니다. 그래서 이름을 못 찾은
 * 날에는 `null` 이다(코드를 이름 자리에 쓰지 않는다).
 */
export function flowStockLine(stocks: readonly FlowStockRow[], direction: "in" | "out"): string | null {
  const named = stocks.filter((row) => (row.name ?? "").trim().length > 0).slice(0, FLOW_CARD_STOCK_NAMES);
  if (named.length === 0) return null;
  const names = named.map((row) => row.name!).join(" · ");
  return `${names} 등을 ${direction === "in" ? "사고" : "팔고"} 있어요`;
}

/**
 * 보조 줄 — **기준과 대표 종목.**
 *
 * 종전에는 여기서 양쪽 금액도 같이 냈다. 그런데 카드의 막대가 **이미 그 숫자를 옆에
 * 적고 있다**(FLOW-01 §B-2 이후) — 같은 금액이 한 카드에 두 번 나왔다.
 * **값은 그림이 그리고, 이 줄은 무엇을 기준으로 잰 것인지 말한다.**
 *
 * 여기에 대표 종목 줄이 붙는다(§C-1). 종목 줄을 **위**에 둔다 — 기준 줄보다 먼저 읽혀야
 * 한다. 기준은 확인하는 정보고 종목은 궁금해지는 정보다.
 */
export function flowSupport(story: FlowStory, depth?: FlowDepth): string[] {
  const lines: string[] = [];
  if (depth) {
    const focus = storyFocus(story);
    const rows = focus.direction === "in" ? depth.toStocks : depth.fromStocks;
    const line = flowStockLine(rows, focus.direction);
    if (line) lines.push(line);
  }
  if (story.kind === "reversal" && story.lookbackDays) {
    // 「처음」의 근거를 카드에 남긴다 — 되짚은 창을 밝히지 않으면 단정이 된다.
    lines.push(`직전 ${story.lookbackDays}거래일에는 들어온 날이 없었어요`);
    lines.push("외국인·기관 기준");
    return lines;
  }
  lines.push(`최근 ${story.windowDays}거래일 · 외국인·기관 기준`);
  return lines;
}

/* ────────────────────────────────────────────────────────────────────────────
   상세 다섯 걸음 (DETAIL-01 PART B)

   카드는 한 이야기만 말한다. 상세는 **그 하나가 전부가 아님을 보여주는 자리**다 —
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
  /** 빠진 업종에서 가장 많이 판 종목 — 최대 5. 빠진 쪽이 없는 이야기에서는 빈다. */
  fromStocks: FlowStockRow[];
  /** 들어온 업종에서 가장 많이 산 종목 — 최대 5. 들어온 쪽이 없는 이야기에서는 빈다. */
  toStocks: FlowStockRow[];
  /**
   * 이 카드의 **초점** 업종(집계 원문). 일별 막대와 즐겨찾기가 이걸 쓴다.
   * 업종 간 이동에서는 들어온 쪽, 한 업종 이야기에서는 그 업종이다.
   */
  focusSector: string;
  /** 초점 업종이 들어오는 중인가 빠지는 중인가 — 문장이 이걸로 갈린다. */
  focusDirection: "in" | "out";
  /**
   * 초점 업종에서 거래가 실제로 붙은 종목 — 최대 5.
   * **비어 있는 것도 정보다**(§D-4): 돈은 오가는데 거래는 평소와 비슷하다는 뜻이다.
   */
  focusVolumeStocks: FlowStockRow[];
  /** 초점 업종의 일별 순매수 — 최대 20거래일, 오래된 것부터. */
  focusDaily: FlowDayRow[];
  /** 위 창에서 순매수였던 날 수 — "20일 중 14일" 문장의 근거. */
  focusPositiveDays: number;
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
 * @param windowRows  카드 창(3·5·20일 또는 연속 구간) 안의 행. 1~3걸음이 쓴다.
 * @param dailyRows   20거래일 창의 행. 4걸음 전용 — 카드 창이 3일이어도 추세는 20일로 본다.
 * @param nameByCode  종목코드 → 이름. 없는 코드는 이름 없이 간다.
 * @param volumeRatioByCode 종목코드 → 20일 평균 대비 거래량 배수.
 */
export function buildFlowDepth(
  story: FlowStory,
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

  /**
   * 어느 쪽이 있는 이야기인가 — 업종 간 이동만 양쪽이 있다.
   * **없는 쪽을 지어내지 않는다**: 한 업종 이야기의 상대편 목록은 빈 배열이고,
   * 화면은 빈 걸음을 만들지 않는다.
   */
  const fromSector = story.kind === "rotation" ? story.from.sector : story.direction === "out" ? story.flow.sector : null;
  const toSector = story.kind === "rotation" ? story.to.sector : story.direction === "in" ? story.flow.sector : null;
  const focus = storyFocus(story);

  const fromAll = fromSector ? byStock(fromSector) : [];
  const toAll = toSector ? byStock(toSector) : [];
  const focusAll = focus.direction === "in" ? toAll : fromAll;

  /** 4걸음 — 초점 업종의 일별 합. 20거래일 창을 쓴다(카드 창이 3일이어도). */
  const byDate = new Map<string, number>();
  for (const r of dailyRows) {
    if (sectorByCode[r.code] !== focus.sector || !Number.isFinite(r.net)) continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.net);
  }
  const focusDaily = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-FLOW_DEPTH_DAYS)
    .map(([date, net]) => ({ date, net }));

  return {
    outflows: outflows.map(row),
    inflows: inflows.map(row),
    fromStocks: topByNet(fromAll, FLOW_DEPTH_STOCKS, "sell"),
    toStocks: topByNet(toAll, FLOW_DEPTH_STOCKS, "buy"),
    focusSector: focus.sector,
    focusDirection: focus.direction,
    // 오간 종목 중 거래도 붙은 것만. 배수 순 — 금액 순으로 정렬하면 3걸음이 2걸음과 같아진다.
    focusVolumeStocks: focusAll
      .filter((s) => (focus.direction === "in" ? s.net > 0 : s.net < 0))
      .filter((s) => typeof s.volumeRatio === "number" && s.volumeRatio >= FLOW_VOLUME_ATTACHED_RATIO)
      .sort((a, b) => (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0))
      .slice(0, FLOW_DEPTH_STOCKS),
    focusDaily,
    focusPositiveDays: focusDaily.filter((d) => d.net > 0).length,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   상세 화면의 문장 (FLOW-02 §B·§F)

   **화면이 조사를 붙이지 않는다.** 프로덕션 실측(2026-09-07)에서 상세 헤더가
   `반도체으로` 를 냈다 — 표시명은 받침이 섞여 있어 고정 조사가 반드시 틀린다.
   문장을 여기서 만들면 `josa()` 하나만 지키면 된다.
   ──────────────────────────────────────────────────────────────────────────── */

/** 상세 헤더 한 줄 — 어느 업종 이야기인지. */
export function flowDepthHeader(card: { fromSector?: string; toSector?: string }): string {
  const from = card.fromSector ? sectorDisplayName(card.fromSector) : null;
  const to = card.toSector ? sectorDisplayName(card.toSector) : null;
  if (from && to) return `${from}에서 ${to}${josa(to, "으로")}`;
  if (to) return `${to}${josa(to, "으로")} 들어온 돈`;
  if (from) return `${from}에서 빠진 돈`;
  return "업종별 자금 흐름";
}

/** 3걸음 제목 — 초점 업종의 거래량. */
export function flowVolumeTitle(depth: Pick<FlowDepth, "focusSector">): string {
  return `${sectorDisplayName(depth.focusSector)}에서 거래량이 평소보다 늘어난 종목`;
}

/** 3걸음 문장. **거래가 안 붙었으면 그것도 정보다**(§F-2). */
export function flowVolumeNote(depth: Pick<FlowDepth, "focusDirection">, attached: boolean): string[] {
  const inbound = depth.focusDirection === "in";
  if (attached) return [inbound ? "돈이 들어오면서 거래도 함께 붙고 있어요" : "돈이 빠지면서 거래도 함께 붙고 있어요"];
  return inbound
    ? ["돈은 들어오는데 거래량은 평소와 비슷해요", "조용히 사 모으는 모습이에요"]
    : ["돈은 빠지는데 거래량은 평소와 비슷해요", "조용히 덜어내는 모습이에요"];
}

/** 4걸음 제목 — 얼마나 오래됐나. */
export function flowSinceTitle(depth: Pick<FlowDepth, "focusSector" | "focusDirection">): string {
  const name = sectorDisplayName(depth.focusSector);
  return depth.focusDirection === "in"
    ? `${name}${josa(name, "으로")} 돈이 들어온 지 얼마나 됐나요`
    : `${name}에서 돈이 빠진 지 얼마나 됐나요`;
}

/** 4걸음 문장 — 창과 같은 방향이었던 날 수. */
export function flowSinceLine(depth: Pick<FlowDepth, "focusDirection" | "focusDaily" | "focusPositiveDays">): string {
  const total = depth.focusDaily.length;
  const same = depth.focusDirection === "in" ? depth.focusPositiveDays : total - depth.focusPositiveDays;
  const word = depth.focusDirection === "in" ? "순매수" : "순매도";
  return `최근 ${total}거래일 중 ${same}일이 ${word}였어요`;
}

/** 5걸음 — 즐겨찾기 제목. */
export function flowWatchTitle(depth: Pick<FlowDepth, "focusSector">): string {
  return `${sectorDisplayName(depth.focusSector)} 업종을 계속 지켜볼까요`;
}

/**
 * 5걸음 — 무엇을 알려주겠다는 것인지. **방향을 따라간다.**
 * 빠지는 업종 카드에서 「돈이 계속 들어오는지 알려드려요」라고 하면 앞 화면과 어긋난다.
 */
export function flowWatchSubject(depth: Pick<FlowDepth, "focusDirection">): string {
  return depth.focusDirection === "in"
    ? "돈이 계속 들어오는지, 빠지기 시작하는지 알려드려요"
    : "돈이 계속 빠지는지, 들어오기 시작하는지 알려드려요";
}
