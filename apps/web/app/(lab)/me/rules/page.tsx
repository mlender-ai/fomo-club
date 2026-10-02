/** `/me/rules` — 광혁 매매법(TRADER-02 산출물). 로그인 없으면 로그인으로. */
import { MeNav } from "../../../../components/me/MeNav";
import { RulesBody } from "../../../../components/me/RulesBody";
import { loadRules } from "../../../../lib/me/load";
import { requireMe } from "../../../../lib/me/session";
import { MeStoreMissing } from "../../../../lib/me/store";

export const dynamic = "force-dynamic";

export default async function MeRules() {
  await requireMe("/me/rules");
  try {
    const view = await loadRules();
    return (
      <>
        <MeNav />
        <RulesBody view={view} />
      </>
    );
  } catch (err) {
    if (!(err instanceof MeStoreMissing)) throw err;
    return (
      <>
        <MeNav />
        <div className="me-page">
          <h1 className="me-display">준비 중</h1>
        </div>
      </>
    );
  }
}
