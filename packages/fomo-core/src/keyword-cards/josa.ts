/**
 * 한국어 조사 자동 선택 — 받침 유무로 은/는·이/가·을/를·와/과 결정.
 * 키워드명이 코드로 조립되는 코멘트에서 "코인는" 같은 오류를 막는다.
 *
 * 순수 함수. 영문 약어(AI·ETF 등)는 받침 판정이 불가하므로 발음 기준 예외맵으로 처리한다
 * (한국어로 읽을 때의 끝소리: "AI"=에이아이 → 받침 없음 → 는/가/를).
 */

/** 조사 쌍: [받침 있을 때, 받침 없을 때]. */
const PAIRS: Record<string, readonly [string, string]> = {
  은는: ["은", "는"],
  이가: ["이", "가"],
  을를: ["을", "를"],
  와과: ["과", "와"],
  /**
   * `으로`/`로` — 방향 조사. **ㄹ 받침은 예외**다: `서울로`(`서울으로` 아님).
   * 그 예외를 무시하면 업종·지명에서 바로 틀린다.
   */
  으로: ["으로", "로"],
};

/**
 * 영문/비한글 키워드의 발음상 받침 여부 예외맵(true=받침 있음).
 * 대부분의 한국어로 읽는 약어는 모음으로 끝나(받침 없음) → 기본 false. 자음 끝소리만 등록.
 */
const NON_HANGUL_BATCHIM: Record<string, boolean> = {
  AI: false, // 에이아이
};

/** 마지막 글자의 받침 유무. 한글 음절은 (code-0xAC00)%28, 비한글은 예외맵(없으면 모음끝=false). */
export function hasBatchim(word: string): boolean {
  const w = word.trim();
  if (w.length === 0) return false;
  if (w in NON_HANGUL_BATCHIM) return NON_HANGUL_BATCHIM[w]!;
  const ch = w[w.length - 1]!;
  const code = ch.charCodeAt(0);
  // 한글 음절 영역
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 숫자/영문 등 비한글: 한국어 발음 끝소리는 대개 모음 → 받침 없음으로 본다.
  return false;
}

/** word 뒤에 붙일 조사를 반환(조사만). 예: josa("코인","은는")="은". */
export function josa(word: string, pair: keyof typeof PAIRS): string {
  const [withB, withoutB] = PAIRS[pair]!;
  /**
   * `으로` 는 **ㄹ 받침을 받침 없는 것처럼** 다룬다 — `서울로` 이지 `서울으로` 가 아니다.
   * 다른 조사에는 이 예외가 없다(`서울은` 은 맞다).
   */
  if (pair === "으로" && endsWithRieul(word)) return withoutB;
  return hasBatchim(word) ? withB : withoutB;
}

/** 마지막 글자가 ㄹ 받침인가. 한글 음절의 종성 코드 8이 ㄹ이다. */
function endsWithRieul(word: string): boolean {
  const w = word.trim();
  const ch = w[w.length - 1];
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 === 8;
}
