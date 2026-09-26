"use client";

/**
 * `/journal` — 복기 (UI-00 §2 · UI-03 PART B).
 *
 * 가장 큰 숫자는 **누적 실현 손익**이다(UI-00 §4-2).
 *
 * **비용을 따로 보여준다.** 실측으로 손실의 절반 가까이가 수수료·펀딩비였다. `net` 만
 * 보이면 그게 안 보인다. 목표가·손절선은 여기 없다 — 랩이 FCE 에서 받아오지도 않는다
 * (LAB-08).
 *
 * 사후 채점·다듬기는 `UI-09` 다. 본문은 `components/tabs/JournalBody.tsx`.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { JournalBody } from "../../../components/tabs/JournalBody";
import { Skeleton, SkeletonRows } from "../../../components/ui";
import type { Wire } from "../../../lib/lab/wire";

type Journal = Wire<"journal">;

export default function JournalPage() {
  const { state, retry } = useLab<Journal>("/api/lab/journal");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="복기">
          <Skeleton width={320} height={60} />
          <Skeleton height={110} radius="var(--r-stat)" />
          <SkeletonRows rows={8} />
        </PageFrame>
      }
    >
      {(data) => <JournalBody data={data} />}
    </LabView>
  );
}
