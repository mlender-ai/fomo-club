import { guard, json } from "../../../../lib/me/http";
import { loadCompare, periodOf } from "../../../../lib/me/load";
import { MeStoreMissing } from "../../../../lib/me/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const days = periodOf(new URL(request.url).searchParams.get("days"));
    return json(await loadCompare(days));
  } catch (err) {
    if (err instanceof MeStoreMissing) return json({ error: "not_ready" }, 503);
    throw err;
  }
}
