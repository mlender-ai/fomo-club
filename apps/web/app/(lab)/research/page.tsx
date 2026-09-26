"use client";

/**
 * `/research` — 연구 (UI-00 §2 · UI-03 PART B).
 *
 * 가장 큰 숫자는 **열린 질문 수**다(UI-00 §4-2). 닫힌 항목도 같이 보인다 —
 * **지우지 않는다.** 진 질문이 남아 있어야 같은 걸 다시 묻지 않는다.
 *
 * 노트의 정본은 `docs/lab/research/*.md` 다. 다듬는 것은 `UI-08` 이다. 본문은 `components/tabs/ResearchBody.tsx`.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { ResearchBody } from "../../../components/tabs/ResearchBody";
import { Skeleton, SkeletonRows } from "../../../components/ui";
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
      {(data) => <ResearchBody data={data} />}
    </LabView>
  );
}
