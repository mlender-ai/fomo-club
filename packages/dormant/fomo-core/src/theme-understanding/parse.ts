/**
 * LLM 응답(JSON) 파서 — 순수. 코드펜스/잡텍스트/흔한 깨짐 허용. 검증·grounding 은 assemble 이 한다.
 */

export interface RawEvidence {
  claim: string;
  sourceId: string;
  quote: string;
}
export interface RawWording {
  text: string;
  sourceId: string;
}
export interface RawThemeInsight {
  stocks: string[];
  bull: RawEvidence[];
  bear: RawEvidence[];
  wordings: RawWording[];
  stanceNote: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}
function evidenceArr(v: unknown): RawEvidence[] {
  if (!Array.isArray(v)) return [];
  const out: RawEvidence[] = [];
  for (const r of v) {
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      const claim = str(o.claim);
      const sourceId = str(o.sourceId);
      const quote = str(o.quote);
      if (claim && sourceId) out.push({ claim, sourceId, quote });
    }
  }
  return out;
}
function wordingArr(v: unknown): RawWording[] {
  if (!Array.isArray(v)) return [];
  const out: RawWording[] = [];
  for (const r of v) {
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      const text = str(o.text);
      const sourceId = str(o.sourceId);
      if (text && sourceId) out.push({ text, sourceId });
    }
  }
  return out;
}

// 문자열 내 raw 제어문자(줄바꿈·탭 등)는 JSON.parse 를 깨뜨린다 → 공백으로. (리터럴 제어문자 회피 위해 new RegExp 사용)
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F]+", "g");

/**
 * 흔한 LLM JSON 깨짐을 복구해 파싱. 바닐라 → 실패 시 정리 후 재시도.
 * 코드펜스·스마트따옴표·trailing comma·문자열 내 raw 제어문자가 원인(바이오 등 "파싱 실패" 사고).
 */
function parseLenient(slice: string): unknown | null {
  try {
    return JSON.parse(slice);
  } catch {
    // 무시 — 아래에서 정리 후 재시도
  }
  const fixed = slice
    .replace(/```(?:json)?/gi, "") // 코드펜스 잔재
    .replace(/[“”]/g, '"') // 스마트 더블쿼트 → "
    .replace(/[‘’]/g, "'") // 스마트 싱글쿼트 → '
    .replace(/,(\s*[}\]])/g, "$1") // trailing comma
    .replace(CONTROL_CHARS, " "); // 제어문자 → 공백
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

/** content → RawThemeInsight. 파싱 불가 시 null(호출부가 정직한 빈 상태로). */
export function parseThemeInsightResponse(content: string): RawThemeInsight | null {
  if (!content) return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const obj = parseLenient(content.slice(start, end + 1));
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  return {
    stocks: strArr(o.stocks),
    bull: evidenceArr(o.bull),
    bear: evidenceArr(o.bear),
    wordings: wordingArr(o.wordings),
    stanceNote: str(o.stanceNote),
  };
}
