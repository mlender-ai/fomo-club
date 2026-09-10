import type { MoodSignal } from "../mood-signals";
import { classifySignal, type RawSignal } from "./classify";
import { MOCK_FEED_CARDS } from "./mock";
import { translateSignal } from "./translate";
import {
  FEED_CONFIDENCE_THRESHOLD,
  FEED_EMOTIONS,
  type EmotionCard,
  type FeedEmotion,
} from "./types";

/**
 * pipeline — 신호 묶음을 감정별 피드 카드로 만든다. docs/PIVOT_FEED_FIRST.md Phase 3.
 *
 * - 신뢰도 미달/금칙어 카드는 버린다 (잘못 분류된 카드 1개가 신뢰를 깬다).
 * - 빈 화면 금지: 실데이터 카드가 부족한 탭은 큐레이션 mock 으로 채운다(근거 "샘플" 표기).
 * - 출력은 피드 탭(Phase 2)과 오늘 탭 롤링 시그널(Phase 1)이 공유한다.
 */

export interface FeedBuildOptions {
  /** 탭별 최소 카드 수 — 미달분은 mock 으로 채움. */
  minPerTab?: number;
  /** 탭별 최대 카드 수(실데이터 상한). */
  maxPerTab?: number;
  /** 채움용 큐레이션 풀 (기본 MOCK_FEED_CARDS). */
  fillWith?: Record<FeedEmotion, EmotionCard[]>;
}

export type FeedCards = Record<FeedEmotion, EmotionCard[]>;

/** 신호 → 분류 → 번역 → 감정별 그룹. 신뢰도 순 정렬. */
export function buildFeedCards(raws: RawSignal[], opts: FeedBuildOptions = {}): FeedCards {
  const { minPerTab = 5, maxPerTab = 20, fillWith = MOCK_FEED_CARDS } = opts;

  const out: FeedCards = { fomo: [], fear: [], joy: [], regret: [], greed: [] };
  const seen = new Set<string>();

  for (const raw of raws) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);

    const cls = classifySignal(raw);
    if (!cls || cls.confidence < FEED_CONFIDENCE_THRESHOLD) continue;
    const card = translateSignal(raw, cls);
    if (!card) continue;
    out[card.emotion].push(card);
  }

  for (const emotion of FEED_EMOTIONS) {
    out[emotion] = out[emotion]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxPerTab);
    // 빈 화면 금지 — 부족분은 큐레이션으로 채움 (실데이터가 항상 앞).
    for (const mock of fillWith[emotion] ?? []) {
      if (out[emotion].length >= minPerTab) break;
      if (out[emotion].some((c) => c.id === mock.id)) continue;
      out[emotion].push(mock);
    }
  }

  return out;
}

/** 감정별 시그널 이모지 — 오늘 탭 롤링용 포인트. */
const MOOD_EMOJI: Record<FeedEmotion, string> = {
  fomo: "🔥",
  fear: "🌊",
  joy: "✨",
  regret: "🌙",
  greed: "💰",
};

/**
 * 피드 카드 → 오늘 탭 롤링 시그널. 감정별 최고 신뢰도 카드를 하나씩 뽑는다.
 * mock(샘플) 카드는 오늘 탭에 흘리지 않는다 — 정직한 숫자 원칙.
 */
export function feedCardsToMoodSignals(cards: FeedCards, limit = 4): MoodSignal[] {
  const out: MoodSignal[] = [];
  for (const emotion of FEED_EMOTIONS) {
    const top = (cards[emotion] ?? []).find((c) => !c.id.startsWith("mock-"));
    if (!top) continue;
    out.push({ id: `mood-${top.id}`, emoji: MOOD_EMOJI[emotion], text: top.headline });
    if (out.length >= limit) break;
  }
  return out;
}
