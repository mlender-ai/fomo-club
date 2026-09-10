import type { NewsLang, RawArticle } from "./types";

/**
 * 뉴스 소스 인터페이스 — 확장 seam. docs/PIVOT_FEED_FIRST.md.
 *
 * 지금은 apps/web 에서 Yahoo Finance 소스 1개만 구현해 쓴다.
 * 한국어 뉴스 소스(네이버 금융/연합인포맥스 RSS 등)를 붙일 때 이 인터페이스를 구현해
 * 같은 파이프라인(buildNewsFeed)에 합류시키면 된다 — 점수기·정렬·dedupe 를 그대로 공유.
 *
 * community.ts 의 CommunityProvider 와 같은 패턴.
 */
export interface NewsSource {
  /** 소스 키 (예: "yahoo", "naver-finance"). */
  id: string;
  lang: NewsLang;
  /** 연동 여부 — false 면 수집 스킵(스캐폴드 단계). */
  enabled: boolean;
  /** 정규화된 기사 배열을 반환. 실패 시 빈 배열(빈 화면은 피드 빌더가 처리). */
  fetch(): Promise<RawArticle[]>;
}
