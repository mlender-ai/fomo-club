/**
 * WO-RESET-07 — 인물 보유 내역 저장·조회.
 *
 * `FeedContentCache` 를 그대로 쓴다(공시 수집과 같은 창구). 행은 **하나**다 —
 * 픽을 굽는 크론이 한 번에 전부 필요하고, 인물별로 쪼개 병렬로 읽으면 커넥션 풀에서
 * 그만큼 슬롯을 잡는다(`docs/STATUS.md` §12 의 사고).
 */

import { readFeedContent, writeFeedContent } from "./feed-content-store";
import type { InvestorCollection } from "./investor-collect";

const ACTIVE_ID = "investors:active";

export async function readInvestorCollection(): Promise<InvestorCollection | null> {
  return readFeedContent<InvestorCollection>(ACTIVE_ID);
}

/** 실패를 **던진다.** 삼키면 "인물 데이터가 없는 날" 과 "DB 를 못 읽었다" 가 같아진다(§18-E2). */
export async function readInvestorCollectionStrict(): Promise<InvestorCollection | null> {
  return readFeedContent<InvestorCollection>(ACTIVE_ID);
}

export async function writeInvestorCollection(collection: InvestorCollection): Promise<void> {
  await writeFeedContent(ACTIVE_ID, collection);
}
