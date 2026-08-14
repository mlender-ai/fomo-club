/**
 * 픽 화면 용어 사전 (WO-SUB-HOOK PART 5) — **금지어와 대체어를 코드가 아는 한 곳**.
 *
 * ## 왜 사전을 코드에 두나
 *
 * "어려운 말을 쓰지 말자"는 리뷰로는 지켜지지 않는다. 6주 전 지적이 그대로 화면에 남아 있던
 * 이유가 그것이다. 사전을 두고 테스트가 **픽 표면의 사용자 노출 문자열**을 훑는다
 * (`pick-vocabulary.test.ts` · `pickCopyVocabulary.test.ts`). 걸리면 예외를 뚫지 않고 문장을 고친다.
 *
 * ## 무엇이 "사용자 노출"인가
 *
 * 주석은 대상이 아니다 — 화면에 나가지 않는다. 스캐너는 주석을 제거한 뒤 문자열·JSX 텍스트만 본다.
 * 그래서 이 파일의 금지어 목록 자체(=문자열)는 스캔 대상에서 제외된다(사전은 사전이다).
 */

export interface BannedTerm {
  /** 화면에 나오면 안 되는 말. */
  term: string;
  /** 대신 쓸 말 — 그대로 치환할 수 없는 경우는 "문장 재작성". */
  replacement: string;
  /** 왜 어려운가 / 왜 오해되는가. */
  why: string;
}

/**
 * 전역 치환 대상. 순서가 중요하다 — 긴 말이 먼저 걸려야 부분 치환으로 뭉개지지 않는다
 * ("내부자 클러스터"가 "내부자"보다 앞).
 */
export const PICK_BANNED_TERMS: readonly BannedTerm[] = [
  { term: "내부자 클러스터", replacement: "임원 여러 명이 함께", why: "클러스터가 무엇인지 알 수 없다" },
  { term: "클러스터", replacement: "여러 명이 함께", why: "번역되지 않은 분석 용어" },
  { term: "내부자", replacement: "임원", why: "법률·부정 뉘앙스로 읽힌다" },
  { term: "이 관점은 무효예요", replacement: "이 판단은 다시 봐야 해요", why: "관점·무효 둘 다 어렵다" },
  { term: "무효선", replacement: "되돌아보는 선", why: "무효는 계약서 말이다" },
  { term: "관점", replacement: "판단", why: "추상적이고 어렵다" },
  { term: "무효", replacement: "다시 봐야 하는", why: "무효는 계약서 말이다" },
  { term: "수급", replacement: "(문장 재작성)", why: "증권 용어. 누가 얼마나 샀는지로 풀어 쓴다" },
  { term: "매집", replacement: "사 모으고 있어요", why: "세력·작전 뉘앙스가 붙은 은어" },
  { term: "이례적", replacement: "드문", why: "한자어. 드물다/처음이다로 쓴다" },
] as const;

/** 문맥 없이는 판정할 수 없어 **문장 재작성**을 요구하는 말(단순 치환 금지). */
export const PICK_REWRITE_ONLY_TERMS: readonly string[] = ["수급"];

/**
 * 은어 "자리" — 트레이더 말이다("눌림 자리", "말라 있던 자리").
 * `자리` 는 일반 명사이기도 해서(일자리·자리표시자) 낱말 단위로만 잡는다.
 */
export const PICK_BANNED_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string; why: string }> = [
  { pattern: /[가-힣]\s?자리(예요|에요|입니다|다|였|고|라|를|가|에|의|\b)/, replacement: "시점", why: "‘자리’는 트레이더 은어" },
  { pattern: /하였음|되었음|이었음|있음\./, replacement: "해요체", why: "등기부 문체가 카드 해요체와 충돌한다" },
];

/** 문자열 하나에서 걸린 금지어. 없으면 빈 배열. */
export function findBannedTerms(text: string): string[] {
  const hits: string[] = [];
  for (const { term } of PICK_BANNED_TERMS) {
    if (text.includes(term) && !hits.some((h) => h.includes(term))) hits.push(term);
  }
  for (const { pattern } of PICK_BANNED_PATTERNS) {
    const found = text.match(pattern);
    if (found) hits.push(found[0]);
  }
  return hits;
}
