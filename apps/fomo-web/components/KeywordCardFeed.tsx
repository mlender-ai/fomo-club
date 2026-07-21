"use client";

import { UnifiedDailyDeck } from "@/components/UnifiedDailyDeck";

interface FeedGate {
  loggedIn?: boolean;
  onRequireLogin?: () => void;
}

/** Legacy route adapter. The product surface is the unified daily deck. */
export function KeywordCardFeed({ loggedIn, onRequireLogin }: FeedGate = {}) {
  return <UnifiedDailyDeck loggedIn={loggedIn} onRequireLogin={onRequireLogin} />;
}
