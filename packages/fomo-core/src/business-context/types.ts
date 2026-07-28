/**
 * WO-SUB-03 "왜 이 회사인가" v2 — 3슬롯 사업 실체.
 *
 * 절대 규칙(§3):
 *  1. **근거 문서 없이 생성 금지.** 각 문장은 `source_ids` 를 갖고, 비면 렌더링하지 않는다.
 *  2. **소스 종류 분리.** 슬롯 1·2 는 공시 문서 기반. 뉴스·커뮤니티 금지.
 *  3. 슬롯 3 은 거시·시장 데이터 또는 공시만.
 *  4. **인과 단정 금지.** 시점 병기까지만.
 *  5. **얇으면 얇다고 표시.** 채워 넣는 순간 이 배치의 존재 이유가 무너진다.
 *  6. **결정론.** 온도 0, 프롬프트 버전 기록.
 *  7. **배치 합성 + 캐시.** 요청 시점 LLM 호출 금지.
 */

/**
 * 소스 종류. **섞지 않고 라벨한다**(배치 규칙 6 "소스 종류 분리").
 *  · `disclosure`      — 정기공시 본문(10-K Item 1, 사업보고서 "사업의 내용", 20-F)
 *  · `vendor_summary`  — 데이터 벤더가 편집한 회사 요약(네이버 `corporationSummary` 등).
 *                        공시가 아니다. 뉴스도 아니다. **제3의 종류로 따로 센다.**
 *  · `market_data`     — 거시·시장 지표(슬롯 3 전용)
 */
export type BusinessSourceKind = "disclosure" | "vendor_summary" | "market_data";

/** 청크 — 합성의 유일한 입력이고, 검증과 사용자 노출에 쓰인다. */
export interface SourceChunk {
  /** `{doc_id}#{chunk_index}` */
  source_id: string;
  doc_id: string;
  chunk_index: number;
  kind: BusinessSourceKind;
  text: string;
}

export interface SourceDocument {
  doc_id: string;
  kind: BusinessSourceKind;
  /** "sec_10k" | "naver_corporation_summary" | ... */
  source: string;
  url: string | null;
  /** 문서 기준일(공시일 등). */
  as_of: string | null;
  fetched_at: string;
  /** 원문(추출된 섹션) 해시 — 갱신 감지·재합성 트리거. */
  snapshot_hash: string;
  /** 추출된 섹션 문자 수. */
  chars: number;
}

/**
 * 근거를 가진 문장. `source_ids` 가 **비어 있을 수 없다**(완료 조건 2).
 * 생성은 `sourcedSentence()` 로만 한다 — 빈 배열을 넣으면 `null` 이 나온다.
 */
export interface SourcedSentence {
  text: string;
  source_ids: readonly [string, ...string[]];
  /** 이 문장의 근거가 어느 종류인지 — 화면에 그대로 표기한다. */
  kind: BusinessSourceKind;
  /** 근거 검증 패스 통과 여부. `false` 면 렌더하지 않는다. */
  verified: boolean;
}

/** 슬롯 3 — 자유 서술 금지. 카탈로그 변수 + 템플릿으로만 만든다. */
export interface DependencyState {
  /** 카탈로그 변수 코드. */
  variable: string;
  label_ko: string;
  value_text: string;
  as_of: string;
  source: string;
  /** "3개월 상승" 같은 방향 표기. 없으면 생략한다. */
  trend_text: string | null;
  /** 완성 문장(템플릿 렌더 결과). */
  text: string;
}

export type ContextBadge = "충분" | "보통" | "낮음" | "없음";

export interface BusinessContext {
  canonical: string;
  market: "KR" | "US";
  /** 이 레코드를 만든 시각. */
  synthesized_at: string;
  /** 프롬프트 버전 — 재합성 트리거이자 결정론 기록. */
  prompt_version: string;
  /** 합성에 쓴 모델. */
  model: string;

  /** 슬롯 1 — 어디서 돈을 버는가. */
  slot1_revenue_source: SourcedSentence | null;
  /** 슬롯 2 — 무엇에 걸려 있는가. */
  slot2_dependency: SourcedSentence | null;
  /** 슬롯 3 — 그 대상은 지금 어떤 상태인가. */
  slot3_dependency_state: DependencyState | null;

  badge: ContextBadge;
  /** 슬롯이 빈 사유. 채우지 못한 것을 숨기지 않는다. */
  insufficient_reason: string | null;

  documents: SourceDocument[];
  /** 사용자에게 근거를 보여주기 위한 인용 청크(합성이 인용한 것만). */
  cited_chunks: SourceChunk[];
  /** 소스·추출·검증 실패 사유. */
  errors: string[];
}

/**
 * 근거 있는 문장을 만드는 **유일한 경로.** `source_ids` 가 비면 `null` 을 돌려주므로
 * 근거 없는 문장이 타입상 존재할 수 없다(완료 조건 2).
 */
export function sourcedSentence(
  text: string,
  sourceIds: readonly string[],
  kind: BusinessSourceKind,
  verified: boolean
): SourcedSentence | null {
  const clean = text.trim();
  const ids = sourceIds.map((id) => id.trim()).filter(Boolean);
  if (!clean || ids.length === 0) return null;
  const [first, ...rest] = ids as [string, ...string[]];
  return { text: clean, source_ids: [first, ...rest], kind, verified };
}
