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
 * `업종 중간값 18배보다 낮아요` 는 사실이고, `저평가예요` 는 판단이다.
 */

import type { SectorStat } from "./sector-stats";

/** 한 줄 — 숫자와 **그 숫자를 읽는 문장**. 문장이 없으면 이 줄은 만들어지지 않는다. */
export interface CompanyMetricRow {
  label: string;
  /** 화면에 쓸 값 문자열 — `12.3배` / `42%`. */
  value: string;
  /** 비교 문장 — `업종 중간값 18.0배보다 낮아요`. **이게 없으면 줄이 없다.** */
  comparison: string;
}

/** 한 덩어리. */
export interface CompanyGroup {
  /** `돈은 잘 버나요` 처럼 **질문**으로 쓴다. 라벨이 아니라 질문이어야 답이 읽힌다. */
  title: string;
  rows: CompanyMetricRow[];
  /** 5점 만점. 잴 수 없으면 `null` — 점만 두지 않고 문장과 함께 나간다. */
  score: number | null;
  /** 점 옆에 붙는 문장. `score` 가 있으면 **반드시** 있다. */
  scoreText: string | null;
  /** 이 덩어리를 어떻게 냈는지 — 화면의 `어떻게 계산했나요` 가 그대로 쓴다. */
  method: string;
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
  sector: SectorStat | null;
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

/** 업종 중간값과 견준 문장. 같은 값이면 `비슷해요` — 억지로 높다/낮다를 만들지 않는다. */
function versusSector(mine: number, theirs: number, unit: (v: number) => string, label: string): string {
  const gap = (mine - theirs) / theirs;
  const base = `${label} 중간값 ${unit(theirs)}`;
  if (Math.abs(gap) < 0.05) return `${base}과 비슷해요`;
  return `${base}보다 ${mine < theirs ? "낮아요" : "높아요"}`;
}

/**
 * ① 돈은 잘 버나요 — 사업이 되는가.
 *
 * 점수는 **매출 추세 + 영업이익 추세 + 흑자 여부** 셋을 각각 세고 5점으로 옮긴다(WO §4-5).
 * 하나도 못 재면 점을 안 준다. 재료가 없으면 없다고 하는 편이 맞다.
 */
export function earningsGroup(input: CompanyReadInput): CompanyGroup {
  const rows: CompanyMetricRow[] = [];
  const g = input.growth;

  if (g.revenueYoy !== null) {
    const trend = g.revenueCagr3y !== null && g.revenueCagr3y > 0 ? " · 3년째 늘고 있어요" : "";
    rows.push({
      label: "매출",
      value: pct(g.revenueYoy),
      comparison: `작년보다 ${g.revenueYoy >= 0 ? "늘었어요" : "줄었어요"}${trend}`,
    });
  }
  if (g.operatingIncomeYoy !== null) {
    rows.push({
      label: "영업이익",
      value: pct(g.operatingIncomeYoy),
      comparison: `작년보다 ${g.operatingIncomeYoy >= 0 ? "늘었어요" : "줄었어요"}`,
    });
  }

  const marks: number[] = [];
  if (g.revenueYoy !== null) marks.push(g.revenueYoy > 0 ? 1 : 0);
  if (g.operatingIncomeYoy !== null) marks.push(g.operatingIncomeYoy > 0 ? 1 : 0);
  if (input.margin.operatingTtm !== null) marks.push(input.margin.operatingTtm > 0 ? 1 : 0);

  const method = "매출 증가·영업이익 증가·흑자 여부 셋을 세어 5점으로 옮겼어요.";
  if (marks.length === 0) return { title: "돈은 잘 버나요", rows, score: null, scoreText: null, method };

  const hit = marks.reduce((a, b) => a + b, 0);
  const score = Math.max(1, Math.round((hit / marks.length) * 5));
  const loss = input.margin.operatingTtm !== null && input.margin.operatingTtm <= 0;
  const scoreText = loss
    ? "지금은 영업에서 적자예요"
    : hit === marks.length
      ? "매출도 이익도 늘고 있어요"
      : hit === 0
        ? "매출도 이익도 줄고 있어요"
        : "늘어난 것과 줄어든 것이 섞여 있어요";
  return { title: "돈은 잘 버나요", rows, score, scoreText, method };
}

/**
 * ② 값은 어떤가요 — 비싼가 싼가.
 *
 * 비교 기준 우선순위는 WO §4-3 이 정했다: **① 업종 중간값 → ② 이 회사 5년 밴드.**
 * 둘 다 없으면 그 줄을 안 만든다.
 *
 * **적자면 PER 을 안 쓴다** — 이익이 없으면 이익 배수는 값이 아니라 잡음이다(WO §4-4).
 */
export function valueGroup(input: CompanyReadInput): CompanyGroup {
  const rows: CompanyMetricRow[] = [];
  const v = input.valuation;
  const sector = input.sector;
  const loss = input.margin.operatingTtm !== null && input.margin.operatingTtm <= 0;

  if (!loss && v.per !== null && v.per > 0) {
    if (sector?.per) {
      rows.push({ label: "PER", value: times(v.per), comparison: versusSector(v.per, sector.per, times, `${sector.label} 업종`) });
    } else if (v.perBand?.sufficient && v.perBand.percentile !== null) {
      rows.push({ label: "PER", value: times(v.per), comparison: bandPhrase(v.perBand.percentile) });
    }
  }
  if (v.pbr !== null && v.pbr > 0) {
    if (sector?.pbr) {
      rows.push({ label: "PBR", value: times(v.pbr), comparison: versusSector(v.pbr, sector.pbr, times, `${sector.label} 업종`) });
    } else if (v.pbrBand?.sufficient && v.pbrBand.percentile !== null) {
      rows.push({ label: "PBR", value: times(v.pbr), comparison: bandPhrase(v.pbrBand.percentile) });
    }
  }

  const method = sector
    ? `같은 업종(${sector.label}) ${sector.members}종목의 중간값과 견줘 5점으로 옮겼어요.`
    : "이 회사의 최근 5년 값 분포에서 지금이 어디인지로 5점을 냈어요.";

  /** 백분위가 낮을수록(= 쌀수록) 점이 높다. 「싸다」는 판단이 아니라 위치다. */
  const percentiles: number[] = [];
  if (sector) {
    if (!loss && v.per !== null && v.per > 0 && sector.per) percentiles.push(Math.min(100, (v.per / sector.per) * 50));
    if (v.pbr !== null && v.pbr > 0 && sector.pbr) percentiles.push(Math.min(100, (v.pbr / sector.pbr) * 50));
  } else {
    if (!loss && v.perBand?.sufficient && v.perBand.percentile !== null) percentiles.push(v.perBand.percentile);
    if (v.pbrBand?.sufficient && v.pbrBand.percentile !== null) percentiles.push(v.pbrBand.percentile);
  }

  const title = "값은 어떤가요";
  if (percentiles.length === 0) {
    // 적자라서 못 잰 것과 데이터가 없어서 못 잰 것은 다르다. 다른 말을 쓴다.
    const scoreText = loss && rows.length === 0 ? "적자라서 이익으로는 값을 잴 수 없어요" : null;
    return { title, rows, score: null, scoreText, method };
  }
  const avg = percentiles.reduce((a, b) => a + b, 0) / percentiles.length;
  const score = Math.max(1, Math.min(5, Math.round(((100 - avg) / 100) * 5)));
  const where = avg <= 40 ? "낮은 편이에요" : avg >= 60 ? "높은 편이에요" : "가운데쯤이에요";
  const scoreText = loss
    ? `적자라서 이익으로는 값을 잴 수 없어요 · 자산 기준으로는 ${where}`
    : sector
      ? `${sector.label} 업종 안에서 ${where}`
      : `최근 5년 중 ${where}`;
  return { title, rows, score, scoreText, method };
}

/**
 * ③ 빚은 괜찮나요 — 위험한가.
 *
 * 부채비율은 업종에 따라 정상 범위가 완전히 다르다(은행 1,000% 대 소프트웨어 10%대).
 * 그래서 **업종 중간값이 없으면 점을 안 준다.** 절대 기준을 만들어 쓰면 반드시 틀린다.
 */
export function debtGroup(input: CompanyReadInput): CompanyGroup {
  const rows: CompanyMetricRow[] = [];
  const d = input.balance.debtToEquity;
  const sector = input.sector;
  const method = sector
    ? `같은 업종(${sector.label}) ${sector.members}종목의 부채비율 중간값과 견줬어요.`
    : "업종 비교 대상이 모자라 점을 내지 않았어요.";
  const title = "빚은 괜찮나요";

  if (d === null || !(d >= 0) || !sector?.debtToEquity) {
    return { title, rows, score: null, scoreText: null, method };
  }
  // 배수 → 퍼센트. 소수 한 자리까지 남긴다 — 반올림하면 `1%` 와 `1%` 가 되어 비교가 거짓말이 된다.
  const asPct = (v: number) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
  rows.push({
    label: "부채비율",
    value: asPct(d),
    comparison: versusSector(d, sector.debtToEquity, asPct, `${sector.label} 업종`),
  });
  const ratio = d / sector.debtToEquity;
  const score = ratio <= 0.5 ? 5 : ratio <= 0.8 ? 4 : ratio <= 1.2 ? 3 : ratio <= 2 ? 2 : 1;
  const scoreText =
    ratio <= 0.8 ? "같은 업종보다 빚이 적어요" : ratio <= 1.2 ? "같은 업종과 비슷해요" : "같은 업종보다 빚이 많아요";
  return { title, rows, score, scoreText, method };
}

/**
 * 세 덩어리. **합친 점수는 없다**(WO 하지 말 것).
 *
 * 줄도 점도 없는 덩어리는 **빼고 내보낸다** — 빈 제목만 있는 칸을 만들지 않는다.
 */
export function companyRead(input: CompanyReadInput): CompanyGroup[] {
  return [earningsGroup(input), valueGroup(input), debtGroup(input)].filter(
    (g) => g.rows.length > 0 || g.score !== null || g.scoreText !== null
  );
}
