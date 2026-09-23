/**
 * 탭 사이 이동의 **안전망** (UI-03 PART A).
 *
 * 탭이 안 눌리던 원인 하나가 이것이었다 — 로딩 경계가 루트(`app/loading.tsx`)에만
 * 있었고, 공유 레이아웃 `(lab)` **아래**에는 없었다. 그래서 탭끼리 이동할 때 Next.js 가
 * 새 화면 서버 렌더가 끝날 때까지 **URL 도 안 바꾸고 기다렸다.**
 *
 * 화면들은 이제 틀을 즉시 그리고 데이터를 브라우저에서 부르므로 이 경계가 거의 안 쓰인다.
 * 그래도 둔다 — 누가 화면에 다시 서버 쿼리를 넣으면 이게 첫 번째로 받아준다.
 */
import { Skeleton } from "../../components/ui";

export default function Loading() {
  return (
    <div className="sh-page" aria-busy="true">
      <div className="sh-page-head">
        <Skeleton width={180} height={28} />
      </div>
      <Skeleton width={320} height={60} />
      <div style={{ marginTop: "var(--s7)" }}>
        <Skeleton height={260} radius="var(--r-card)" />
      </div>
    </div>
  );
}
