/**
 * 뉴스 피드 — 실제 기사를 FOMO 점수로 매겨 사실 그대로 보여준다. docs/PIVOT_FEED_FIRST.md.
 *
 * 방향(2026-06-12): 감정으로 "치환"한 글이 아니라, 실제 기사 헤드라인을 사실 적시 그대로 두고
 * FOMO 점수(0~100, 놓치면 불안한 정도)로 점수화해 단일 피드에 점수순으로 흘린다.
 *
 * 확장성(요청 반영): 지금은 영문 Yahoo Finance RSS 1개 소스/영문 표기.
 * - 한국어 번역: title/summary 옆에 titleKo/summaryKo 자리를 둔다. localizeArticle 이 선택.
 * - 한국어 뉴스 소스: NewsSource 인터페이스(source.ts)로 추가 소스를 같은 파이프라인에 붙인다.
 */

export type NewsLang = "en" | "ko";

/** 정규화된 원본 기사 — 소스(Yahoo/네이버/연합 등) 무관 공통 형태. */
/**
 * 소스 신뢰도 등급(tier) — DATA_ENGINE_STRATEGY §4.5. 가지치기를 설정화하기 위한 메타.
 * 같은 "강세"라도 official-high(FRED) > news-mid(연합/한경) > community-mid(종토방) > community-low(디시).
 * 나중에 "디시 가중치↓" 같은 조정이 코드 수술이 아니라 tier 가중치 한 줄이 되게 한다.
 */
export type SourceTier = "official-high" | "news-mid" | "community-mid" | "community-low";

export interface RawArticle {
  /** 안정 식별자 (보통 url 해시/슬러그). */
  id: string;
  /** 사실 헤드라인 (소스 언어 그대로). */
  title: string;
  /** 사실 요약 (1~2문장, 소스 제공분). */
  summary?: string;
  /** 원문 링크. */
  url: string;
  /** 출처명 (예: "Yahoo Finance", "연합인포맥스"). */
  source: string;
  /** 발행 시각 ISO 8601. */
  publishedAt: string;
  /** 분류 카테고리 (실적/M&A/거시경제 등). */
  category?: string;
  /** 어느 티커/종목에서 수집됐는지. */
  symbol?: string;
  /** 소스 신뢰도 등급 — 수집 레이어가 부착(가지치기·가중치용). */
  tier?: SourceTier;
  /** 소스 원어. 점수기·번역기가 참고. */
  lang: NewsLang;
  /** 향후 한국어 번역 자리 (지금은 비움). */
  titleKo?: string;
  summaryKo?: string;
}

/** FOMO 점수가 매겨진 기사 — 피드에 노출되는 최종 형태. */
export interface ScoredArticle extends RawArticle {
  /** FOMO 점수 0~100 — 높을수록 "놓치면 불안한" 뜨거운 뉴스. */
  fomoScore: number;
  /** 점수 근거 (디버그/튜닝용, UI 비노출). */
  scoreReason: string;
  /** 포모(마스코트)의 한 줄 코멘트. LLM 생성, 실패 시 규칙 폴백. */
  comment?: string;
}
