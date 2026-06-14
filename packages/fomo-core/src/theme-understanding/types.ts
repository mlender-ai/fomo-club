/**
 * 이해 레이어 타입 — DATA_ENGINE_STRATEGY §3·§4 Track A.
 *
 * 기존 키워드 엔진(extract/score/comment)은 "카운팅"이다. 이 레이어는 그 위에 *추가*로,
 * 수집한 원문을 LLM 이 *읽고* 구조화한 "판단 재료"를 만든다(분류 아닌 이해).
 *
 * 절대 규칙(SSOT): 근거는 원문에 출처가 있어야 한다(환각 금지) · 강세/약세 균형(일방이면 정직 표기) ·
 *   투자조언/매매신호 금지(판단 재료지 답이 아님) · 데이터 부족 시 정직한 빈 상태.
 */

export type SourceKind = "news" | "community" | "official";

export type { SourceTier } from "../news-feed/types";

/** 수집한 원문 1건(제목·본문 보존 — 커뮤니티 글도 제목을 버리지 않는다). */
export interface SourceDoc {
  /** 인용 식별자(예: "S1"). 근거가 어느 원문에서 나왔는지 추적·검증용. */
  id: string;
  kind: SourceKind;
  title: string;
  /** 요약/본문(있으면). 뉴스 RSS 요약·커뮤니티 본문 등. */
  body?: string;
  /** 매체/커뮤니티명(예: "한국경제", "네이버 종토방 005930"). */
  source?: string;
  url?: string;
  publishedAt?: string;
  /** 소스 신뢰도 등급(§4.5) — 가중·정직 표기용. */
  tier?: import("../news-feed/types").SourceTier;
}

/** 강세/약세 근거 1건 — 반드시 원문에 박힌 인용으로 뒷받침. */
export interface Evidence {
  /** 재가공된 근거 한 줄(이해의 결과). */
  claim: string;
  /** 어느 SourceDoc 에서 나왔나(SourceDoc.id). */
  sourceId: string;
  /** 그 원문에 *실제로* 있는 문구(검증용 — assemble 이 substring 으로 확인, 없으면 폐기). */
  quote: string;
}

/** 사람들이 실제로 한 말(여론 워딩 — 개수가 아니라 내용). */
export interface KeyWording {
  text: string;
  sourceId: string;
}

export type { WordingVerdict } from "./wording-filter";

export type ThemeStance = "balanced" | "bull-dominant" | "bear-dominant" | "insufficient";
export type ThemeInsightConfidence = "ok" | "low" | "insufficient";

/** 응답에 동봉하는 원문 출처(유저/검수자가 근거를 원문과 대조). */
export interface InsightSourceRef {
  id: string;
  kind: SourceKind;
  title: string;
  source?: string;
  url?: string;
  /** 소스 신뢰도 등급(§4.5) — 카드/뎁스에 정직 표기. */
  tier?: import("../news-feed/types").SourceTier;
}

/** 공식 지표 팩트(FRED 등) — 방향성 주장이 아니라 *중립 사실 숫자*. official-high. */
export interface OfficialFact {
  /** 예: "미국 기준금리(연방기금금리) 3.63%". */
  label: string;
  /** 보충 문장(시점 등). */
  detail?: string;
  source: string;
  url?: string;
  tier: import("../news-feed/types").SourceTier;
}

/** 한 테마의 이해·구조화 결과. */
export interface ThemeInsight {
  theme: string;
  /** 원문에서 짚힌 종목/섹터. */
  stocks: string[];
  /** 강세 근거(원문 grounded). */
  bull: Evidence[];
  /** 약세 근거(원문 grounded). */
  bear: Evidence[];
  /** 사람들 실제 워딩. */
  wordings: KeyWording[];
  stance: ThemeStance;
  /** 일방일 때 그 사실을 정직하게(예: "약세 관점은 원문에서 안 보임"). */
  stanceNote: string;
  /** 근거가 박힌 원문 목록(검증용). */
  sources: InsightSourceRef[];
  confidence: ThemeInsightConfidence;
  /** 정직성/디버그 — 왜 이 confidence·stance 인지. */
  reason: string;
  /** 워딩 필터 전/후 감사 로그(통과·탈락 + 사유, 검수용). */
  wordingAudit?: import("./wording-filter").WordingVerdict[];
  /** 공식 지표 팩트(FRED 등) — 강세/약세와 별개로 중립 사실 노출(C-2). */
  officialFacts?: OfficialFact[];
}
