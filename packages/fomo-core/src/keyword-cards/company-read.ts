/**
 * WO-RESET-05 §4 — 3걸음 「어떤 회사인가」. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 무엇을 고치나
 *
 * 종전 「값」 섹션이 이랬다:
 *
 * ```
 * 시가총액  9,496억
 * PER      12.25배
 * PBR       0.88배
 * EPS      5,615원
 * ```
 *
 * **숫자만 있고 좋은지 나쁜지가 없다.** PER 12.25배가 싼 건지 비싼 건지 읽는 사람은 모른다.
 * 숫자 하나만 두면 아무 말도 안 한 것과 같다.
 *
 * ## 규칙 하나: 비교 기준이 없으면 그 숫자를 안 보여준다
 *
 * WO §4-3 이 못을 박았다. 맨숫자를 남기지 않는다 — 없으면 **줄 자체가 사라진다.**
 * 그래서 이 파일의 함수들은 전부 `null` 을 흔하게 돌려준다. 그게 정상이다.
 *
 * ## 세 덩어리, 종합 점수 없음
 *
 * `돈은 잘 버나요` · `값은 어떤가요` · `빚은 괜찮나요`. 셋을 하나로 합친 점수는
 * **만들지 않는다**(WO 하지 말 것). 합치는 순간 "이 종목 7점" 이 되고, 그건 추천이다.
 *
 * ## 쓰지 않는 말
 *
 * `저평가` · `유망` · `좋은 종목` 을 쓰지 않는다(WO 하지 말 것). 비교 사실만 쓴다 —
 * `업종 평균 18배보다 낮아요` 는 사실이고, `저평가예요` 는 판단이다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## FIX-01 (2026-09-04 광혁 지시) — **말이 안 되는 문장을 고친다**
 *
 * 프로덕션 화면에서 나온 것:
 *
 * ```
 * 매출  -1.0%
 * 작년보다 줄었어요 · 3년째 늘고 있어요        ← ① 한 줄에서 정반대 말을 한다
 *
 * PBR  2.79배
 * 최근 5년 중 높은 쪽이에요
 * ●○○○○  최근 5년 중 높은 편이에요            ← ② 같은 말을 두 번 한다
 *
 * 영업이익  -97.1%  작년보다 줄었어요
 * ●●○○○  늘어난 것과 줄어든 것이 섞여 있어요   ← ③ 둘 다 줄었는데 "섞여" 있다
 *
 * (요약) 제약 업종 안에서 낮은 편이에요          ← ④ 무엇이 낮은지 없다
 * ```
 *
 * 이 파일이 지키는 규칙 넷:
 *
 * | # | 규칙 | 어떻게 |
 * |---|---|---|
 * | A | **한 지표에 한 문장** | `comparison` 은 한 방향만 말한다. 기간이 다른 둘째 사실은 `trend` 로 **줄을 나눈다** |
 * | B | **점 옆에 줄 설명을 되풀이하지 않는다** | `scoreText` 는 **줄이 말하지 않은 사실**일 때만 채운다. 겹치면 `null` — 점은 그림으로 혼자 선다 |
 * | C | **주어 없는 문장을 만들지 않는다** | 요약용 `summaryText` 는 항상 무엇에 대한 말인지 앞에 둔다 |
 * | G | **점수 재료를 전부 화면에 보인다** | 흑자 여부가 점수에 들어가는데 화면에 없었다 → `영업이익률` 줄을 만든다. 그래서 「섞여 있어요」 같은 뭉갠 말이 필요 없어졌다 |
 *
 * ③ 이 가장 나빴다. 점수는 `매출 증가 · 영업이익 증가 · 흑자 여부` 셋으로 내는데
 * **셋째가 화면에 없었다.** 그래서 둘 다 줄어든 종목에 점 2개가 붙고, 그 점을
 * 설명하려고 「섞여 있어요」라고 쓴 것이다 — 화면만 보는 사용자에게는 거짓말이다.
 */

import { josa } from "./josa";
import { industryDisplayLabel } from "./sector-display";
import { sectorComparison, SECTOR_MIN_MEMBERS, type SectorComparison, type SectorStat } from "./sector-stats";

/** 한 줄 — 숫자와 **그 숫자를 읽는 문장**. 문장이 없으면 이 줄은 만들어지지 않는다. */
export interface CompanyMetricRow {
  label: string;
  /** 화면에 쓸 값 문자열 — `12.3배` / `42%`. */
  value: string;
  /** 비교 문장 — `업종 평균 18.0배보다 낮아요`. **이게 없으면 줄이 없다.** */
  comparison: string;
  /**
   * FIX-01 A-2 — **기간이 다른 둘째 사실.** `comparison` 이 작년 대비를 말할 때,
   * 3년 추세가 **반대 방향**이면 그것만 여기 온다(`다만 3년으로 보면 늘어왔어요`).
   *
   * 종전에는 이 말을 `comparison` 뒤에 `·` 로 붙였다 — 그래서 한 줄이
   * `작년보다 줄었어요 · 3년째 늘고 있어요` 가 됐다. **줄을 나눠야 모순이 아니다.**
   * 방향이 같으면 이 필드가 없다(같은 말을 두 번 하지 않는다).
   */
  trend?: string;
}

/** 한 덩어리. */
export interface CompanyGroup {
  /** `돈은 잘 버나요` 처럼 **질문**으로 쓴다. 라벨이 아니라 질문이어야 답이 읽힌다. */
  title: string;
  rows: CompanyMetricRow[];
  /** 5점 만점. 잴 수 없으면 `null`. */
  score: number | null;
  /**
   * 점 옆에 붙는 문장 — **줄이 말하지 않은 사실만**(FIX-01 B).
   *
   * 종전 규약은 「점이 있으면 문장이 반드시 있다」였다. 그 규약이
   * `최근 5년 중 높은 쪽이에요` 아래에 `최근 5년 중 높은 편이에요` 를 만들었다.
   * 이제 겹치면 **`null`** 이고, 점은 그림으로 혼자 선다(방향은 화면 하단 범례가 말한다).
   */
  scoreText: string | null;
  /**
   * FIX-01 C-2 — **4걸음 요약에 쓸 한 문장.** 항상 무엇에 대한 말인지 앞에 있다.
   *
   * 요약은 앞 걸음의 화면 맥락(섹션 제목·줄 라벨)을 잃은 자리다. 그래서 여기서는
   * `제약 업종 안에서 낮은 편이에요` 가 아니라 `PBR이 제약 업종 안에서 낮은 편이에요` 다.
   */
  summaryText: string | null;
  /** 이 덩어리를 어떻게 냈는지 — 화면 맨 아래 `점수는 이렇게 매겼어요` 가 모아서 쓴다. */
  method: string;
  /**
   * FIX-02 PART D — **줄도 점도 못 만든 이유.** 있으면 화면은 제목 아래 이 한 줄을 쓴다.
   *
   * 종전에는 빈 덩어리를 **말없이 뺐다.** 그래서 종목마다 섹션이 들쭉날쭉했고
   * (PS일렉트로닉스 `돈·값` / Pinnacle `값·빚`) 사용자에게는 앱이 고장 난 것처럼 보였다.
   * 데이터가 없는 것과 고장 난 것은 다르고, 그 차이를 화면이 말해야 한다.
   */
  missingReason?: string;
}

export interface CompanyReadInput {
  growth: { revenueYoy: number | null; revenueCagr3y: number | null; operatingIncomeYoy: number | null };
  margin: { operatingTtm: number | null };
  valuation: {
    per: number | null;
    pbr: number | null;
    perBand: { percentile: number | null; sufficient: boolean } | null;
    pbrBand: { percentile: number | null; sufficient: boolean } | null;
  };
  /**
   * `debtToEquity` 는 **배수**다(부채 ÷ 자기자본). 팩트시트가 그렇게 저장한다
   * (`derive.ts`: `liabilities / equity`). 화면의 「부채비율 %」는 여기에 100을 곱한 값이다.
   *
   * 이걸 헷갈려 `1.0` 을 그대로 `1%` 로 찍고 있었다(2026-08-27 프로덕션 실측) — 실제로는
   * **100%** 다. 100배 틀린 숫자를 확신 있게 보여주는 것이 없는 것보다 나쁘다.
   */
  balance: { debtToEquity: number | null };
  /**
   * 업종 비교 후보 — **좁은 분류부터, 그다음 상위 분류**(`sectorCandidates`).
   *
   * 종전에는 분류 하나(`sector: SectorStat | null`)를 받았다. 지표마다 표본 수가 다르므로
   * 「PBR 은 좁은 분류로, 부채비율은 상위 분류로」가 정상 결과다(FIX-02 B-2 사다리).
   * 그리고 중앙값은 **자기 자신을 뺀 뒤** 이 자리에서 낸다(B-3).
   */
  sectorCandidates: readonly SectorStat[];
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)}%`;
const times = (v: number) => `${(Math.round(v * 100) / 100).toFixed(2)}배`;

/** 5년 밴드 백분위를 사람 말로. 낮을수록 싸다. */
function bandPhrase(percentile: number): string {
  if (percentile <= 20) return "최근 5년 중 낮은 편이에요";
  if (percentile <= 40) return "최근 5년 중 낮은 쪽이에요";
  if (percentile >= 80) return "최근 5년 중 높은 편이에요";
  if (percentile >= 60) return "최근 5년 중 높은 쪽이에요";
  return "최근 5년 가운데쯤이에요";
}

/**
 * 업종 이름 — 화면용. **영어를 그대로 쓰지 않는다**(FIX-01 E-1).
 *
 * 표에 없는 영문 분류는 `null` 이라 이름 없이 쓴다. 상위 이름(`금융`)으로 바꿔 부르지
 * 않는다 — 통계 모수는 좁은 분류의 구성원이고, 다른 이름을 붙이면 없는 모수를 말하는 것이
 * 된다(`sector-display.ts` 머리말).
 */
function peerName(cmp: SectorComparison): string | null {
  return industryDisplayLabel(cmp.label);
}

/**
 * 누구와 견줬는지 — **자기를 뺀 곳 수를 밝힌다**(FIX-02 B-4).
 *
 * `다른 은행 12곳` 이라고 쓰는 이유: 종전 문구(`Major Banks 업종 중간값`)는 그 모수에
 * 자기가 들어 있었는지, 몇 곳인지 알려주지 않았다. 실측에서는 그 모수가 **자기 하나**였다.
 */
function peerPhrase(cmp: SectorComparison): string {
  const label = peerName(cmp);
  return label ? `다른 ${label} ${cmp.count}곳` : `같은 업종 다른 ${cmp.count}곳`;
}

/**
 * 업종 대푯값과 견준 문장. 같은 값이면 `비슷해요` — 억지로 높다/낮다를 만들지 않는다.
 *
 * ## `중간값` 이 아니라 `평균` 이라고 쓴다 (FIX-01 E-2)
 *
 * 계산은 **여전히 중앙값**이다(`sector-stats.ts`: PER 은 적자 직전 종목에서 수백 배로
 * 튀어 평균을 망가뜨린다). 바뀐 것은 표시뿐이고, 계산 방법은 `점수는 이렇게 매겼어요`가
 * 밝힌다.
 */
function versusPeers(mine: number, theirs: number, unit: (v: number) => string, cmp: SectorComparison): string {
  const gap = (mine - theirs) / theirs;
  const base = `${peerPhrase(cmp)} 평균 ${unit(theirs)}`;
  if (Math.abs(gap) < 0.05) return `${base}${josa(base, "와과")} 비슷해요`;
  return `${base}보다 ${mine < theirs ? "낮아요" : "높아요"}`;
}

/**
 * 계산 방법에 쓸 모수 표기. **몇 곳과 견줬는지**를 여기서도 밝힌다.
 * 이름을 모르면 이름 없이 쓴다.
 */
function peerNote(cmp: SectorComparison): string {
  const label = peerName(cmp);
  return label ? `같은 업종(${label}) 다른 ${cmp.count}곳` : `같은 업종 다른 ${cmp.count}곳`;
}

/**
 * FIX-02 PART C-3 — **금융 업종에는 부채비율을 쓰지 않는다.**
 *
 * 은행은 예금이 부채로 잡혀 부채비율이 원래 수백 %다. 실측 화면의 `부채비율 770.3%` 는
 * 은행에서 정상인데 **사용자는 그걸 모른다** — 그 숫자만 보면 망하기 직전으로 읽힌다.
 *
 * 대신 **자기자본비율**(자기자본 ÷ 총자산)을 쓴다. 팩트시트에 총자산 항목은 없지만
 * `debt_to_equity` 하나로 나온다: 자산 = 자기자본 + 부채이므로 `1 / (1 + 부채/자기자본)`.
 * 새 수집이 없다.
 */
const FINANCIAL_LABELS: ReadonlySet<string> = new Set([
  // 표시명(국내 원문이 이미 짧아 표시명이 원문과 같은 것 포함)
  "은행", "저축은행", "증권", "자산운용", "손해보험", "생명보험", "건강보험", "특종보험",
  "종합금융", "여신금융", "소비자금융", "리츠", "금융", "벤처투자", "카드", "부동산", "보험",
]);

function isFinancialPeer(cmp: SectorComparison): boolean {
  const label = peerName(cmp) ?? cmp.label;
  return FINANCIAL_LABELS.has(label.trim());
}

/** 부채/자기자본 배수 → 자기자본비율(0~1). 자산 = 자기자본 + 부채. */
function equityRatio(debtToEquity: number): number {
  return 1 / (1 + debtToEquity);
}

/**
 * 증감 크기를 말로. **숫자가 옆에 있으므로 크기를 부풀리지 않는다** —
 * `-97.1%` 옆에 그냥 `줄었어요` 만 있으면 `-1.0%` 와 같은 말이 되는 것이 문제였다.
 */
function magnitudeWord(absPct: number): string {
  if (absPct < 5) return "조금 ";
  if (absPct >= 50) return "크게 ";
  return "";
}

/** 작년 같은 기간 대비 한 문장. **한 방향만 말한다**(FIX-01 A-2 우선순위 ①). */
function yoyPhrase(value: number): string {
  return `작년 같은 기간보다 ${magnitudeWord(Math.abs(value))}${value >= 0 ? "늘었어요" : "줄었어요"}`;
}

/**
 * ① 돈은 잘 버나요 — 사업이 되는가.
 *
 * 점수는 **매출 추세 + 영업이익 추세 + 흑자 여부** 셋을 각각 세고 5점으로 옮긴다(WO §4-5).
 * 하나도 못 재면 점을 안 준다. 재료가 없으면 없다고 하는 편이 맞다.
 *
 * ## 점수 재료 셋을 **전부 줄로 보인다** (FIX-01 G)
 *
 * 종전에는 흑자 여부가 점수에만 들어가고 화면에 없었다. 그래서 매출 -1.0% · 영업이익
 * -97.1% 인 종목에 점 2개가 붙었고(흑자 한 표), 그 점을 설명하려 「늘어난 것과 줄어든 것이
 * 섞여 있어요」라고 썼다. **화면에는 줄어든 것만 둘 있었다.** 이제 `영업이익률` 줄이
 * 그 세 번째 표를 화면에 세운다 — 점과 화면이 어긋나지 않는다.
 */
export function earningsGroup(input: CompanyReadInput): CompanyGroup {
  const rows: CompanyMetricRow[] = [];
  const g = input.growth;
  const margin = input.margin.operatingTtm;
  const title = "돈은 잘 버나요";

  if (g.revenueYoy !== null) {
    /**
     * A-2 — 3년 추세는 **방향이 반대일 때만** 둘째 줄로 붙인다. 같은 방향이면 같은 말을
     * 두 번 하는 것이고, 반대 방향이면 그게 정보다(작년엔 줄었지만 3년으로는 늘어왔다).
     */
    const cagr = g.revenueCagr3y;
    const opposed = cagr !== null && cagr !== 0 && (cagr > 0) !== (g.revenueYoy >= 0);
    rows.push({
      label: "매출",
      value: pct(g.revenueYoy),
      comparison: yoyPhrase(g.revenueYoy),
      ...(opposed ? { trend: `다만 3년으로 보면 ${cagr > 0 ? "늘어왔어요" : "줄어왔어요"}` } : {}),
    });
  } else if (g.revenueCagr3y !== null) {
    // 작년 대비가 없을 때만 3년을 본문으로 쓴다(A-2 우선순위 ②).
    rows.push({
      label: "매출",
      value: pct(g.revenueCagr3y),
      comparison: `3년 동안 해마다 ${g.revenueCagr3y >= 0 ? "늘어왔어요" : "줄어왔어요"}`,
    });
  }
  if (g.operatingIncomeYoy !== null) {
    rows.push({ label: "영업이익", value: pct(g.operatingIncomeYoy), comparison: yoyPhrase(g.operatingIncomeYoy) });
  }
  /**
   * G — 점수의 세 번째 재료를 화면에 세운다. 값은 **영업이익률**(매출에서 영업이익이
   * 차지하는 비율)이고, 문장은 흑자·적자라는 사실 하나만 말한다.
   */
  if (margin !== null && Number.isFinite(margin)) {
    rows.push({
      label: "영업이익률",
      value: pct(margin),
      comparison: margin > 0 ? "지금은 영업에서 흑자예요" : "지금은 영업에서 적자예요",
    });
  }

  const marks: number[] = [];
  if (g.revenueYoy !== null) marks.push(g.revenueYoy > 0 ? 1 : 0);
  if (g.operatingIncomeYoy !== null) marks.push(g.operatingIncomeYoy > 0 ? 1 : 0);
  if (margin !== null) marks.push(margin > 0 ? 1 : 0);

  const method = "매출 증가·영업이익 증가·흑자 여부 셋을 세어 5점으로 옮겼어요.";
  if (marks.length === 0) {
    // FIX-02 D-1 — 말없이 사라지지 않는다. 없는 이유를 화면에 적는다.
    return {
      title,
      rows,
      score: null,
      scoreText: null,
      summaryText: null,
      method,
      missingReason: "실적 자료를 아직 못 가져왔어요",
    };
  }

  const hit = marks.reduce((a, b) => a + b, 0);
  const score = Math.max(1, Math.round((hit / marks.length) * 5));

  /**
   * C-2 — 요약 한 줄. **주어가 있고, 방향마다 그 주어를 붙인다.**
   * `매출은 늘었는데 이익은 줄었어요` 는 모순이 아니다 — 서로 다른 지표를 말하므로.
   * 뭉갠 말(`섞여 있어요`)을 쓰지 않는다: 무엇이 늘고 무엇이 줄었는지가 정보다.
   */
  const rev = g.revenueYoy;
  const op = g.operatingIncomeYoy;
  const loss = margin !== null && margin <= 0;
  /**
   * **적자가 방향보다 먼저다.** 요약은 최대 네 줄뿐이라 한 덩어리가 한 줄을 갖는다.
   * 매출·이익이 얼마나 늘었든 지금 영업에서 적자라면 그게 이 덩어리의 답이다
   * (종전 `scoreText` 도 같은 우선순위였다 — 그 동작을 요약으로 옮긴다).
   */
  const summaryText = loss
    ? "지금은 영업에서 적자예요"
    : rev !== null && op !== null
      ? rev >= 0 && op >= 0
        ? "매출도 영업이익도 늘었어요"
        : rev < 0 && op < 0
          ? "매출도 영업이익도 줄었어요"
          : rev >= 0
            ? "매출은 늘었는데 영업이익은 줄었어요"
            : "매출은 줄었는데 영업이익은 늘었어요"
      : rev !== null
        ? `매출이 작년보다 ${rev >= 0 ? "늘었어요" : "줄었어요"}`
        : op !== null
          ? `영업이익이 작년보다 ${op >= 0 ? "늘었어요" : "줄었어요"}`
          : margin !== null
            ? "지금은 영업에서 흑자예요"
            : null;

  /**
   * B — 점 옆 문장은 **없다.** 방향은 위 줄들이 이미 하나하나 말했고, 점은 그 셋을
   * 5점으로 옮긴 그림이다. 여기에 요약을 또 쓰면 같은 말을 두 번 하는 것이다.
   */
  return { title, rows, score, scoreText: null, summaryText, method };
}

/**
 * ② 값은 어떤가요 — 비싼가 싼가.
 *
 * 비교 기준 우선순위는 WO §4-3 이 정했다: **① 업종 대푯값 → ② 이 회사 5년 밴드.**
 * 둘 다 없으면 그 줄을 안 만든다.
 *
 * 업종 비교는 **지표별로** 자기를 뺀 표본이 `SECTOR_MIN_MEMBERS` 이상일 때만 붙는다
 * (FIX-02 B-2·B-3) — PER 은 업종으로, PBR 은 5년 밴드로 나가는 것이 정상 결과다.
 *
 * **적자면 PER 을 안 쓴다** — 이익이 없으면 이익 배수는 값이 아니라 잡음이다(WO §4-4).
 */
export function valueGroup(input: CompanyReadInput): CompanyGroup {
  const rows: CompanyMetricRow[] = [];
  const v = input.valuation;
  const cands = input.sectorCandidates;
  const loss = input.margin.operatingTtm !== null && input.margin.operatingTtm <= 0;
  /** 어느 지표로 쟀는지 — 요약 문장의 **주어**가 된다(FIX-01 C-1). */
  const measured: string[] = [];
  /** 백분위가 낮을수록(= 쌀수록) 점이 높다. 「싸다」는 판단이 아니라 위치다. */
  const percentiles: number[] = [];
  /** 업종으로 잰 지표가 하나라도 있나 — 계산 방법·요약 문구가 갈린다. */
  let peer: SectorComparison | null = null;

  const perUsable = !loss && v.per !== null && v.per > 0;
  if (perUsable) {
    const cmp = sectorComparison(cands, "per", v.per);
    if (cmp) {
      rows.push({ label: "PER", value: times(v.per!), comparison: versusPeers(v.per!, cmp.median, times, cmp) });
      measured.push("PER");
      percentiles.push(Math.min(100, (v.per! / cmp.median) * 50));
      peer = cmp;
    } else if (v.perBand?.sufficient && v.perBand.percentile !== null) {
      rows.push({ label: "PER", value: times(v.per!), comparison: bandPhrase(v.perBand.percentile) });
      measured.push("PER");
      percentiles.push(v.perBand.percentile);
    }
  }
  if (v.pbr !== null && v.pbr > 0) {
    const cmp = sectorComparison(cands, "pbr", v.pbr);
    if (cmp) {
      rows.push({ label: "PBR", value: times(v.pbr), comparison: versusPeers(v.pbr, cmp.median, times, cmp) });
      measured.push("PBR");
      percentiles.push(Math.min(100, (v.pbr / cmp.median) * 50));
      peer = peer ?? cmp;
    } else if (v.pbrBand?.sufficient && v.pbrBand.percentile !== null) {
      rows.push({ label: "PBR", value: times(v.pbr), comparison: bandPhrase(v.pbrBand.percentile) });
      measured.push("PBR");
      percentiles.push(v.pbrBand.percentile);
    }
  }

  const method = peer
    ? `${peerNote(peer)}의 가운데 값과 견줘 5점으로 옮겼어요. 자기 자신은 빼고 셌어요.`
    : "이 회사의 최근 5년 값 분포에서 지금이 어디인지로 5점을 냈어요.";

  const title = "값은 어떤가요";
  if (percentiles.length === 0) {
    /**
     * 적자라서 못 잰 것 · 비교 대상이 모자라 못 잰 것 · 자료가 없어서 못 잰 것은 **다르다.**
     * FIX-02 D-1 — 어느 쪽인지 화면에 적는다.
     */
    const cannot = loss && rows.length === 0 ? "적자라서 이익으로는 값을 잴 수 없어요" : null;
    const missingReason = cannot
      ? undefined
      : v.per === null && v.pbr === null
        ? "값 지표를 아직 못 가져왔어요"
        : `같은 업종에 비교할 회사가 ${SECTOR_MIN_MEMBERS}곳이 안 되고, 5년 범위도 아직 짧아요`;
    return {
      title,
      rows,
      score: null,
      scoreText: cannot,
      summaryText: cannot,
      method,
      ...(missingReason ? { missingReason } : {}),
    };
  }
  const avg = percentiles.reduce((a, b) => a + b, 0) / percentiles.length;
  const score = Math.max(1, Math.min(5, Math.round(((100 - avg) / 100) * 5)));
  const where = avg <= 40 ? "낮은 편이에요" : avg >= 60 ? "높은 편이에요" : "가운데쯤이에요";
  const basis = peer ? `${peerPhrase(peer)} 가운데` : "최근 5년 중";
  /** C-1 — **무엇이** 낮은지 앞에 둔다. 주어 없이 형용사만 남기지 않는다. */
  const subject = measured.join("·");
  const summaryText = subject
    ? `${subject}${josa(subject, "이가")} ${basis} ${where}`
    : `값${josa("값", "은는")} ${basis} ${where}`;
  /**
   * B — 점 옆 문장은 **줄이 말하지 않은 것만.** 위 줄들이 이미 업종·5년 견줌을 말했으므로
   * 보통은 `null` 이다. 적자는 줄에 없는 사실이라 남긴다(PER 줄이 아예 없는 이유이기도 하다).
   */
  const scoreText = loss ? "적자라서 이익으로는 값을 잴 수 없어요" : null;
  return { title, rows, score, scoreText, summaryText, method };
}

/**
 * ③ 빚은 괜찮나요 — 위험한가.
 *
 * 부채비율은 업종에 따라 정상 범위가 완전히 다르다(은행 수백 % 대 소프트웨어 10%대).
 * 그래서 **업종 비교 대상이 없으면 점을 안 준다.** 절대 기준을 만들어 쓰면 반드시 틀린다.
 *
 * ## 금융 업종에는 **자기자본비율**을 쓴다 (FIX-02 PART C-3)
 *
 * 은행은 예금이 부채로 잡혀 부채비율이 원래 수백 %다. `부채비율 770.3%` 는 은행에서
 * 정상인데 사용자는 그걸 모른다. 같은 정보를 자기자본비율(자기자본 ÷ 총자산)로 옮기면
 * `11.5%` 가 되고, 그 숫자는 그 자체로 읽힌다. **새 수집이 없다** — `debt_to_equity`
 * 하나에서 나온다(자산 = 자기자본 + 부채).
 */
export function debtGroup(input: CompanyReadInput): CompanyGroup {
  const rows: CompanyMetricRow[] = [];
  const d = input.balance.debtToEquity;
  const title = "빚은 괜찮나요";
  const cmp = sectorComparison(input.sectorCandidates, "debtToEquity", d);

  if (d === null || !(d >= 0) || !cmp) {
    // FIX-02 D-1 — 자료가 없는 것과 비교 대상이 모자란 것은 다르다.
    const missingReason =
      d === null || !(d >= 0)
        ? "부채 자료를 아직 못 가져왔어요"
        : `같은 업종에 비교할 회사가 ${SECTOR_MIN_MEMBERS}곳이 안 돼요`;
    return {
      title,
      rows,
      score: null,
      scoreText: null,
      summaryText: null,
      method: "업종 비교 대상이 모자라 점을 내지 않았어요.",
      missingReason,
    };
  }

  const financial = isFinancialPeer(cmp);
  // 배수 → 퍼센트. 소수 한 자리까지 남긴다 — 반올림하면 `1%` 와 `1%` 가 되어 비교가 거짓말이 된다.
  const asPct = (v: number) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
  const ratioPct = (v: number) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;

  if (financial) {
    /**
     * 자기자본비율은 부채비율의 **단조 감소 변환**이라 비교 방향이 그대로 뒤집힌다
     * (부채가 적으면 자기자본비율이 높다). 중앙값도 같은 변환을 거친 값을 쓴다.
     */
    const mine = equityRatio(d);
    const theirs = equityRatio(cmp.median);
    rows.push({
      label: "자기자본비율",
      value: ratioPct(mine),
      comparison: versusPeers(mine, theirs, ratioPct, cmp),
    });
  } else {
    rows.push({ label: "부채비율", value: asPct(d), comparison: versusPeers(d, cmp.median, asPct, cmp) });
  }

  const ratio = d / cmp.median;
  const score = ratio <= 0.5 ? 5 : ratio <= 0.8 ? 4 : ratio <= 1.2 ? 3 : ratio <= 2 ? 2 : 1;
  /** C-2 — 요약에는 주어(`빚은`)를 둔다. B — 점 옆에는 되풀이하지 않는다(줄이 이미 말했다). */
  const summaryText =
    ratio <= 0.8 ? "빚은 같은 업종보다 적어요" : ratio <= 1.2 ? "빚은 같은 업종과 비슷해요" : "빚은 같은 업종보다 많아요";
  const method = financial
    ? `${peerNote(cmp)}의 자기자본비율 가운데 값과 견줬어요. 은행·보험은 예금이 부채로 잡혀 부채비율 대신 자기자본비율을 봐요.`
    : `${peerNote(cmp)}의 부채비율 가운데 값과 견줬어요. 자기 자신은 빼고 셌어요.`;
  return { title, rows, score, scoreText: null, summaryText, method };
}

/**
 * 세 덩어리. **합친 점수는 없다**(WO 하지 말 것).
 *
 * 줄도 점도 없는 덩어리는 **빼고 내보낸다** — 빈 제목만 있는 칸을 만들지 않는다.
 */
export function companyRead(input: CompanyReadInput): CompanyGroup[] {
  const groups = [earningsGroup(input), valueGroup(input), debtGroup(input)];
  const hasContent = (g: CompanyGroup) =>
    g.rows.length > 0 || g.score !== null || g.scoreText !== null || g.summaryText !== null;
  /**
   * FIX-02 D-2 — **하나라도 내용이 있으면 세 덩어리를 다 보낸다.** 빈 덩어리는 사유를 들고
   * 나가고(D-1), 셋 다 비면 빈 배열이라 걸음 자체가 사라진다.
   *
   * 종전에는 빈 덩어리만 조용히 뺐다. 그래서 종목마다 섹션 구성이 달라졌고, 사용자는
   * 「왜 이 종목만 없지」를 알 수 없었다.
   */
  return groups.some(hasContent) ? groups : [];
}
