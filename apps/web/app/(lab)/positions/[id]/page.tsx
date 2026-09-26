"use client";

/**
 * `/positions/[id]` — 포지션 상세 (UI-03 PART B · UI-06 PART B).
 *
 * 30초마다 조용히 다시 읽는다(UI-06 완료 확인 10). 본문은 `components/tabs/PositionDetailBody.tsx`.
 * 닫힌 포지션은 404 다 — 고장이 아니라 "닫혔다" 로 말하고 복기로 보낸다.
 */
import { useParams } from "next/navigation";

import { LabView } from "../../../../components/shell/LabView";
import { PageFrame } from "../../../../components/shell/PageFrame";
import { useLab } from "../../../../components/shell/useLab";
import { PositionDetailBody, PositionMissing } from "../../../../components/tabs/PositionDetailBody";
import { Skeleton } from "../../../../components/ui";
import type { PositionDetail } from "../../../../lib/lab/positions";
import type { Jsonify } from "../../../../lib/lab/wire";

export default function PositionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, retry } = useLab<Jsonify<PositionDetail>>(`/api/lab/positions/${id}`, 30_000);

  if (state.kind === "error" && state.message === "not_found") return <PositionMissing id={id} />;

  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="포지션">
          <Skeleton width={280} height={60} />
          <Skeleton height={96} radius="var(--r-card)" />
          <Skeleton height={360} radius="var(--r-card)" />
        </PageFrame>
      }
    >
      {(data) => <PositionDetailBody data={data} />}
    </LabView>
  );
}
