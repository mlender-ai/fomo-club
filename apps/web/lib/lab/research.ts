/**
 * 연구 탭 조립 (UI-08).
 *
 * > 무엇이 궁금했나 → 어떻게 확인했나 → 무엇을 알았나 → 그래서 무엇을 하기로 했나
 *
 * **순수 함수다.** 연구 노트는 파일이 정본이고(`docs/lab/research/*.md` → `research-seed.ts` → DB),
 * 여기서는 목록 모양만 만든다 — 상태 알약 · 경과일 · 닫힌 것의 결정 한 줄 · "실제 돈을 넣으려면".
 */

const DAY = 86_400_000;

export interface ResearchRow {
  no: string;
  title: string;
  status: string;
  verdict: string | null;
  summary: string;
  decision: string | null;
  blocks: string | null;
  liveGate: string | null;
  openedAt: Date;
  closedAt: Date | null;
  trackKeys: unknown;
}

/** 목록 알약 (UI-08 A-4). */
export type StatusKey = "open" | "blocked" | "yes" | "no" | "inconclusive";

export function statusKey(r: { status: string; verdict: string | null }): StatusKey {
  if (r.status === "blocked") return "blocked";
  if (r.status === "closed") return (r.verdict as StatusKey) ?? "inconclusive";
  return "open";
}

/**
 * 결정 한 줄 (A-3 — 닫힌 것만 `결정 → …`). 노트의 `## 결정` 첫 굵은 글씨, 없으면 첫 문장.
 * **지어내지 않는다** — 노트에 쓴 말을 자를 뿐이다.
 */
export function decisionLine(decision: string | null): string | null {
  if (!decision) return null;
  const bold = /\*\*(.+?)\*\*/.exec(decision);
  const raw = bold ? (bold[1] as string) : (decision.split(/(?<=[.다])\s/)[0] ?? decision);
  return raw.replace(/[*`]/g, "").replace(/\s+/g, " ").trim().replace(/[.。]$/, "");
}

export function buildResearch(input: {
  items: ResearchRow[];
  /** 기준선을 넘은 전략 — 전략 탭과 같은 값(`strategies.beatCount / measuredCount`). */
  strategies: { beatCount: number; measuredCount: number };
  now: Date;
}) {
  const { items, strategies, now } = input;
  const rows = items.map((r) => {
    const key = statusKey(r);
    const closed = r.status === "closed";
    return {
      ...r,
      statusKey: key,
      /** 열린 것만(A-3). 여는 날 = 1일째. */
      days: closed ? null : Math.max(1, Math.floor((now.getTime() - r.openedAt.getTime()) / DAY) + 1),
      decisionLine: closed ? decisionLine(r.decision) : null,
    };
  });

  const open = rows.filter((r) => r.status !== "closed");
  const oldest = [...open].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || a.no.localeCompare(b.no))[0] ?? null;

  // PART E — 실제 돈을 넣으려면. 노트의 `live_gate` + 기준선을 넘은 전략.
  const gates = [
    ...rows
      .filter((r) => r.liveGate)
      .map((r) => ({
        no: r.no as string | null,
        label: r.liveGate as string,
        statusKey: r.statusKey as StatusKey | "none" | "some",
        resolved: r.status === "closed" && r.verdict !== "inconclusive",
      })),
    {
      no: null,
      label: "기준선을 넘은 전략",
      statusKey: (strategies.beatCount > 0 ? "some" : "none") as StatusKey | "none" | "some",
      resolved: strategies.beatCount > 0,
      value: `${strategies.beatCount} / ${strategies.measuredCount}`,
    },
  ];

  return {
    items: rows,
    open: open.length,
    closed: rows.length - open.length,
    blocked: rows.filter((r) => r.status === "blocked").length,
    oldestOpen: oldest ? { no: oldest.no, title: oldest.title, days: oldest.days } : null,
    gates,
    gatesResolved: gates.filter((g) => g.resolved).length,
    /** 옛 화면(Overview 의 막힘 목록)이 읽는다. */
    blockers: rows.filter((r) => r.status === "blocked" && r.blocks).map((r) => ({ no: r.no, title: r.title, blocks: r.blocks })),
  };
}

export type ResearchCore = ReturnType<typeof buildResearch>;
