/**
 * WO-G1A2 「오늘의 조용한 픽」 후킹 레이어 — 이례성을 언어화(결정론).
 * WO-SUB-HOOK 재설계 — **훅은 한 문장, 나머지 사실은 칩으로 내린다.**
 *
 * ## 무엇이 바뀌었나 (2026-08-14 화면 실측 D1·D2·D3)
 *
 * 종전 훅은 이례성 문구 두 개를 em-dash 로 이어 붙였다:
 *   `기관이 25일 연속 — 최근 40거래일 중 가장 길어요 — 거래가 평소의 25%로 말라 있던 자리예요`
 * 세 개의 사실을 한 줄에 밀어 넣은 나열이라 3줄을 먹고, 읽는 사람은 어디를 볼지 모른다.
 * 게다가 이례성 중 가장 약한 것(침묵)이 유일한 지표인 종목은 훅이 부정문으로 시작했다
 * (`거래량도 안 늘었어요`) — 무엇이 일어났는지가 없고 무엇이 안 일어났는지만 남았다.
 *
 * 그래서 역할을 갈랐다.
 *  · **훅** = 무슨 일이 일어났나 한 문장(주체 · 지속 · 매수). 이례성은 훅이 말하지 않는다.
 *  · **칩** = 이례성 근거. 서로 다른 축(무엇이 이례적인가 / 규모 / 시점) 최대 3개.
 *
 * 훅 규칙(테스트로 강제 — quiet-pick-hook.test.ts):
 *  H1 1문장(em-dash·세미콜론으로 절을 잇지 않는다) · H2 최대 2줄 28자/줄 ·
 *  H3 부정문으로 시작 금지 · H4 훅이 가진 축(주체·인원·지속)은 칩으로 다시 만들지 않는다 ·
 *  H5 금지어(자리·클러스터·관점·무효·내부자·수급·이례적) · H6 서브라인은 훅과 겹치면 미표시.
 *
 * 순수·결정론(같은 입력 → 같은 출력). 수치는 전부 엔진이 실계산해 넘긴다(가짜 금지 — 미상이면 필드 생략).
 * **신호 산출 로직은 건드리지 않았다** — 이 파일은 문자열 조립부다(WO §1-3).
 */

import { josa } from "./josa";

export type QuietPickSignalKind =
  | "insider_cluster"
  | "institution_streak"
  | "foreign_streak"
  | "multi_cluster"
  /** WO-RESET-03 A-1 — 시장은 빠지는데 이것만 버틴다. 「누가 샀나」가 아닌 첫 신호다. */
  | "market_divergence"
  /** WO-RESET-03 A-6 — 조용하던 거래가 붙기 시작했다. */
  | "volume_awakening";

export type QuietPickAnomalyKind = "frequency" | "participants" | "scale" | "silence" | "vacuum" | "near_low";

/** 칩 축 — 한 카드에 같은 축을 두 번 올리지 않는다(칩 3개는 서로 다른 축, WO §1-2). */
export type QuietPickChipAxis = "unusual" | "position" | "quiet" | "size" | "time";

export interface QuietPickAnomaly {
  kind: QuietPickAnomalyKind;
  /** 디테일("왜 지금인가")에 쓰는 사람 말 문장(실수치 포함). */
  text: string;
  /**
   * 카드 칩 문구 — **훅이 말하지 않는 축만**. 훅이 이미 말하는 사실(주체·인원·지속)은 `null`.
   * 칩은 문장이 아니라 라벨이다("40거래일 중 최장").
   */
  chip: string | null;
  /** 칩이 차지하는 축. 칩이 없으면 축도 없다. */
  axis: QuietPickChipAxis | null;
  /** 정렬용 강도(빈도>참여>규모>침묵). */
  strength: number;
}

/** 엔진이 실계산해 넘기는 이례성 원료. 미상 필드는 넘기지 않는다(생략=정답). */
export interface QuietPickAnomalyFacts {
  kind: QuietPickSignalKind;
  /** 주체 명사 — "임원" / "외국인" / "기관" / "외국인·기관". */
  actorNoun: string;
  /** 카드 사실용 규모 문구 — "$4.8M" / "31만주". */
  scale: string;
  days: number;
  insiderCount?: number;
  /** US: openinsider 지난 12개월(최근 2주 제외) 임원 매수 건수. */
  priorBuys12mo?: number;
  /** 매수량 ÷ 20일 평균 거래량 × 100 ("하루 거래량의 N%"). */
  volumePct?: number;
  /** 매수금액 ÷ 시총 × 100 (US, "시총의 N%"). */
  mcapPct?: number;
  /** 오늘 뉴스 언급 수(0/부재 = 조용). */
  mentionCount?: number;
  /** 거래량이 평소 이상인가(volumeRatio>=1). */
  volumeElevated?: boolean;
  /** KR: 현재 streak 이 조회 창 내 최장인가. */
  isLongestStreak?: boolean;
  /** KR: 최장 비교에 쓴 창(거래일). */
  streakWindowDays?: number;
  /**
   * 거래량 진공(WO-P4) — 최근 20일 평균이 그 앞 60일 평균의 몇 배인가(0.6 이하면 말라 있었다).
   * "거래가 마른 곳에 돈이 들어왔다"는 이 제품에서 가장 좋은 후킹 재료다.
   */
  volumeVacuumRatio?: number;
  /** 52주 저점 대비 현재가 위치(%). 15 이내면 저점권 조용한 매수. */
  pctAboveYearLow?: number;
  /**
   * D형(시장 역행) — 같은 기간 지수 변동률(%). 음수다(지수가 내린 구간에서만 성립).
   * 이것이 없으면 "시장이 내렸다"를 말할 수 없어 훅이 일반 매수 문장으로 떨어진다.
   */
  indexChangePct?: number;
  /** D형 — 비교한 지수 이름(`코스피`/`코스닥`). */
  indexLabel?: string;
  /**
   * D형 — 같은 기간 **이 종목의** 등락률(%).
   *
   * 지수 숫자만 쓰면 같은 시장의 카드가 **전부 같은 칩**을 단다(실측: 코스닥 7장이
   * `4일 연속 시장 상회` · `코스닥 -1.7%` 로 글자 하나 안 틀리고 같았다). 종목 숫자가
   * 그 일곱 장을 서로 다른 카드로 만든다.
   */
  stockChangePct?: number;
  /** E형(거래량 각성) — 최근 거래량이 기준 평균의 몇 배인가. */
  volumeMultiple?: number;
  /** E형 — 급증 시작 직전 → 오늘 순변동률(%). 당일 변동이 아니다. */
  spikeMovePct?: number;
}

const iGa = (word: string) => `${word}${josa(word, "이가")}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 이례성 지표 계산 — 보유 수치만. 강도 내림차순. 빈 배열이면 "후킹 없음"(엔진이 발행 제외).
 * 지표별 임계는 전부 결정론 상수.
 */
export function computeQuietPickAnomalies(f: QuietPickAnomalyFacts): QuietPickAnomaly[] {
  const out: QuietPickAnomaly[] = [];
  const insider = f.kind === "insider_cluster";
  /**
   * WO-RESET-03 의 두 형은 **매수가 없다.** 아래 지표 대부분(매수량 대비 거래량, 매수 빈도)은
   * 「누가 얼마 샀나」를 전제로 하고, 그대로 쓰면 말이 어긋난다 — 특히 E형(거래량 각성)에
   * `거래량 평소의 39%`(=거래가 말라 있다) 칩이 붙으면 훅(`거래량 3배`)과 **정면으로 모순**이다.
   * 그래서 이 형들은 제 재료로만 칩을 만든다.
   */
  if (f.kind === "market_divergence" || f.kind === "volume_awakening") {
    if (f.kind === "market_divergence") {
      if (f.days > 0) {
        out.push({
          kind: "frequency",
          strength: 4.0,
          text: `${f.days}일 연속 시장보다 강했어요`,
          chip: `${f.days}일 연속 시장 상회`,
          axis: "unusual",
        });
      }
      /**
       * 지수 대비 **격차**를 쓴다. 지수 숫자만 쓰면 같은 시장 카드가 전부 같은 칩을 단다 —
       * 격차는 종목마다 다르므로 일곱 장이 서로 다른 카드가 된다.
       */
      if (typeof f.indexChangePct === "number" && f.indexChangePct < 0) {
        const label = f.indexLabel ?? "지수";
        if (typeof f.stockChangePct === "number") {
          out.push({
            kind: "scale",
            strength: 3.8,
            text: `같은 기간 ${label}는 ${round1(f.indexChangePct)}%, 이 종목은 ${round1(f.stockChangePct)}% 였어요`,
            // 소수 첫째 자리로 통일한다 — `7%p` 와 `7.6%p` 가 한 화면에 섞이면 정밀도가 달라 보인다.
            chip: `${label}보다 ${(f.stockChangePct - f.indexChangePct).toFixed(1)}%p 위`,
            axis: "size",
          });
        } else {
          out.push({
            kind: "scale",
            strength: 3.4,
            text: `같은 기간 ${label}는 ${round1(f.indexChangePct)}% 였어요`,
            chip: `${label} ${round1(f.indexChangePct)}%`,
            axis: "size",
          });
        }
      }
    } else {
      if (typeof f.volumeMultiple === "number" && f.volumeMultiple >= 2) {
        out.push({
          kind: "scale",
          strength: 4.2,
          text: `최근 거래량이 평소의 ${Math.round(f.volumeMultiple)}배예요`,
          chip: `거래량 ${Math.round(f.volumeMultiple)}배`,
          axis: "size",
        });
      }
      if (typeof f.spikeMovePct === "number") {
        const moved = round1(Math.abs(f.spikeMovePct));
        out.push({
          kind: "silence",
          strength: 3.0,
          text: `그 사이 주가는 ${moved}% 움직였어요`,
          chip: `주가 ${moved}%`,
          axis: "quiet",
        });
      }
    }
    if (typeof f.pctAboveYearLow === "number" && f.pctAboveYearLow <= 15) {
      const pct = Math.max(0, Math.round(f.pctAboveYearLow));
      out.push({
        kind: "near_low",
        strength: 2.8,
        text: `52주 저점에서 ${pct}% 위예요`,
        chip: `52주 저점 +${pct}%`,
        axis: "position",
      });
    }
    return out.sort((a, b) => b.strength - a.strength);
  }

  // ② 빈도 이례성 — 가장 강력.
  if (insider && typeof f.priorBuys12mo === "number" && typeof f.insiderCount === "number") {
    if (f.priorBuys12mo <= 8) {
      const strong = f.priorBuys12mo <= 2 || f.insiderCount >= 8;
      const zero = f.priorBuys12mo === 0;
      out.push({
        kind: "frequency",
        strength: strong ? 4.3 : 3.4,
        text: zero
          ? "지난 1년간 임원이 산 적이 없었어요"
          : `지난 1년 임원 매수는 ${f.priorBuys12mo}건뿐이었어요`,
        chip: zero ? "1년 만의 매수" : `1년 매수 ${f.priorBuys12mo}건`,
        axis: "unusual",
      });
    }
  }
  if (!insider && f.isLongestStreak && f.days >= 3) {
    const window = f.streakWindowDays ?? f.days;
    out.push({
      kind: "frequency",
      strength: 4.0,
      // 훅이 "N일째 사고 있어요" 를 말하므로 여기선 **비교 축(창 안에서 최장)** 만 남긴다.
      text: `최근 ${window}거래일 중 가장 긴 연속 매수예요`,
      chip: `${window}거래일 중 최장`,
      axis: "unusual",
    });
  }

  // ③ 참여자 수 이례성(임원) — **칩 없음**. 인원은 훅이 이미 말한다(H4).
  if (insider && typeof f.insiderCount === "number") {
    if (f.insiderCount >= 8) {
      out.push({ kind: "participants", strength: 3.6, text: `임원 ${f.insiderCount}명이 한꺼번에 샀어요`, chip: null, axis: null });
    } else if (f.insiderCount >= 4) {
      out.push({ kind: "participants", strength: 2.8, text: `임원 ${f.insiderCount}명이 함께 샀어요`, chip: null, axis: null });
    }
  }

  // ① 규모 상대화. 100% 초과는 %가 아니라 '배'로(초유동성 마이크로캡에서 522% 같은 비현실 표기 방지).
  if (typeof f.volumePct === "number" && f.volumePct >= 20) {
    const magnitude = f.volumePct >= 100
      ? `하루 거래량의 ${Math.round(f.volumePct / 100)}배`
      : `하루 거래량의 ${Math.round(f.volumePct)}%`;
    out.push({
      kind: "scale",
      strength: f.volumePct >= 40 ? 3.2 : 2.2,
      text: `${iGa(f.actorNoun)} ${magnitude}를 사들였어요`,
      chip: magnitude,
      axis: "size",
    });
  }
  if (typeof f.mcapPct === "number" && f.mcapPct >= 1) {
    out.push({
      kind: "scale",
      strength: f.mcapPct >= 5 ? 3.4 : 2.4,
      text: `임원들이 시총의 ${round1(f.mcapPct)}%를 사들였어요`,
      chip: `시총의 ${round1(f.mcapPct)}%`,
      axis: "size",
    });
  }

  // ⑤ 거래량 진공 — 말라 있던 곳(WO-P4 신호망 확장).
  if (typeof f.volumeVacuumRatio === "number" && f.volumeVacuumRatio <= 0.6) {
    const pct = Math.round(f.volumeVacuumRatio * 100);
    out.push({
      kind: "vacuum",
      strength: f.volumeVacuumRatio <= 0.4 ? 3.5 : 2.6,
      text: `거래가 평소의 ${pct}%로 말라 있었어요`,
      chip: `거래량 평소의 ${pct}%`,
      /**
       * 거래량 이야기이므로 `quiet` 다. 종전에는 `position` 이었는데 그게 두 가지를 망가뜨렸다
       * (CTX-05 §5 · 2026-08-16 발행분 실측).
       *
       * ① 같은 거래량 사실인 `silence`("거래량은 그대로")가 `quiet` 라 **축 중복 제거를 빠져나가**
       *    두 칩이 함께 실렸다 — 빅텍 카드가 정확히 그랬다.
       * ② `position` 은 `near_low`("52주 저점 +N%")의 축인데 이쪽 강도가 더 높아
       *    **진짜 가격 위치 칩을 밀어냈다.**
       *
       * 이제 거래량끼리 한 축에서 겨루고(강도순으로 하나만 남는다) `position` 은 가격에 돌려준다.
       */
      axis: "quiet",
    });
  }

  // ⑥ 52주 저점권 조용한 매수.
  if (typeof f.pctAboveYearLow === "number" && f.pctAboveYearLow <= 15) {
    const pct = Math.max(0, Math.round(f.pctAboveYearLow));
    out.push({
      kind: "near_low",
      strength: 2.4,
      text: `52주 저점에서 ${pct}% 위예요`,
      chip: `52주 저점 +${pct}%`,
      axis: "position",
    });
  }

  // ④ 침묵의 정도(보조 — 오늘 데이터 기준, 과장 금지).
  if (f.mentionCount === 0) {
    out.push({ kind: "silence", strength: 1.2, text: "아직 뉴스엔 안 잡혀요", chip: "뉴스 없음", axis: "quiet" });
  }
  if (f.volumeElevated === false) {
    out.push({ kind: "silence", strength: 1.0, text: "거래량은 그대로예요", chip: "거래량은 그대로", axis: "quiet" });
  }

  return out.sort((a, b) => b.strength - a.strength);
}

/** 훅의 주체 표기 — 원료의 `actorNoun` 이 아니라 **신호 종류**에서 만든다(금지어 유입 차단). */
const HOOK_ACTOR: Record<QuietPickSignalKind, string> = {
  insider_cluster: "임원",
  institution_streak: "기관",
  foreign_streak: "외국인",
  multi_cluster: "외국인과 기관",
  /**
   * WO-RESET-03 의 새 신호들은 **주체가 없다** — 「누가 샀나」가 아니라 가격·거래량의 흔적이다.
   * 그래서 주체 자리를 비운다. 이 형들의 문장은 `marketDivergenceCard` ·
   * `volumeAwakeningCard` 가 통째로 만들고, 여기 값은 쓰이지 않는다(형 분기가 먼저 걸린다).
   */
  market_divergence: "",
  volume_awakening: "",
};

/**
 * 임원 매수 기간구 — "8일 새 " / (하루 이하면 빈 문자열).
 *
 * ## 고유어 수 표현을 쓰지 않는다 (WO-HOOK-01 §9)
 *
 * 종전에는 2~10일을 `이틀·사흘·…·여드레·아흐레·열흘` 로 썼다. 자연스러워 보였지만 실제
 * 카드에서 **`임원 4명이 여드레 새 함께 매수`** 가 나왔고, 읽는 사람이 며칠인지 즉시
 * 세지 못한다. 후킹은 0.5초 안에 읽혀야 하는데 고유어는 변환 한 단계를 더 요구한다.
 * 아라비아 숫자 + `일` 로 통일한다. 회귀는 `quiet-pick-hook.test.ts` 가 고정한다.
 */
function insiderWindowPhrase(days: number): string {
  if (days <= 1) return "";
  return `${days}일 새 `;
}

/**
 * 결론 — **무슨 일이 일어났나 한 마디.** 기획자 모킹(DS-01 §3-③) 기준 **명사형**이다.
 *
 * ## 왜 해요체를 버렸나
 *
 * 종전 `기관이 25일째 조용히 사고 있어요` 는 24px·줄당 14자에서 두 줄째가 `요` 한 글자로
 * 떨어졌다. 명사형이 더 짧고 강하다 — `기관이 조용히 25일째 매수 중`.
 * 결론만 예외로 명사형을 쓰고, 나머지 문장은 전부 해요체다(DS-00 §3-2).
 *
 * ## 유형별 (DS-01 §3-③ 표)
 *
 * | 신호 | 결론 |
 * |---|---|
 * | 임원, 1년 매수 0~1건 | `1년 만에 임원이 처음으로 대량 매수` |
 * | 임원 N명 | `임원 3명이 5일 새 함께 매수` |
 * | 기관·외국인, 창 내 최장 | `기관이 40거래일 중 가장 길게 매수 중` |
 * | 기관·외국인 | `기관이 조용히 12일째 매수 중` |
 * | 외국인+기관 | `외국인과 기관이 4일째 같이 매수` |
 */
export function buildQuietPickHook(f: QuietPickAnomalyFacts): string {
  const actor = HOOK_ACTOR[f.kind];

  /**
   * WO-RESET-03 의 두 형은 **주체가 없다.** 「누가 샀나」가 아니라 가격·거래량의 흔적이다.
   *
   * 이 분기가 없으면 아래 연속매수 템플릿으로 떨어지고, `HOOK_ACTOR` 가 빈 문자열이라
   * **`가 조용히 4일째 매수 중`** 이라는 문장이 나온다(2026-08-26 프로덕션 실측, 15장 중 8장).
   * 주어가 없는 것보다 나쁜 것은 **틀린 말**이라는 점이다 — 시장 역행 카드는 아무도 사고 있지
   * 않다. 지수가 내리는데 이 종목만 버틴다는 뜻이다. 형마다 제 문장을 갖는다.
   */
  if (f.kind === "market_divergence") {
    const days = f.days > 0 ? `${f.days}일` : "며칠";
    if (typeof f.indexChangePct === "number" && f.indexChangePct < 0) {
      const label = f.indexLabel ?? "시장";
      return `${label} ${round1(Math.abs(f.indexChangePct))}% 빠진 ${days}, 혼자 버팀`;
    }
    return `시장이 빠진 ${days} 내내 혼자 버팀`;
  }

  if (f.kind === "volume_awakening") {
    const times = typeof f.volumeMultiple === "number" ? Math.round(f.volumeMultiple) : 0;
    const head = times >= 2 ? `거래량 ${times}배` : "거래가 붙기 시작";
    // 가격이 실제로 얼마나 안 움직였는지를 함께 말한다 — "그대로"는 우리가 쓴 말이고,
    // 숫자는 잰 값이다. 잰 값이 없으면 형용사도 안 쓴다.
    if (typeof f.spikeMovePct === "number") {
      return `${head}, 주가는 ${round1(Math.abs(f.spikeMovePct))}%`;
    }
    return `${head}, 주가는 아직`;
  }

  if (f.kind === "insider_cluster") {
    // 1년간 산 적이 거의 없던 회사에서 나온 매수 — 가장 강한 결론이다.
    const firstInYear = typeof f.priorBuys12mo === "number" && f.priorBuys12mo <= 1;
    if (firstInYear) return "1년 만에 임원이 처음으로 대량 매수";
    const window = insiderWindowPhrase(f.days);
    const n = f.insiderCount;
    if (typeof n !== "number" || n <= 0) return `임원이 ${window}대량 매수`;
    if (n === 1) return `임원 한 명이 ${window}매수`;
    return `임원 ${n}명이 ${window}함께 매수`;
  }

  if (f.kind === "multi_cluster") {
    if (f.days <= 0) return "외국인과 기관이 같이 매수";
    return `외국인과 기관이 ${f.days}일째 같이 매수`;
  }

  /**
   * 창 안에서 가장 긴 연속 매수 — "얼마나 드문가" 가 결론이 된다.
   *
   * 일수를 함께 쓴다. 모킹 표의 `기관이 40거래일 중 가장 길게 매수 중` 은 창(40)이 같은
   * 종목들에서 **덱 전체가 같은 문장**이 된다 — 한 화면에 같은 말 일곱 번은 소음이다.
   */
  if (f.isLongestStreak && f.days >= 3) {
    return `${iGa(actor)} ${f.streakWindowDays ?? f.days}거래일 중 가장 긴 ${f.days}일 매수`;
  }
  if (f.days <= 0) return `${iGa(actor)} 조용히 매수 중`;
  return `${iGa(actor)} 조용히 ${f.days}일째 매수 중`;
}

/** 축 우선순위 — 임원 매수는 금액이 먼저 읽히고, 연속 매수는 "얼마나 드문가"가 먼저 읽힌다. */
const AXIS_ORDER: Record<"insider" | "streak", readonly QuietPickChipAxis[]> = {
  insider: ["size", "unusual", "quiet", "position", "time"],
  streak: ["unusual", "position", "quiet", "size", "time"],
};

const MAX_CHIPS = 3;

/**
 * 카드 칩 — 훅이 말하지 않는 근거만, **서로 다른 축**으로 최대 3개.
 *
 * 조립 순서
 *  1. 이례성 칩(강도순, 축당 하나).
 *  2. 규모 사실 칩(`기관 74주` / `$3.6M`) — 상대 규모 칩이 이미 size 축을 먹었으면 생략한다.
 *  3. 축이 모자라면 지속 칩(`4일 연속` / `최근 3일`)으로 채운다. 훅과 일수가 겹치지만,
 *     칩 두 개짜리 카드를 만드는 것보다 낫다(골든 케이스 2·3이 이 형태다).
 *
 * 골든 케이스:
 *   빅텍   [40거래일 중 최장] [거래량 평소의 25%] [기관 74주]
 *   한미   [거래량은 그대로]  [47만주]            [4일 연속]
 *   Amrize [$3.6M]           [52주 저점 +1%]     [최근 3일]
 */
export function buildQuietPickChips(f: QuietPickAnomalyFacts): string[] {
  const anomalies = computeQuietPickAnomalies(f);
  const insider = f.kind === "insider_cluster";
  const byAxis = new Map<QuietPickChipAxis, string>();

  for (const anomaly of anomalies) {
    if (!anomaly.chip || !anomaly.axis) continue;
    if (!byAxis.has(anomaly.axis)) byAxis.set(anomaly.axis, anomaly.chip);
  }

  // 규모 사실 — 상대 규모(하루 거래량의 N%)가 이미 있으면 같은 축을 두 번 쓰지 않는다.
  if (!byAxis.has("size") && f.scale.trim()) {
    // 주체는 훅이 말하지만, 낱 숫자만 있는 칩은 무엇의 수량인지 알기 어렵다.
    // 단일 주체(기관·외국인)일 때만 주체를 붙인다 — "외국인·기관 47만주" 는 칩으로 길다.
    // 주체가 없는 형(D·E)은 `f.actorNoun` 이 빈 문자열이라 그대로 붙이면 칩이 ` 3배` 로
    // 앞에 공백을 달고 나간다(2026-08-26 프로덕션 실측). 있을 때만 붙인다.
    const single = !insider && !!f.actorNoun.trim() && !f.actorNoun.includes("·");
    byAxis.set("size", single ? `${f.actorNoun.trim()} ${f.scale.trim()}` : f.scale.trim());
  }

  /**
   * 기간 칩 — **훅이 이미 일수를 말하면 만들지 않는다**(H4: 훅이 가진 축은 칩으로 반복하지 않는다).
   *
   * 종전에는 임원 훅이 `사흘 새` 처럼 고유어라 숫자가 겹쳐 보이지 않았고, 그래서 `최근 3일` 칩이
   * 그대로 나갔다. WO-HOOK-01 §9 로 훅이 `3일 새` 가 되자 한 화면에 `3` 이 세 번(훅·$3.6M·칩)
   * 나왔다 — 고유어가 중복을 가리고 있었을 뿐 중복은 처음부터 있었다.
   */
  if (f.days > 0 && !buildQuietPickHook(f).includes(`${f.days}일`)) {
    byAxis.set("time", insider ? `최근 ${f.days}일` : `${f.days}일 연속`);
  }

  const order = AXIS_ORDER[insider ? "insider" : "streak"];
  const chips: string[] = [];
  for (const axis of order) {
    const chip = byAxis.get(axis);
    if (chip && !chips.includes(chip)) chips.push(chip);
    if (chips.length >= MAX_CHIPS) break;
  }
  return chips;
}

/**
 * 서브라인 게이트(H6) — 신호 강화 재등장 문구는 훅과 **같은 숫자면 표시하지 않는다**.
 * `5일째 계속 — 어제보다 1일 더` 가 `…5일째 조용히 사고 있어요` 아래 붙으면 같은 말이 두 번이다.
 */
export function quietPickSubLine(hook: string, progress: string | null | undefined): string | null {
  const text = progress?.trim();
  if (!text) return null;
  const hookNumbers = new Set(hook.match(/\d+/g) ?? []);
  const leading = text.match(/\d+/)?.[0];
  // 서브라인의 **첫 수치**(=지속 일수)가 훅에 이미 있으면 중복이다.
  if (leading && hookNumbers.has(leading)) return null;
  return text;
}

const TIMING_CLAUSE: Record<"A" | "B" | "C", string> = {
  A: "시점도 좋아요",
  B: "시점은 무난해요",
  C: "시점은 지켜봐야 해요",
};
const VALUATION_CLAUSE: Record<"A" | "B" | "C", string> = {
  A: "값도 안 비싸요",
  B: "값은 무난해요",
  C: "값은 좀 아쉬워요",
};
const DOMINANT_CLAUSE: Record<QuietPickAnomalyKind, string> = {
  frequency: "드물게 몰린 매수라 돈이 먼저 움직인 쪽이에요",
  participants: "임원 참여 폭이 넓어 눈여겨볼 신호예요",
  scale: "매수 규모가 작지 않아요",
  silence: "아직 조용해 초기 국면일 수 있어요",
  vacuum: "거래가 마른 곳에 들어온 매수라 눈에 띄어요",
  near_low: "저점권에서 들어온 매수예요",
};
/** 보조 이례성 뉘앙스 — 지배 이례성과 조합해 총평 유니크도를 높인다. */
const SECONDARY_NUANCE: Record<QuietPickAnomalyKind, string> = {
  frequency: "빈도까지 드물어요",
  participants: "참여 인원도 많고요",
  scale: "규모도 받쳐줘요",
  silence: "아직 화제 밖이라 더 그래요",
  vacuum: "거래도 말라 있었고요",
  near_low: "위치도 저점권이에요",
};

/**
 * 위원회 총평 한 줄 — 등급만이 아니라 **픽의 지배·보조 이례성**과 결합해 탈템플릿(WO-G1A2 §5).
 * 등급 기반 결정론(수치 없음 → 사실 게이트 자동 통과). 이례성 조합이 다르면 문장이 달라진다.
 */
export function buildCommitteeVerdictLine(
  anomalies: readonly QuietPickAnomaly[],
  timingGrade: "A" | "B" | "C",
  valuationGrade: "A" | "B" | "C"
): string {
  const dominant = anomalies[0]?.kind;
  const second = anomalies.find((a) => a.kind !== dominant)?.kind;
  const lead = dominant ? DOMINANT_CLAUSE[dominant] : "";
  const nuance = second ? ` ${SECONDARY_NUANCE[second]}` : "";
  const grade = `${TIMING_CLAUSE[timingGrade]}, ${VALUATION_CLAUSE[valuationGrade]}`;
  return lead ? `${lead}${nuance} — ${grade}` : grade;
}

/** 근거 한 줄의 항목 축 우선순위 — DS-01 §3-④ "규모 → 인원 → 희소성". */
const EVIDENCE_MAX_ITEMS = 3;

/** 항목의 숫자가 결론(훅)에 이미 나왔는가 — DS-01 §3-④ "결론에 나온 수치를 반복하지 않는다". */
function repeatsHookNumber(item: string, hookNumbers: Set<string>): boolean {
  const numbers = item.match(/\d+/g);
  if (!numbers) return false;
  return numbers.some((n) => hookNumbers.has(n));
}

/**
 * 근거 한 줄 (DS-01 §3-④) — `$4.0M · 2명 · 1년 매수 3건뿐`.
 *
 * ## 칩을 왜 없앴나
 *
 * 칩 3개는 각각 테두리를 가져서 노이즈가 크고, 서로 다른 축인지 사용자가 알 수 없었다.
 * 한 줄 텍스트가 더 조용하고 더 빨리 읽힌다(DS-01). 축 계산은 그대로 `computeQuietPickAnomalies`
 * 를 쓴다 — **판정 엔진은 바뀌지 않았고 표현만 바뀌었다.**
 *
 * ## 순서
 *
 * 규모(`$4.0M`) → 인원(`2명`, 임원만) → 희소성(이례성 칩, 강도순·축당 하나). 최대 3항목.
 * 결론에 이미 나온 숫자를 담은 항목은 건너뛴다 — 같은 숫자가 카드에 두 번 나오면 소음이다.
 */
export function buildQuietPickEvidenceLine(f: QuietPickAnomalyFacts, hook?: string): string {
  const hookNumbers = new Set((hook ?? "").match(/\d+/g) ?? []);
  const insider = f.kind === "insider_cluster";
  const items: string[] = [];
  const push = (item: string | null | undefined) => {
    const text = item?.trim();
    if (!text || items.length >= EVIDENCE_MAX_ITEMS) return;
    if (items.includes(text)) return;
    if (repeatsHookNumber(text, hookNumbers)) return;
    items.push(text);
  };

  // ① 규모 — 절대 수치가 먼저 읽힌다.
  push(f.scale);

  // ② 인원 — 임원 매수에서만 의미가 있다(기관·외국인은 인원 개념이 없다).
  if (insider && typeof f.insiderCount === "number" && f.insiderCount > 0) push(`${f.insiderCount}명`);

  // ③ 희소성 — 이례성 칩을 강도순으로, 같은 축은 한 번만.
  const usedAxes = new Set<QuietPickChipAxis>();
  for (const anomaly of computeQuietPickAnomalies(f)) {
    if (!anomaly.chip || !anomaly.axis) continue;
    if (usedAxes.has(anomaly.axis)) continue;
    usedAxes.add(anomaly.axis);
    push(anomaly.chip);
  }

  return items.join(" · ");
}
