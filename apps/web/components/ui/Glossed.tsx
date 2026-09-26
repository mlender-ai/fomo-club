/**
 * 용어 설명이 달린 글 (UI-06 B-5 — 호버 설명).
 *
 * 설명 있는 용어만 `<abbr title>` 로 감싼다 — 데스크톱은 호버, 폰은 길게 눌러 본다. 점선 밑줄이
 * "설명이 있다" 는 표시다.
 */
import { GLOSSARY, withGlossary } from "../../lib/lab/labels";

export function Glossed({ text }: { text: string }) {
  return (
    <>
      {withGlossary(text).map(([part, tip], i) =>
        tip ? (
          <abbr key={i} className="ui-term" title={tip}>
            {part}
          </abbr>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/** 글 안에 나온 용어와 설명 — ⓘ 시트가 쓴다(폰은 호버가 없다). */
export function termsIn(texts: string[]): [string, string][] {
  const found = new Set<string>();
  for (const t of texts) for (const [part, tip] of withGlossary(t)) if (tip) found.add(part);
  return [...found].map((k) => [k, GLOSSARY[k] as string]);
}
