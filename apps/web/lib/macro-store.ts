/** 거시 지표 저장·조회. 행 하나 — 굽는 크론이 한 번에 전부 필요하다(§12). */
import { readFeedContent, writeFeedContent } from "./feed-content-store";
import type { MacroCollection } from "./macro-collect";

const ACTIVE_ID = "macro:active";

export async function readMacroCollection(): Promise<MacroCollection | null> {
  return readFeedContent<MacroCollection>(ACTIVE_ID);
}

export async function writeMacroCollection(collection: MacroCollection): Promise<void> {
  await writeFeedContent(ACTIVE_ID, collection);
}
