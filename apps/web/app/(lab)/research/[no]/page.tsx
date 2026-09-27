"use client";

/**
 * `/research/[no]` — 연구 상세 (UI-03 PART B · UI-08 PART B).
 *
 * 본문은 `components/tabs/ResearchDetailBody.tsx` — 에디토리얼이라 페이지 틀의 제목을 쓰지 않고
 * 기사 머리(번호 · 질문 · 메타)가 곧 제목이다. `/backtest` 가 `/research/04` 로 온다.
 */
import { useParams } from "next/navigation";

import { LabView } from "../../../../components/shell/LabView";
import { PageFrame } from "../../../../components/shell/PageFrame";
import { useLab } from "../../../../components/shell/useLab";
import { ResearchDetailBody, type ResearchDetailItem } from "../../../../components/tabs/ResearchDetailBody";
import { Skeleton, SkeletonRows } from "../../../../components/ui";

export default function ResearchDetailPage() {
  const { no } = useParams<{ no: string }>();
  const { state, retry } = useLab<{ item: ResearchDetailItem }>(`/api/lab/research/${encodeURIComponent(no)}`);

  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title={`연구 ${no}`}>
          <Skeleton width={480} height={48} />
          <SkeletonRows rows={6} />
        </PageFrame>
      }
    >
      {(data) => (
        <div className="sh-page">
          <div className="sh-body">
            <ResearchDetailBody item={data.item} />
          </div>
        </div>
      )}
    </LabView>
  );
}
