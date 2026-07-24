/**
 * WO-G1A2 「오늘의 조용한 픽」 후킹 레이어 — 이례성을 언어화(결정론).
 *
 * 핵심: 절대 수치는 후킹이 아니다. **이례성**이 후킹이다. "무슨 일이 있었다"가 아니라
 * "이건 평소와 다르다". 보유 데이터로 계산한 이례성 지표 4종을 사람 말로 바꾸고,
 * 훅은 [이례성]을 앞세운다. 지표가 하나도 없으면 후킹 없는 픽 → 발행하지 않는다(엔진에서 컷).
 *
 * 순수·결정론(같은 입력 → 같은 출력). 수치는 전부 엔진이 실계산해 넘긴다(가짜 금지 — 미상이면 필드 생략).
 * CI(quiet-pick-hook.test.ts): 훅 동일 ≤2회 · 실수치 포함 · 위원회 소견 유니크 ≥70%.
 */

import { josa } from "./josa";

export type QuietPickSignalKind =
  | "insider_cluster"
  | "institution_streak"
  | "foreign_streak"
  | "multi_cluster";

export type QuietPickAnomalyKind = "frequency" | "participants" | "scale" | "silence";

export interface QuietPickAnomaly {
  kind: QuietPickAnomalyKind;
  /** 카드 칩/훅에 쓰는 사람 말 문구(실수치 포함). */
  text: string;
  /** 정렬용 강도(빈도>참여>규모>침묵). */
  strength: number;
}

/** 엔진이 실계산해 넘기는 이례성 원료. 미상 필드는 넘기지 않는다(생략=정답). */
export interface QuietPickAnomalyFacts {
  kind: QuietPickSignalKind;
  /** 주체 명사 — "내부자" / "외국인" / "기관" / "외국인·기관". */
  actorNoun: string;
  /** 카드 사실용 규모 문구 — "$4.8M" / "31만주". */
  scale: string;
  days: number;
  insiderCount?: number;
  /** US: openinsider 지난 12개월(최근 2주 제외) 내부자 매수 건수. */
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

  // ② 빈도 이례성 — 가장 강력.
  if (insider && typeof f.priorBuys12mo === "number" && typeof f.insiderCount === "number") {
    if (f.priorBuys12mo <= 8) {
      const strong = f.priorBuys12mo <= 2 || f.insiderCount >= 8;
      const text = f.priorBuys12mo === 0
        ? `지난 1년간 내부자 매수가 없었는데 이번에 ${f.insiderCount}명이 샀어요`
        : `지난 1년 내부자 매수 ${f.priorBuys12mo}건뿐인데 이번에 ${f.insiderCount}명이 몰렸어요`;
      out.push({ kind: "frequency", strength: strong ? 4.3 : 3.4, text });
    }
  }
  if (!insider && f.isLongestStreak && f.days >= 3) {
    out.push({
      kind: "frequency",
      strength: 4.0,
      text: `${iGa(f.actorNoun)} ${f.days}일 연속 — 최근 ${f.streakWindowDays ?? f.days}거래일 중 가장 길어요`,
    });
  }

  // ③ 참여자 수 이례성(내부자).
  if (insider && typeof f.insiderCount === "number") {
    if (f.insiderCount >= 8) out.push({ kind: "participants", strength: 3.6, text: `임원 ${f.insiderCount}명이 한꺼번에 샀어요` });
    else if (f.insiderCount >= 4) out.push({ kind: "participants", strength: 2.8, text: `내부자 ${f.insiderCount}명이 함께 샀어요` });
  }

  // ① 규모 상대화.
  if (typeof f.volumePct === "number" && f.volumePct >= 20) {
    out.push({
      kind: "scale",
      strength: f.volumePct >= 40 ? 3.2 : 2.2,
      text: `${iGa(f.actorNoun)} 하루 거래량의 ${Math.round(f.volumePct)}%를 사들였어요`,
    });
  }
  if (typeof f.mcapPct === "number" && f.mcapPct >= 1) {
    out.push({
      kind: "scale",
      strength: f.mcapPct >= 5 ? 3.4 : 2.4,
      text: `내부자가 시총의 ${round1(f.mcapPct)}%를 사들였어요`,
    });
  }

  // ④ 침묵의 정도(보조 — 오늘 데이터 기준, 과장 금지).
  if (f.mentionCount === 0) out.push({ kind: "silence", strength: 1.2, text: "아직 뉴스엔 안 잡혀요" });
  if (f.volumeElevated === false) out.push({ kind: "silence", strength: 1.0, text: "거래량도 안 늘었어요" });

  return out.sort((a, b) => b.strength - a.strength);
}

/** 이례성 종류의 "계열"(중복 서사 방지 — 훅에서 서로 다른 계열을 짝짓는다). */
function familyOf(kind: QuietPickAnomalyKind): "activity" | "size" | "quiet" {
  if (kind === "frequency" || kind === "participants") return "activity";
  if (kind === "scale") return "size";
  return "quiet";
}

/**
 * 훅 = [가장 강한 이례성] + [다른 계열의 이례성]. 이례성이 앞. 실수치 내장.
 * 지표가 없으면(엔진이 이미 컷) 최소 사실로 폴백.
 */
export function buildQuietPickHook(f: QuietPickAnomalyFacts): string {
  const anomalies = computeQuietPickAnomalies(f);
  if (anomalies.length === 0) return `${iGa(f.actorNoun)} ${f.scale}`;
  const lead = anomalies[0]!;
  const second = anomalies.find((a) => familyOf(a.kind) !== familyOf(lead.kind));
  return second ? `${lead.text} — ${second.text}` : lead.text;
}

const TIMING_CLAUSE: Record<"A" | "B" | "C", string> = {
  A: "자리도 좋아요",
  B: "자리는 무난해요",
  C: "자리는 지켜봐야 해요",
};
const VALUATION_CLAUSE: Record<"A" | "B" | "C", string> = {
  A: "값도 안 비싸요",
  B: "값은 무난해요",
  C: "값은 좀 아쉬워요",
};
const DOMINANT_CLAUSE: Record<QuietPickAnomalyKind, string> = {
  frequency: "이례적으로 몰린 매수라 수급이 먼저 말하는 자리예요",
  participants: "내부자 참여 폭이 넓어 눈여겨볼 신호예요",
  scale: "매수 규모가 작지 않은 매집이에요",
  silence: "아직 조용해 초기 국면일 수 있어요",
};
/** 보조 이례성 뉘앙스 — 지배 이례성과 조합해 총평 유니크도를 높인다. */
const SECONDARY_NUANCE: Record<QuietPickAnomalyKind, string> = {
  frequency: "빈도까지 드물어요",
  participants: "참여 인원도 많고요",
  scale: "규모도 받쳐줘요",
  silence: "아직 화제 밖이라 더 그래요",
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
