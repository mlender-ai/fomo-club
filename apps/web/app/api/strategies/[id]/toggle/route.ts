import type { NextRequest } from "next/server";

import { proxyPatch } from "../../../_utils";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPatch(request, `/strategies/${id}/toggle`, {});
}
