import type { RawArticle } from "./types";

/**
 * FOMO 점수기 — 기사 1건을 0~100으로 매긴다(놓치면 불안한 정도). docs/PIVOT_FEED_FIRST.md.
 *
 * 규칙 기반 1차(키워드 + 최신성). LLM 미연결 시 이게 전부 — 빈 점수 없음.
 * 점수 ≠ 감정 치환: 헤드라인은 사실 그대로 두고, 정렬용 점수만 산출한다.
 *
 * 키워드는 영어+한국어를 함께 본다 → 한국어 뉴스 소스를 붙여도 같은 점수기를 쓴다(확장성).
 */

interface ScoreKeywords {
  /** 강한 FOMO 유발 (신고가/급등/랠리 등). */
  surge: readonly string[];
  /** 완만한 상승/호재. */
  rise: readonly string[];
  /** FOMO와 반대(급락/소송/하향) — 점수를 끌어내린다. */
  damp: readonly string[];
}

const EN: ScoreKeywords = {
  surge: [
    "record", "all-time high", "all time high", "ath", "soar", "surge", "skyrocket",
    "rocket", "rally", "rallies", "jump", "spike", "boom", "beats estimate", "beats",
    "smash", "breakout", "new high", "highest ever", "double", "triple", "explode", "tops",
  ],
  rise: [
    "rise", "gain", "climb", "higher", "growth", "raises", "upgrade", "outperform",
    "bullish", "momentum", "rebound", "optimism",
  ],
  damp: [
    "plunge", "crash", "fall", "drop", "slump", "tumble", "sink", "lawsuit", "probe",
    "investigation", "downgrade", "cut", "miss", "warning", "warn", "loss", "bearish",
    "selloff", "sell-off", "decline", "fear", "recall", "slips",
  ],
};

const KO: ScoreKeywords = {
  surge: [
    "신고가", "사상 최고", "최고가", "급등", "폭등", "신기록", "랠리", "치솟", "역대 최고",
    "돌파", "급증", "껑충", "신고점", "사상최고",
  ],
  rise: ["상승", "오름", "강세", "반등", "상향", "호재", "기대", "낙관"],
  damp: [
    "급락", "폭락", "하락", "약세", "소송", "조사", "하향", "적자", "경고", "우려",
    "손실", "리콜", "매도세", "둔화",
  ],
};

const BASE = 45;
const SURGE_FIRST = 22;
const SURGE_EXTRA = 6;
const SURGE_CAP = 38;
const RISE_EACH = 8;
const RISE_CAP = 20;
const DAMP_EACH = 18;
const DAMP_CAP = 42;

/** 최신성 가산 — 빠를수록 FOMO. ms 경과 기준. */
function recencyBonus(publishedAtMs: number, nowMs: number): number {
  const hours = (nowMs - publishedAtMs) / 3_600_000;
  if (Number.isNaN(hours) || hours < 0) return 6; // 미래/파싱불가 → 중립 소량
  if (hours <= 3) return 18;
  if (hours <= 12) return 10;
  if (hours <= 48) return 4;
  return 0;
}

function countHits(haystack: string, needles: readonly string[]): number {
  let n = 0;
  for (const k of needles) if (haystack.includes(k)) n += 1;
  return n;
}

export interface FomoScore {
  score: number;
  reason: string;
}

/** 0~100 보정. */
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * 기사 → FOMO 점수. 제목+요약을 영/한 키워드로 검사 + 최신성 가산.
 * @param nowMs 현재 시각(ms) — 테스트 주입용.
 */
export function scoreArticleFomo(article: RawArticle, nowMs: number): FomoScore {
  const blob = `${article.title} ${article.summary ?? ""}`.toLowerCase();

  const surge = countHits(blob, EN.surge) + countHits(blob, KO.surge);
  const rise = countHits(blob, EN.rise) + countHits(blob, KO.rise);
  const damp = countHits(blob, EN.damp) + countHits(blob, KO.damp);

  let score = BASE;
  if (surge > 0) score += Math.min(SURGE_FIRST + (surge - 1) * SURGE_EXTRA, SURGE_CAP);
  score += Math.min(rise * RISE_EACH, RISE_CAP);
  score -= Math.min(damp * DAMP_EACH, DAMP_CAP);

  const recency = recencyBonus(Date.parse(article.publishedAt), nowMs);
  score += recency;

  return {
    score: clamp(score),
    reason: `base${BASE} surge${surge} rise${rise} damp${damp} rec+${recency}`,
  };
}
