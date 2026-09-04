/**
 * FIX-03 PART B — 마지막 걸음. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 무엇이 문제였나 (2026-09-04 실측, 종근당)
 *
 * ```
 * 석 달 만에 처음 거래가 3배로 늘었어요
 * 공시가 3건 있었어요
 * 매출도 이익도 늘고 있어요
 * 제약 업종 안에서 낮은 편이에요
 * 계속 지켜보면 앞으로 얼마나 움직이는지 알려드려요
 * ```
 *
 * **앞 걸음에서 본 것을 그냥 다시 늘어놓았다.** 새로 알게 되는 게 없으니 누를 이유도 없다.
 * 마지막 걸음이 할 일은 요약이 아니라 **결정을 돕는 것**이다(§B-1).
 *
 * ## 세 조각으로 다시 만든다
 *
 * | 조각 | 무엇 | 왜 |
 * |---|---|---|
 * | `headline` | 앞 걸음의 결론을 **한 문장**으로 묶은 것 | 나열은 읽는 순서를 만들지 않는다 |
 * | `rows` | `거래 / 공시 / 실적 / 값` **라벨-값 표** | 훑어보는 자리다. 문장 넷은 훑을 수 없다 |
 * | `ourRecord` | **우리가 전에 짚은 날과 그 뒤 변동** | 이 앱을 믿을 유일한 근거다(§B-5) |
 *
 * ## 평가하지 않는다 — 지시서 예시 문구와 갈린 지점
 *
 * §B-4 는 「신호 강함 + 실적 좋음 → *회사 실적도 괜찮아요*」를 예로 들면서 같은 절에
 * **「평가하지 않는다. 사실을 묶어서 한 문장으로 만든다」**고 적었다. 둘은 같이 갈 수 없다 —
 * `괜찮아요` 는 평가다. 그래서 **규칙을 따르고 예시 문구는 사실형으로 바꿨다**:
 *
 * ```
 * 지시서 예시   거래가 갑자기 붙었고 회사 실적도 괜찮아요
 * 이 파일       거래가 3배로 붙었고, 매출과 이익도 늘고 있어요
 * ```
 *
 * 조합 규칙(신호 + 실적 / 신호 + 값 / 신호만)은 그대로다.
 *
 * ## 지어내지 않는다
 *
 * 각 줄은 **앞 걸음이 실제로 보여준 것**에서만 온다. 3걸음이 없으면 실적·값 줄이 없고,
 * 공시가 0건이면 그 사실을 쓴다. 처음 짚는 종목이면 `ourRecord` 가 `null` 이다.
 */

import { josa } from "./josa";

/** 라벨-값 한 줄. 값은 **짧은 사실**이다(문장이 아니라 표의 칸). */
export interface DecideRow {
  label: string;
  value: string;
}

export interface DecideStep {
  /** 한 문장 요약(§B-4). 재료가 신호뿐이면 그 사실도 문장에 남는다. */
  headline: string;
  rows: DecideRow[];
  /** `우리가 8월 26일에도 짚었고 그 뒤로 -0.4% 움직였어요`. 처음이면 `null`. */
  ourRecord: string | null;
  /** 담으면 무엇을 해주는지 — 종전 문구보다 구체적으로(§B-3). */
  watchNote: string;
}

export interface DecideStepInput {
  /** 이번 신호. `kind` 로 문구를 고르고 `scale`·`days`·`actors` 를 문장에 넣는다. */
  signal: { kind?: string | null; scale?: string | null; days?: number | null; actors?: string | null };
  /** 「왜 지금 사는가」가 실제로 보여준 공시 건수와 그 창(일). */
  disclosures?: { count: number; windowDays: number } | null;
  /**
   * 3걸음 세 덩어리의 **요약 문장**(`summaryText`). 주어가 있는 문장만 온다(FIX-01 C).
   * 없는 덩어리는 넘기지 않는다 — 이 파일은 없는 것을 채우지 않는다.
   */
  company?: ReadonlyArray<{ title: string; summaryText: string | null }>;
  /** 노출 이력 — 처음 짚은 날·가격과 몇 번째인가. */
  exposure?: { firstWhen?: string | null; firstPrice?: number | null; count?: number | null } | null;
  /** 지금 가격 — `ourRecord` 의 변동률 분모가 아니라 분자다(처음 가격이 분모). */
  currentPrice?: number | null;
}

/** 3걸음 질문 → 표의 라벨. 표는 훑는 자리라 질문이 아니라 **한 낱말**이다. */
const GROUP_LABEL: Readonly<Record<string, string>> = {
  "돈은 잘 버나요": "실적",
  "값은 어떤가요": "값",
  "빚은 괜찮나요": "빚",
};

/** 신호 종류 → 표의 라벨. 주체가 있는 형은 `수급`, 없는 형은 그 형의 말이다. */
function signalLabel(kind: string | null | undefined): string {
  switch ((kind ?? "").trim()) {
    case "volume_awakening":
      return "거래";
    case "market_divergence":
      return "시장 대비";
    case "insider_cluster":
      return "임원";
    case "flow_entry":
      return "자금";
    default:
      return "수급";
  }
}

/**
 * 표의 신호 값 — **숫자와 기간만.** 문장을 넣으면 표가 아니라 나열이 된다.
 * 재료가 없으면 `null` 이라 그 줄이 없다(지어내지 않는다).
 */
function signalValue(signal: DecideStepInput["signal"]): string | null {
  const scale = signal.scale?.trim();
  const days = typeof signal.days === "number" && signal.days > 0 ? signal.days : null;
  const actor = signal.actors?.trim();
  const kind = (signal.kind ?? "").trim();

  if (kind === "volume_awakening") return scale ? `평소의 ${scale}` : null;
  if (kind === "market_divergence") return scale ? `${scale} 앞서요` : null;
  if (kind === "insider_cluster") {
    if (actor && scale) return `${actor} · ${scale}`;
    return actor ?? scale ?? null;
  }
  if (kind === "flow_entry") return scale ?? null;
  // 수급 형 — 주체와 연속일수. 둘 중 하나만 있어도 쓴다.
  if (actor && days) return `${actor} ${days}일 연속`;
  if (actor) return actor;
  return days ? `${days}일 연속` : null;
}

/** 한 문장 요약의 앞 조각 — `~고` 로 끝나 뒤 조각과 이어진다. */
function signalClause(signal: DecideStepInput["signal"]): string {
  const scale = signal.scale?.trim();
  const days = typeof signal.days === "number" && signal.days > 0 ? signal.days : null;
  const actor = signal.actors?.trim();
  switch ((signal.kind ?? "").trim()) {
    case "volume_awakening":
      // 조사를 고정하지 않는다 — `3배로` · `320억으로` 가 갈린다(josa-guard).
      return scale ? `거래가 평소의 ${scale}${josa(scale, "으로")} 붙었고` : "거래가 갑자기 붙었고";
    case "market_divergence":
      return "시장을 앞서고 있고";
    case "flow_entry":
      return "자금이 들어오고 있고";
    case "insider_cluster":
      return actor ? `${actor}${josa(actor, "이가")} 사고 있고` : "임원이 사고 있고";
    default: {
      if (!actor) return days ? `${days}일째 사고 있고` : "수급이 붙고 있고";
      return days ? `${actor}${josa(actor, "이가")} ${days}일째 사고 있고` : `${actor}${josa(actor, "이가")} 사고 있고`;
    }
  }
}

/**
 * 한 문장 요약의 뒤 조각 — **실적을 먼저, 없으면 값**을 쓴다(§B-4 조합표 순서).
 *
 * 3걸음 요약 문장을 그대로 쓰지 않는다: 앞 조각과 이어 붙일 절이 필요하고, 요약 문장은
 * 종결형이다. 대신 **그 문장이 말한 방향만** 읽어 절로 옮긴다 — 새 사실을 만들지 않는다.
 */
function companyClause(company: DecideStepInput["company"]): string | null {
  const find = (title: string) => company?.find((g) => g.title === title)?.summaryText?.trim() ?? null;
  const earnings = find("돈은 잘 버나요");
  if (earnings) {
    if (/적자/.test(earnings)) return "지금은 영업에서 적자예요";
    const up = /늘었|늘고/.test(earnings);
    const down = /줄었|줄고/.test(earnings);
    if (up && down) return "매출과 이익은 한쪽만 늘었어요";
    if (up) return "매출과 이익도 늘고 있어요";
    if (down) return "다만 매출과 이익은 줄었어요";
  }
  const value = find("값은 어떤가요");
  if (value) {
    if (/낮은/.test(value)) return "값도 같은 업종보다 낮아요";
    if (/높은/.test(value)) return "다만 값은 같은 업종보다 높아요";
    if (/가운데/.test(value)) return "값은 같은 업종 가운데쯤이에요";
    if (/잴 수 없/.test(value)) return "적자라서 이익으로는 값을 잴 수 없어요";
  }
  return null;
}

/** `+1.2%` / `-0.4%`. **부호를 항상 쓴다** — 마이너스를 숨기지 않는다(§B-5). */
function signedPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

/**
 * 마지막 걸음.
 *
 * `headline` 은 **항상 있다** — 신호가 있어서 이 카드가 만들어졌으므로 앞 조각은 언제나
 * 만들 수 있다. 뒤 조각(회사)이 없으면 그 사실을 문장에 적는다(§B-4 「신호만 있음」).
 */
export function decideStep(input: DecideStepInput): DecideStep {
  const clause = signalClause(input.signal);
  const company = companyClause(input.company);
  const headline = company
    ? `${clause}, ${company}`
    : `${clause.replace(/고$/, "어요")}. 회사 정보는 아직 부족해요`;

  const rows: DecideRow[] = [];
  const value = signalValue(input.signal);
  if (value) rows.push({ label: signalLabel(input.signal.kind), value });

  /**
   * 공시 — **0건도 사실이다.** 「아무 소식 없이 사고 있다」가 이 제품이 찾는 것이므로
   * 0을 감추지 않는다(WO-RESET-02 §C-4 와 같은 판단). 수집 전이면 `disclosures` 가 없다.
   */
  if (input.disclosures) {
    const { count, windowDays } = input.disclosures;
    rows.push({ label: "공시", value: count > 0 ? `최근 ${windowDays}일에 ${count}건` : `최근 ${windowDays}일에 없어요` });
  }

  for (const group of input.company ?? []) {
    const label = GROUP_LABEL[group.title];
    const summary = group.summaryText?.trim();
    if (!label || !summary) continue;
    rows.push({ label, value: summary });
  }

  /**
   * §B-5 — 우리 기록. **처음 짚는 종목이면 `null`** 이고, 마이너스도 그대로 쓴다.
   * 날짜 표기(`8월 26일`)는 페이로드가 들고 온 것을 쓴다 — 여기서 조립하지 않는다.
   */
  const ourRecord = ((): string | null => {
    const e = input.exposure;
    const when = e?.firstWhen?.trim();
    const first = e?.firstPrice;
    const now = input.currentPrice;
    if (!when || typeof first !== "number" || !(first > 0)) return null;
    const count = typeof e?.count === "number" ? e.count : 0;
    const times = count >= 3 ? `${when}부터 ${count}번 짚었고` : `${when}에도 짚었고`;
    if (typeof now !== "number" || !(now > 0)) return `우리가 ${times} 그 뒤 가격은 아직 못 쟀어요`;
    return `우리가 ${times} 그 뒤로 ${signedPct(((now - first) / first) * 100)} 움직였어요`;
  })();

  return {
    headline,
    rows,
    ourRecord,
    watchNote: "지금 담아두면 앞으로 얼마나 움직이는지 기록해서 알려드려요",
  };
}
