"use client";

/**
 * 연구 목록 본문 (UI-08 PART A · E).
 *
 * > **FCE 에 없는 것.** FCE 는 운용 도구다 — 이 탭은 무엇이 궁금했고 무엇을 알아냈고 그래서 무엇을 하기로 했는지를 적는다.
 *
 * ```
 * 열린 질문  5                  ← hero
 * 닫힌 질문 2
 * [전체] [진행중] [실매매 차단] [닫힘]
 * 01  고래는 … 왜 32.4%인가        [진행중]
 *     갭 35.3%p · 청산 반사실 번복 · 9일째
 * 04  추세·평균회귀 진입에 우위가 있나  [닫힘 · 없음]
 *     결정 → 전략 3종을 폐기했다
 *                                  ┌ 실제 돈을 넣으려면 ┐
 *                                  │ 02 강제청산 모델링  │
 *                                  │ 03 호스트 상시화    │
 *                                  │ ?  기준선 넘은 전략 │
 *                                  └ 3개 중 0개 해결    ┘
 * ```
 *
 * 닫힌 항목도 같이 보인다 — **지우지 않는다.** 진 질문이 남아 있어야 같은 걸 다시 묻지 않는다.
 */
import Link from "next/link";
import { useState } from "react";

import { PageFrame } from "../shell/PageFrame";
import { Card, Empty, Hero, Pill, researchPill, type ResearchStatus } from "../ui";
import type { Wire } from "../../lib/lab/wire";

type Research = Wire<"research">;
type Item = Research["items"][number];

export const FILTERS = [
  { key: "all", label: "전체", test: () => true },
  { key: "open", label: "진행중", test: (r: Item) => r.status === "open" || r.status === "testing" },
  { key: "blocked", label: "실매매 차단", test: (r: Item) => r.status === "blocked" },
  { key: "closed", label: "닫힘", test: (r: Item) => r.status === "closed" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export function ResearchBody({ data, initialFilter = "all" }: { data: Research; initialFilter?: FilterKey }) {
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = data.items.filter((r) => active.test(r));

  return (
    <PageFrame
      title="연구"
      description="궁금했다 → 확인했다 → 알았다 → 정했다"
      info={
        <>
          <p>
            질문 하나가 노트 하나다. FCE 는 운용을 보고하고, 이 탭은 그 운용에서 무엇을 알아냈는지를 적는다. 틀린 걸 알아낸 것도
            결과다 — 닫아도 지우지 않는다.
          </p>
          <p>노트의 정본은 레포의 연구 노트 파일이다. 파일을 고쳐 main 에 올리면 시드가 돌아 이 화면이 바뀐다.</p>
        </>
      }
      side={<GatesCard data={data} />}
    >
      <Hero label="열린 질문" value={String(data.open)} meta={`닫힌 질문 ${data.closed}`} />
      {data.oldestOpen ? (
        <p className="st-line">
          가장 오래 열린 질문 · <Link href={`/research/${data.oldestOpen.no}`}>{data.oldestOpen.no}</Link> ·{" "}
          {data.oldestOpen.days}일째
        </p>
      ) : null}

      <div className="ui-ranges rs-filters" role="tablist" aria-label="상태">
        {FILTERS.map((f) => {
          const n = data.items.filter((r) => f.test(r)).length;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={f.key === filter}
              className={`ui-range${f.key === filter ? " is-on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label} {n}
            </button>
          );
        })}
      </div>

      {data.items.length === 0 ? (
        <Empty
          title="연구 항목이 아직 없어요"
          reason="연구 노트를 시드하면 여기 뜹니다."
          action={<code>npm run lab:research-seed</code>}
        />
      ) : shown.length === 0 ? (
        <p className="sh-note">이 상태의 질문이 없어요.</p>
      ) : (
        <ol className="rs-list">
          {shown.map((r) => (
            <Entry key={r.no} r={r} />
          ))}
        </ol>
      )}
    </PageFrame>
  );
}

function Entry({ r }: { r: Item }) {
  const pill = researchPill(r.status as ResearchStatus, r.verdict, r.blocks);
  const closed = r.status === "closed";
  return (
    <li className={`rs-entry${closed ? " is-closed" : ""}`}>
      <Link href={`/research/${r.no}`} className="rs-entry-link">
        <span className="rs-no">{r.no}</span>
        <span className="rs-entry-body">
          <span className="rs-entry-head">
            <span className="rs-title" role="heading" aria-level={2}>{r.title}</span>
            <Pill tone={pill.tone}>{pill.label}</Pill>
          </span>
          <p className="rs-line">
            {r.summary}
            {r.days ? <span className="rs-days"> · {r.days}일째</span> : null}
          </p>
          {closed && r.decisionLine ? <p className="rs-decision">결정 → {r.decisionLine}</p> : null}
        </span>
      </Link>
    </li>
  );
}

/** PART E — 실제 돈을 넣으려면. **이 탭의 결론이다.** */
function GatesCard({ data }: { data: Research }) {
  return (
    <Card
      title="실제 돈을 넣으려면"
      description={`${data.gates.length}개 중 ${data.gatesResolved}개 해결`}
      flush
      info={
        <p>
          연구 노트에 실매매 관문으로 표시한 질문과, 전략 탭의 기준선을 넘은 전략 수다. 질문은 닫혀야(판단 불가가 아니라) 풀린
          것으로 센다. 전략은 하나라도 기준선을 넘어야 풀린다.
        </p>
      }
    >
      <ul className="rs-gates">
        {data.gates.map((g) => {
          const pill =
            g.no === null
              ? { label: g.resolved ? "있음" : "없음", tone: g.resolved ? ("up" as const) : ("dn" as const) }
              : researchPill(g.statusKey === "blocked" ? "blocked" : g.statusKey === "open" ? "open" : "closed", null, g.statusKey === "blocked" ? "실매매" : null);
          const body = (
            <>
              <span className={`rs-gate-no${g.resolved ? " is-done" : ""}`}>{g.no ?? "?"}</span>
              <span className="rs-gate-label">
                {g.label}
                {"value" in g && g.value ? <span className="rs-days"> · {g.value}</span> : null}
              </span>
              <Pill tone={g.resolved ? "up" : pill.tone}>{g.resolved ? "해결" : pill.label}</Pill>
            </>
          );
          return (
            <li key={g.label}>
              {g.no ? (
                <Link href={`/research/${g.no}`} className="rs-gate">
                  {body}
                </Link>
              ) : (
                <Link href="/strategies" className="rs-gate">
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
