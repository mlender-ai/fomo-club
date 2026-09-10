import type { FeedEmotion } from "./types";

/**
 * classify — 시장/커뮤니티 신호를 5개 감정 중 하나로 분류한다. docs/PIVOT_FEED_FIRST.md Phase 3.
 *
 * 규칙 기반 1차. LLM 연결 시 이 결과를 prior 로 쓰고 고도화할 수 있다(미연결 시 이 폴백이 전부).
 * 분류 오류 방지: 애매하면 null/낮은 신뢰도 — 환희 탭에 폭락 기사가 들어가는 사고 1건이
 * 제품 신뢰를 깬다. 보수적으로.
 */

/** 치환 엔진의 공통 입력 — 기존 fomo-core 소스(macro/whale/community)를 정규화한 형태. */
export interface RawSignal {
  /** 안정 식별자 (카드 id의 근간). */
  id: string;
  /** 소스 종류 (예: "macro", "whale", "community", "news"). */
  source: string;
  /** 사람이 읽는 대상명 (예: "코스피", "비트코인", "커뮤니티"). */
  label?: string;
  /** 뉴스/게시물 제목 — 있으면 키워드 분류 1순위. */
  title?: string;
  /** 등락률(%) — 전일/24h 등. */
  changePct?: number | null;
  /** 전고점 대비(%) — 물림 깊이. */
  athChangePct?: number | null;
  /** 커뮤니티 bullish 비율 0~1. */
  bullishRatio?: number;
  /** 언급량/게시물 수 — bullishRatio 의 표본 크기. */
  mentions?: number;
  /** 근거 표기용 수치 문자열 (예: "+2.1%"). */
  value?: string;
  sourceUrl?: string;
}

export interface Classification {
  emotion: FeedEmotion;
  /** 0~1. FEED_CONFIDENCE_THRESHOLD 미만은 파이프라인이 버린다. */
  confidence: number;
  /** 분류 근거 (디버그/튜닝용). */
  reason: string;
}

/** 제목 키워드 — 한 감정만 매칭될 때만 채택(겹치면 애매 → 포기). */
const TITLE_KEYWORDS: Record<FeedEmotion, readonly string[]> = {
  fomo: ["놓쳤", "놓친", "막차", "지금이라도", "나만 없", "fomo"],
  fear: ["폭락", "급락", "손절", "공포", "무섭", "패닉", "크래시", "crash"],
  joy: ["신고가", "최고가", "축포", "환호", "랠리", "급등 마감"],
  regret: ["팔았는데", "살걸", "팔걸", "후회", "물렸", "물린"],
  greed: ["몰빵", "풀매수", "추매", "레버리지", "한 주만 더", "더 사"],
};

/** 등락률 구간 임계(%). */
const SURGE = 3;
const RISE = 1.5;
const DROP = -1.5;
const PLUNGE = -3;
/** 전고점 대비 이만큼 빠져 있으면 "물림"으로 본다(%). */
const DEEP_UNDERWATER = -30;
/** bullishRatio 를 믿기 위한 최소 표본(게시물 수). */
const MIN_MENTIONS = 5;

function classifyTitle(title: string): Classification | null {
  const t = title.toLowerCase().replace(/\s+/g, " ");
  const hits: { emotion: FeedEmotion; count: number }[] = [];
  for (const emotion of Object.keys(TITLE_KEYWORDS) as FeedEmotion[]) {
    const count = TITLE_KEYWORDS[emotion].filter((k) => t.includes(k)).length;
    if (count > 0) hits.push({ emotion, count });
  }
  if (hits.length !== 1) return null; // 무매칭 또는 감정 간 충돌 → 애매
  const hit = hits[0]!;
  return {
    emotion: hit.emotion,
    confidence: hit.count >= 2 ? 0.85 : 0.7,
    reason: `title:${hit.emotion}x${hit.count}`,
  };
}

/**
 * 신호 1개 → 감정 분류. 분류 근거가 부족하면 null (그 카드는 노출하지 않는다).
 * 우선순위: 제목 키워드 > 물림 깊이(ath) > 등락률 > 커뮤니티 비율.
 */
export function classifySignal(raw: RawSignal): Classification | null {
  if (raw.title) {
    const byTitle = classifyTitle(raw.title);
    if (byTitle) return byTitle;
  }

  const ath = raw.athChangePct;
  if (typeof ath === "number" && ath <= DEEP_UNDERWATER) {
    return { emotion: "regret", confidence: 0.75, reason: `ath:${ath}` };
  }

  const chg = raw.changePct;
  if (typeof chg === "number") {
    if (chg >= SURGE) return { emotion: "joy", confidence: 0.8, reason: `chg:+${chg}` };
    if (chg >= RISE) return { emotion: "fomo", confidence: 0.65, reason: `chg:+${chg}` };
    if (chg <= PLUNGE) return { emotion: "fear", confidence: 0.8, reason: `chg:${chg}` };
    if (chg <= DROP) return { emotion: "fear", confidence: 0.6, reason: `chg:${chg}` };
    // 보합은 감정 신호가 아니다 — 다음 규칙으로.
  }

  const ratio = raw.bullishRatio;
  if (typeof ratio === "number" && (raw.mentions ?? 0) >= MIN_MENTIONS) {
    if (ratio >= 0.7) return { emotion: "greed", confidence: 0.7, reason: `bullish:${ratio}` };
    if (ratio <= 0.3) return { emotion: "fear", confidence: 0.65, reason: `bearish:${ratio}` };
  }

  return null;
}
