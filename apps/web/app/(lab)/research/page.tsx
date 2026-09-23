"use client";

/**
 * `/research` — 연구 (UI-00 §2 · UI-03 PART B).
 *
 * 가장 큰 숫자는 **열린 질문 수**다(UI-00 §4-2). 닫힌 항목도 같이 보인다 —
 * **지우지 않는다.** 진 질문이 남아 있어야 같은 걸 다시 묻지 않는다.
 *
 * 노트의 정본은 `docs/lab/research/*.md` 다. 다듬는 것은 `UI-08` 이다.
 */
import Link from "next/link";

import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { Card, Empty, Hero, ResearchItem, Skeleton, SkeletonRows } from "../../../components/ui";
import type { ResearchStatus } from "../../../components/ui";
import type { Wire } from "../../../lib/lab/wire";

type Research = Wire<"research">;

export default function ResearchPage() {
  const { state, retry } = useLab<Research>("/api/lab/research");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="연구" side={<Skeleton height={200} radius="var(--r-card)" />}>
          <Skeleton width={200} height={60} />
          <SkeletonRows rows={7} />
        </PageFrame>
      }
    >
      {(data) => (
        <PageFrame
          title="연구"
          description="가설 → 확인 → 근거 → 결정 · 닫아도 지우지 않는다"
          side={
            <Card title="막고 있는 것" description="이 질문이 풀려야 다음으로 간다">
              {data.blockers.length === 0 ? (
                <p className="sh-note">막고 있는 질문이 없어요.</p>
              ) : (
                <ul className="sh-list">
                  {data.blockers.map((b) => (
                    <li key={b.no}>
                      <Link href={`/research/${b.no}`}>
                        {b.no} · {b.title}
                      </Link>
                      <span className="sh-note"> — {b.blocks} 을(를) 막고 있다</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          }
        >
          <Hero
            label="열린 질문"
            value={String(data.open)}
            meta={`막힘 ${data.blocked} · 닫힘 ${data.closed} · 전체 ${data.items.length}`}
          />
          {data.items.length === 0 ? (
            <Empty
              title="연구 항목이 아직 없어요"
              reason="docs/lab/research/*.md 를 시드하면 여기 뜹니다."
              action={<code>npm run lab:research-seed</code>}
            />
          ) : (
            <Card flush>
              <ul className="ui-research">
                {data.items.map((r) => (
                  <ResearchItem
                    key={r.no}
                    no={r.no}
                    title={r.title}
                    status={r.status as ResearchStatus}
                    summary={r.summary}
                    verdict={r.verdict}
                    blocks={r.blocks}
                    href={`/research/${r.no}`}
                  />
                ))}
              </ul>
            </Card>
          )}
        </PageFrame>
      )}
    </LabView>
  );
}
