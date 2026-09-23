/**
 * 루트 로딩. 랩 화면 사이 이동은 `(lab)/loading.tsx` 가 받는다 — 이건 로그인처럼 랩
 * 바깥 화면이 처음 뜰 때만 쓰인다.
 */
import { Skeleton } from "../components/ui";

export default function Loading() {
  return (
    <main className="sh-fallback" aria-busy="true">
      <section className="sh-fallback-card">
        <Skeleton width={200} height={24} />
        <Skeleton width={280} height={16} />
      </section>
    </main>
  );
}
