"use client";

/**
 * `/journal/[id]` — 거래 상세 (UI-09 PART B). 본문은 `components/tabs/JournalDetailBody.tsx`.
 */
import { useParams } from "next/navigation";

import { LabView } from "../../../../components/shell/LabView";
import { PageFrame } from "../../../../components/shell/PageFrame";
import { useLab } from "../../../../components/shell/useLab";
import { JournalDetailBody } from "../../../../components/tabs/JournalDetailBody";
import { Skeleton } from "../../../../components/ui";
import type { JournalDetail } from "../../../../lib/lab/journal";
import type { Jsonify } from "../../../../lib/lab/wire";

export default function JournalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, retry } = useLab<Jsonify<JournalDetail>>(`/api/lab/journal/${encodeURIComponent(id)}`);
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="거래">
          <Skeleton width={280} height={60} />
          <Skeleton height={320} radius="var(--r-card)" />
        </PageFrame>
      }
    >
      {(data) => <JournalDetailBody data={data} />}
    </LabView>
  );
}
