/**
 * 고래 탭 조립 (UI-07).
 *
 * > 고래는 X% 맞히는데 우리는 왜 Y% 인가 — **화면의 주인공이 갭이다.**
 *
 * **순수 함수다.** 숫자는 전부 FCE 값이다(`fce-upload.ts` `whaleBoard` · `fce-whale-report.py`).
 * 여기서 하는 것은 줄 세우기 · 깔때기 단계 빼기(82 − 9 = 73 …) · 표 칸 배치뿐이다.
 *
 * ## 65.8% 를 버렸다
 *
 * 전에는 `WHALE_OWN_WIN_PCT = 65.8` 을 박아 두고 추종 승률과 뺐다. 그 65.8 은 09-19 FCE 리포트의 한 순간이고,
 * FCE 는 이제 **같은 대조 표본에서** 두 승률과 갭을 직접 낸다(`follow_track.exit_comparison.gap` —
 * 72.3% · 37.0% · 35.3%p). 박아 둔 숫자가 살아 있는 숫자 옆에 서 있으면 어느 쪽이 맞는지 아무도 모른다.
 *
 * ## 반사실도 바뀌었다
 *
 * 박아 둔 문장은 "고래 청산 따랐다면 −49.58 (75건) — 원인 아님" 이었다. FCE 의 지금 대조(99건)는
 * **고래 청산이 +236.86 · 우리 −32.90 — `EXIT_B_BETTER`** 다. 다만 FCE 가 스스로 단서를 단다 — 우리 출구에
 * 결함이 있다(`holding_bars` 가 봉이 아니라 잡 실행 횟수를 센다). **단서를 떼지 않고 같이 싣는다.**
 */
import type { FceWhaleView } from "./fce-board";
import type { WhaleBoard } from "./fce-payload";

export interface ResearchLink {
  no: string;
  title: string;
  status: string;
  summary: string;
  blocks: string | null;
  trackKeys: unknown;
}

/** FCE 참가자 유형 → 사람 말. */
const TYPE: Record<string, string> = {
  directional: "방향성",
  unclassified: "미분류",
  market_maker: "마켓메이커",
  basis_carry: "베이시스",
};

export function typeLabel(t: string | null): string {
  return t ? (TYPE[t] ?? t) : "—";
}

/**
 * 깔때기 단계 (PART E) — FCE `rejection_reason` 과 **같은 순서**로 뺀다: 유형 → 표본 → 승률.
 * 순서가 다르면 중간 숫자가 달라진다. 각 지갑의 탈락 사유는 하나뿐이라 합은 늘 맞는다.
 */
export function funnelStages(f: NonNullable<WhaleBoard["funnel"]>) {
  const mm = f.excludedByType.market_maker ?? 0;
  const carry = f.excludedByType.basis_carry ?? 0;
  const typeNote = [mm ? `MM ${mm}` : null, carry ? `베이시스 ${carry}` : null].filter(Boolean).join(" · ");
  const afterType = f.population - f.excludedType;
  const afterSample = afterType - f.sampleBelow;
  const afterWin = afterSample - f.winBelow;
  return {
    stages: [
      { label: "추적 후보", left: f.population, removed: null as number | null, reason: null as string | null },
      { label: "유형 통과", left: afterType, removed: f.excludedType, reason: `유형 제외${typeNote ? ` (${typeNote})` : ""}` },
      { label: "표본 통과", left: afterSample, removed: f.sampleBelow, reason: `표본 ${f.minSample ?? 30}건 미달` },
      { label: "통과", left: afterWin, removed: f.winBelow, reason: `승률 ${f.minWinPct ?? 55}% 미달` },
    ],
    /** 뺄셈 끝이 FCE 가 낸 통과 수와 같은가. 다르면 FCE 분해가 바뀐 것이다 — 화면이 숨기지 않는다. */
    consistent: afterWin === f.eligible,
  };
}

export function buildWhales(input: {
  whale: FceWhaleView | null;
  research: ResearchLink[];
  /** 우리 추종 트랙의 원장 평균 보유(시간) — 전략 탭과 같은 값(`strategies.ts`). */
  followAvgHoldHours: number | null;
}) {
  const { whale, research, followAvgHoldHours } = input;
  if (!whale) return { whale: null, board: null };
  const b = whale.board;
  const gap = b?.gap ?? null;
  const exit = b?.exit ?? null;
  const lat = whale.latency as { median?: number; p90?: number } | null;

  // ② 갭 비교표 (PART C) — 칸이 없으면 `—`. 지어내지 않는다.
  const compare = [
    { label: "승률", whale: gap?.whaleWinPct ?? null, ours: gap?.followWinPct ?? whale.followWinPct, unit: "pct" as const },
    { label: "손익비", whale: null, ours: whale.followPf, unit: "num" as const },
    { label: "거래 수", whale: null, ours: whale.followTrades, unit: "count" as const },
    { label: "평균 보유", whale: null, ours: followAvgHoldHours, unit: "hours" as const },
    { label: "보유 중앙값", whale: exit?.holdWhaleMedianH ?? null, ours: exit?.holdOursMedianH ?? null, unit: "hours" as const },
    { label: "진입 지연", whale: null, ours: lat?.median ?? null, p90: lat?.p90 ?? null, unit: "minutes" as const },
  ];

  const research01 = research.filter(
    (r) => Array.isArray(r.trackKeys) && (r.trackKeys as unknown[]).includes("whale")
  );

  return {
    whale: {
      walletsTotal: whale.walletsTotal,
      eligible: whale.eligible,
      followWinPct: whale.followWinPct,
      followTrades: whale.followTrades,
      followPf: whale.followPf,
      followNetUsdt: whale.followNetUsdt,
      latency: whale.latency,
      drift: whale.drift,
      asOf: whale.asOf,
    },
    board: b
      ? {
          gap,
          compare,
          exit,
          wallets: b.wallets,
          funnel: b.funnel ? { ...b.funnel, ...funnelStages(b.funnel) } : null,
          leaderboard: b.leaderboard,
          observation: b.observation,
          research: research01.map((r) => ({ no: r.no, title: r.title, status: r.status, summary: r.summary, blocks: r.blocks })),
        }
      : null,
  };
}

export type WhalesCore = ReturnType<typeof buildWhales>;
