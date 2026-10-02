/** `/me/compare` — 광혁 vs 엔진(TRADER-03). 로그인 없으면 로그인으로. */
import { CompareBody } from "../../../../components/me/CompareBody";
import { MeNav } from "../../../../components/me/MeNav";
import { loadCompare, periodOf } from "../../../../lib/me/load";
import { requireMe } from "../../../../lib/me/session";
import { MeStoreMissing } from "../../../../lib/me/store";

export const dynamic = "force-dynamic";

export default async function MeCompare({ searchParams }: { searchParams?: Promise<{ days?: string }> }) {
  const days = periodOf((await searchParams)?.days);
  await requireMe(`/me/compare?days=${days}`);
  try {
    const view = await loadCompare(days);
    return (
      <>
        <MeNav />
        <CompareBody view={view} />
      </>
    );
  } catch (err) {
    if (!(err instanceof MeStoreMissing)) throw err;
    return (
      <>
        <MeNav />
        <div className="me-page">
          <h1 className="me-display">준비 중</h1>
          <p className="me-netline">비공개 표가 아직 없다 — 마이그레이션(20261002000000_trader03_me) 적용 뒤에 열린다.</p>
        </div>
      </>
    );
  }
}
