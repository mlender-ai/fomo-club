import type { BusinessSourceKind, SourceChunk } from "@fomo/core";

/**
 * 청킹 + `source_id` 인덱싱 (WO-SUB-03 §4-3).
 *
 * 청크 단위는 **문단**이다. 각 청크는 `{doc_id}#{chunk_index}` 를 갖고, 원문을 그대로 보관한다 —
 * 근거 검증 패스가 원문을 대조해야 하고, 사용자에게 근거를 보여줄 때도 이 텍스트를 쓴다.
 *
 * 문단이 너무 짧으면(머리글·표 파편) 합성에 쓸모가 없고 인용 대상으로도 부적절하다.
 * 너무 길면 검증 패스가 "이 문장이 어디서 나왔는지"를 좁힐 수 없다 — 그래서 상한에서 자른다.
 */

/** 이 미만 문단은 버린다(섹션 제목·페이지 번호·표 파편). */
const MIN_CHUNK_CHARS = 120;
/** 이 초과 문단은 문장 경계에서 나눈다. */
const MAX_CHUNK_CHARS = 1_400;

/** 문장 경계에서 자르되, 경계를 못 찾으면 상한에서 그냥 자른다(무한 루프 방지). */
function splitLong(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHUNK_CHARS) {
    const window = rest.slice(0, MAX_CHUNK_CHARS);
    const boundary = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"), window.lastIndexOf("다. "));
    const cut = boundary > MAX_CHUNK_CHARS * 0.5 ? boundary + 1 : MAX_CHUNK_CHARS;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * 원문 → 청크 목록. 인덱스는 **버린 문단을 세지 않는다** — 인덱스가 곧 `source_id` 이므로
 * 같은 입력이면 같은 id 가 나와야 한다(결정론).
 */
export function chunkDocument(docId: string, kind: BusinessSourceKind, text: string): SourceChunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= MIN_CHUNK_CHARS);

  const chunks: SourceChunk[] = [];
  for (const paragraph of paragraphs) {
    for (const piece of splitLong(paragraph)) {
      if (piece.length < MIN_CHUNK_CHARS) continue;
      chunks.push({
        source_id: `${docId}#${chunks.length}`,
        doc_id: docId,
        chunk_index: chunks.length,
        kind,
        text: piece,
      });
    }
  }
  return chunks;
}

/**
 * 문단 구조가 없는 짧은 원문(벤더 요약 3문장 등)용 — 문장 단위로 나눈다.
 * 최소 길이 기준을 낮춘다. 이 소스는 원래 짧고, 그게 사실이다.
 */
export function chunkShortText(docId: string, kind: BusinessSourceKind, sentences: readonly string[]): SourceChunk[] {
  return sentences
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 20)
    .map((sentence, index) => ({
      source_id: `${docId}#${index}`,
      doc_id: docId,
      chunk_index: index,
      kind,
      text: sentence,
    }));
}

/** LLM 입력 예산에 맞춰 청크를 자른다. 잘린 개수를 돌려줘 조용한 truncation 을 막는다. */
export function budgetChunks(chunks: readonly SourceChunk[], maxChars: number): { used: SourceChunk[]; dropped: number } {
  const used: SourceChunk[] = [];
  let total = 0;
  for (const chunk of chunks) {
    if (total + chunk.text.length > maxChars) break;
    used.push(chunk);
    total += chunk.text.length;
  }
  return { used, dropped: chunks.length - used.length };
}
