"use client";

/**
 * `/positions` — 포지션 (UI-00 §2 · UI-03 PART B).
 *
 * 가장 큰 숫자는 **미실현 손익 합계**다(UI-00 §4-2). 증거금과 손익률을 둘 다 아는
 * 포지션만 더한다 — 모르는 것을 0 으로 넣지 않는다.
 *
 * **청산 수준을 숨기지 않는다.** FCE 에 청산 모델이 없어 −100% 아래로 갈 수 있다.
 *
 * 30초 갱신·건강도 상세·패턴 시간봉은 `UI-06` 이다. 본문은 `components/tabs/PositionsBody.tsx`.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { PositionsBody } from "../../../components/tabs/PositionsBody";
import { Skeleton, SkeletonRows } from "../../../components/ui";
import type { Wire } from "../../../lib/lab/wire";

type Positions = Wire<"positions">;

export default function PositionsPage() {
  const { state, retry } = useLab<Positions>("/api/lab/positions");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="포지션">
          <Skeleton width={320} height={60} />
          <SkeletonRows rows={5} />
        </PageFrame>
      }
    >
      {(data) => <PositionsBody data={data} />}
    </LabView>
  );
}
