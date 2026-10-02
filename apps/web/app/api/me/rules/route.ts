import { guard, json } from "../../../../lib/me/http";
import { loadRules } from "../../../../lib/me/load";
import { MeStoreMissing } from "../../../../lib/me/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    return json(await loadRules());
  } catch (err) {
    if (err instanceof MeStoreMissing) return json({ error: "not_ready" }, 503);
    throw err;
  }
}
