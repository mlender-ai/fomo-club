/**
 * "어떤 회사예요" 요약 다듬기 (WO-SUB-HOOK PART 3-3) — 벤더 원문을 그대로 노출하지 않는다.
 *
 * ## 무엇이 문제였나 (2026-08-14 화면 실측 D7)
 *
 *   동사는 1990년 빅텍파워시스템으로 설립되어 1996년 법인 설립, 2003년 코스닥시장에 상장하였음.
 *   … 방위사업에서 전자전 시스템, 군용전원공급장치, … 생산하고, 민수사업에서는 공공자전거
 *   무인대여시스템을 운영하고 있음.
 *
 * 등기부 문체(`~하였음`)가 카드 전체 해요체와 충돌하고, **첫 문장이 설립·상장 연도로 시작한다.**
 * 처음 보는 회사에서 사용자가 알아야 할 것은 "무엇을 만들어 파는가"지 1996년 법인 설립이 아니다.
 *
 * ## 무엇을 하나
 *
 * 1. 설립·상장·법인 설립만 말하는 문장을 버린다(연혁은 판단에 쓰이지 않는다).
 * 2. 종결어미를 해요체로 바꾼다(`하였음` → `했어요`).
 * 3. 두 문장까지만 남긴다 — 카드 뎁스 첫 블록은 훑어보는 자리다.
 * 4. 원문은 버리지 않고 그대로 돌려준다. 화면이 "출처 보기"로 접어 둔다(정직 원칙).
 *
 * **요약을 새로 쓰지 않는다.** LLM 도 부르지 않는다(INV-14 — 렌더 경로에서 계산/LLM 금지).
 * 있는 문장을 고르고 어미만 바꾸는 순수 함수다.
 */

export interface CompanySummaryCopy {
  /** 화면에 낼 문장(해요체, 연혁 제거, 최대 2문장). 남길 게 없으면 빈 문자열. */
  text: string;
  /** 벤더 원문 — "출처 보기"로 접어 둔다. */
  raw: string;
  /** 원문에서 실제로 덜어냈는가(접기 UI 노출 판단용). */
  trimmed: boolean;
}

/** 연혁 문장 — 설립·상장·법인만 말하는 문장은 첫 화면에서 뺀다. */
const HISTORY_ONLY = /(설립|상장|법인\s?설립|합병하였|분할하였|사명을?\s?변경)/;
/** 회사가 무엇을 하는지 말하는 문장 — 연혁 낱말이 섞여 있어도 이건 남긴다. */
const BUSINESS_HINT = /(생산|제조|판매|공급|서비스|운영|영위|제공|개발|사업)/;

/** 등기부 종결어미 → 해요체. 긴 것부터 본다(부분 치환 방지). */
const ENDING_RULES: ReadonlyArray<[RegExp, string]> = [
  [/하고\s?있음$/, "하고 있어요"],
  [/되고\s?있음$/, "되고 있어요"],
  [/하였음$/, "했어요"],
  [/되었음$/, "됐어요"],
  [/이었음$/, "이었어요"],
  [/있음$/, "있어요"],
  [/없음$/, "없어요"],
  [/中임$/, "중이에요"],
  [/중임$/, "중이에요"],
  [/함$/, "해요"],
  [/됨$/, "돼요"],
  [/임$/, "이에요"],
];

const MAX_SENTENCES = 2;
/** 문장이 길면 카드 뎁스 첫 블록이 벽이 된다. 넘치면 문장 단위로 자른다. */
const MAX_CHARS = 140;

function toPoliteEnding(sentence: string): string {
  const body = sentence.replace(/\.$/, "").trim();
  for (const [pattern, replacement] of ENDING_RULES) {
    if (pattern.test(body)) return `${body.replace(pattern, replacement)}.`;
  }
  // 규칙에 없는 `~음` 은 일반 변환으로 내린다("영위음" 같은 조어는 원문에 없다).
  if (/음$/.test(body)) return `${body.replace(/음$/, "어요")}.`;
  return /[.!?]$/.test(sentence.trim()) ? sentence.trim() : `${body}.`;
}

/**
 * 벤더 요약 → 화면 문장. 한국어 원문이 아니면(영문 프로필 등) 손대지 않는다 —
 * 어미 규칙이 한국어 전용이라 영문에 적용하면 문장을 망가뜨린다.
 */
export function rewriteCompanySummary(raw: string | null | undefined): CompanySummaryCopy {
  const source = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!source) return { text: "", raw: "", trimmed: false };
  if (!/[가-힣]/.test(source)) return { text: source, raw: source, trimmed: false };

  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const sentence of sentences) {
    if (HISTORY_ONLY.test(sentence) && !BUSINESS_HINT.test(sentence)) continue;
    // 주어가 "동사(同社)"면 등기부 말투다 — 문장에서 뺀다(뒤 문장이 회사를 이미 특정한다).
    const cleaned = sentence.replace(/^동사(는|의|가)\s*/, "").replace(/동사/g, "이 회사");
    kept.push(toPoliteEnding(cleaned));
    if (kept.length >= MAX_SENTENCES) break;
  }

  let text = kept.join(" ");
  while (text.length > MAX_CHARS && kept.length > 1) {
    kept.pop();
    text = kept.join(" ");
  }

  return {
    text,
    raw: source,
    trimmed: text.replace(/\s+/g, "") !== source.replace(/\s+/g, ""),
  };
}
