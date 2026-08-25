/**
 * WO-RESET-02 PART A-3 — 모아둔 공시를 읽고 쓴다.
 *
 * `FeedContentCache` 를 그대로 쓴다(브리핑·픽 페이로드와 같은 창구). 새 테이블을 만들지 않는 이유는
 * 이 데이터의 수명·접근 패턴이 그것들과 같기 때문이다: **크론이 쓰고 요청 경로는 읽기만** 한다.
 *
 * 행은 하나다(`disclosures:active`). 종목별로 쪼개지 않는 이유:
 * 픽 페이로드를 굽는 크론이 **한 번에 전부** 필요하다. 10~20 행을 병렬로 읽으면 커넥션 풀을
 * 그만큼 잡고, 그것이 `docs/STATUS.md` §12 의 사고였다.
 */

import { readFeedContent, writeFeedContent } from "./feed-content-store";
import type { DisclosureCollection } from "./disclosure-collect";

const ACTIVE_ID = "disclosures:active";

export async function readDisclosureCollection(): Promise<DisclosureCollection | null> {
  return readFeedContent<DisclosureCollection>(ACTIVE_ID);
}

export async function writeDisclosureCollection(collection: DisclosureCollection): Promise<void> {
  await writeFeedContent(ACTIVE_ID, collection);
}
