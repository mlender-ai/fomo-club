/**
 * 업종 분류표 저장·조회. 행 하나(`sector-map:active`) — 굽는 크론이 한 번에 전부 필요하다.
 */
import { readFeedContent, writeFeedContent } from "./feed-content-store";
import type { SectorMap } from "./sector-map";

const ACTIVE_ID = "sector-map:active";

export async function readSectorMap(): Promise<SectorMap | null> {
  return readFeedContent<SectorMap>(ACTIVE_ID);
}

export async function writeSectorMap(map: SectorMap): Promise<void> {
  await writeFeedContent(ACTIVE_ID, map);
}
