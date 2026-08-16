import { PARTICIPANTS, type Coverage, type FlowSnapshot, type Participant, type ParticipantFlow } from "../types";

/**
 * 매수·매도 주체 파생 (CTX-01 §3, 목표 3).
 *
 * **"누가 샀나" 만 있고 "누가 팔았나" 가 없으면 반쪽이다.** `net_sellers` 가 이 WO 의 목표다.
 *
 * 확보 안 된 주체는 어느 목록에도 넣지 않는다 — 모르는 것을 "안 샀다" 로 읽히게 하면
 * 0 으로 채우는 것과 같은 거짓말이 된다.
 */

/** 관심 대상 주체(내부자는 일별 순매매 축이 아니라 별도 신호라 커버리지 계산에서 뺀다). */
const DAILY_FLOW_PARTICIPANTS: readonly Participant[] = ["retail", "institution", "foreign"];

function coverageOf(present: ReadonlySet<Participant>): Coverage {
  const n = DAILY_FLOW_PARTICIPANTS.filter((p) => present.has(p)).length;
  if (n === 0) return "none";
  return n === DAILY_FLOW_PARTICIPANTS.length ? "full" : "partial";
}

/** 누적 금액 최대 주체. 금액을 모르는 주체는 후보에서 빠진다(수량으로 대체 비교하지 않는다 — 단위가 다르다). */
function dominantBy(flows: readonly ParticipantFlow[], direction: 1 | -1): Participant | null {
  let best: ParticipantFlow | null = null;
  for (const flow of flows) {
    const value = flow.cumulative_value_streak;
    if (value == null || Math.sign(value) !== direction) continue;
    if (!best || Math.abs(value) > Math.abs(best.cumulative_value_streak ?? 0)) best = flow;
  }
  return best?.participant ?? null;
}

export function buildFlowSnapshot(input: {
  symbol: string;
  market: "KR" | "US";
  as_of: string;
  participants: readonly ParticipantFlow[];
}): FlowSnapshot {
  const participants = [...input.participants];
  const present = new Set(participants.map((p) => p.participant));

  // 방향은 연속 구간이 아니라 그날의 순매수 부호로 판단한다 — "지금 누가 사고 파는가" 이므로.
  const buyers = participants.filter((p) => (p.net_value ?? 0) > 0).map((p) => p.participant);
  const sellers = participants.filter((p) => (p.net_value ?? 0) < 0).map((p) => p.participant);

  return {
    symbol: input.symbol,
    market: input.market,
    as_of: input.as_of,
    participants,
    net_buyers: buyers,
    net_sellers: sellers,
    dominant_buyer: dominantBy(participants, 1),
    dominant_seller: dominantBy(participants, -1),
    coverage: coverageOf(present),
    missing_participants: PARTICIPANTS.filter((p) => !present.has(p)),
  };
}
