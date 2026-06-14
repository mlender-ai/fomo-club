/**
 * LLM 응답(JSON) 파서 — 순수. 코드펜스/잡텍스트 허용. 검증·grounding 은 assemble 이 한다.
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

/** content → RawThemeInsight. 파싱 불가 시 null(호출부가 정직한 빈 상태로). */
export function parseThemeInsightResponse(content: string): RawThemeInsight | null {
  if (!content) return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
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
