"use client";

/**
 * `/whales` — 고래 (UI-00 §2 · UI-03 PART B).
 *
 * UI-00 은 가장 큰 숫자를 "갭" 이라고 했다. 그런데 **33.4%p 는 뺄셈이 아니다** — 두 승률은
 * 거래 목록·진입 시점·가격·사이징·청산·레버리지·승패 판정이 전부 다른 모집단이다
 * (`docs/lab/WHALE_GAP.md`). API 도 `subtractable: false` 를 박아 보낸다.
 *
 * UI-FIX C-6 이 hero 를 다시 갭 숫자로 정했다. 대신 `모집단 다름` 알약 + ⓘ 가 붙는다 —
 * 두 수는 hero 바로 아래 줄에 남는다. 본문은 `components/tabs/WhalesBody.tsx`. 다듬는 것은 `UI-07` 이다.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { WhalesBody } from "../../../components/tabs/WhalesBody";
import { Skeleton } from "../../../components/ui";
import type { Wire } from "../../../lib/lab/wire";

type Whales = Wire<"whales">;

export default function WhalesPage() {
  const { state, retry } = useLab<Whales>("/api/lab/whales");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="고래" side={<Skeleton height={260} radius="var(--r-card)" />}>
          <Skeleton width={360} height={60} />
          <Skeleton height={300} radius="var(--r-card)" />
        </PageFrame>
      }
    >
      {(data) => <WhalesBody data={data} />}
    </LabView>
  );
}
