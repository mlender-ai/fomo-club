/**
 * 출력 정제(sanitize) — 표시 직전 후처리. theme-understanding 추출 로직 본체와 무관.
 *
 * 책임 두 가지(BUGFIX DEPTH HANDOFF §2, §2-B):
 *  1) HTML 엔티티 디코드 — 수집 원문의 `&quot; &amp; &#39;` 등이 날것으로 노출되는 것 방지.
 *  2) 감싼 따옴표 제거 — 화면에서 따옴표를 다시 입히는 워딩에 원문 따옴표가 겹쳐 `""…""` 되는 것 방지.
 *
 * 순수 함수. 추출/점수/응축 로직은 절대 건드리지 않는다 — 이미 만들어진 문자열의 표면만 다듬는다.
 */

/** 자주 나오는 named HTML 엔티티 (수집 소스가 뱉는 범위). */
const NAMED_ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&#34;": '"',
  "&#39;": "'",
};

/**
 * HTML 엔티티를 정상 문자로 디코드. named + 십진(&#39;)·십육진(&#x27;) 숫자 엔티티 모두 처리.
 * `&amp;` 는 마지막에 풀어 이중 디코드(`&amp;quot;` → `"`)를 피한다.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input) return input;
  let s = input;
  // 숫자 엔티티 먼저 (&#39; / &#x27;)
  s = s.replace(/&#(\d+);/g, (_, d: string) => safeFromCodePoint(parseInt(d, 10)));
  s = s.replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h: string) => safeFromCodePoint(parseInt(h, 16)));
  // named — &amp; 는 잠시 보류
  for (const [ent, ch] of Object.entries(NAMED_ENTITIES)) {
    if (ent === "&amp;") continue;
    s = s.split(ent).join(ch);
  }
  s = s.split("&amp;").join("&");
  return s;
}

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/** 양끝을 감싼 따옴표 쌍을 한 겹씩 벗긴다(중첩이면 반복). 짝이 맞을 때만. */
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"], // “ ”
  ["‘", "’"], // ‘ ’
  ["「", "」"], // 「 」
  ["«", "»"], // « »
];

export function stripWrappingQuotes(input: string): string {
  let s = input.trim();
  let changed = true;
  while (changed && s.length >= 2) {
    changed = false;
    for (const [open, close] of QUOTE_PAIRS) {
      if (s.startsWith(open) && s.endsWith(close) && s.length > open.length + close.length - 1) {
        s = s.slice(open.length, s.length - close.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

/** 일반 텍스트 정제 — 엔티티 디코드 + 트림. (제목·근거·whyHot 등) */
export function cleanText(input: string | null | undefined): string {
  if (!input) return "";
  return decodeHtmlEntities(input).trim();
}

/**
 * 인용 텍스트 정제 — 엔티티 디코드 + 감싼 따옴표 제거.
 * 화면에서 따옴표를 다시 입히는 워딩 전용(중첩 방지).
 */
export function cleanQuote(input: string | null | undefined): string {
  if (!input) return "";
  return stripWrappingQuotes(decodeHtmlEntities(input));
}
