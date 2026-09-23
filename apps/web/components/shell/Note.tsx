/**
 * 연구 노트 본문을 그린다 (UI-02 E · UI-03).
 *
 * 노트는 마크다운 파일이 정본이다. **라이브러리를 들이지 않고** 노트가 실제로 쓰는
 * 것만 그린다: 문단 · 인용(`>`) · 코드 블록(```) · 목록(`-`) · **굵게** · `코드` ·
 * `[[02]]` 연구 링크.
 *
 * `dangerouslySetInnerHTML` 을 쓰지 않는다. 문자열을 React 노드로 쪼갠다 — 노트는
 * 사람이 쓰는 파일이고, 파일에 든 것은 명령이 아니라 데이터다.
 */
import Link from "next/link";
import type { ReactNode } from "react";

/** 한 줄 안의 강조·코드·연구 링크. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\[\d{2}\]\])/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else {
      const no = tok.slice(2, -2);
      out.push(
        <Link key={k} href={`/research/${no}`}>
          연구 {no}
        </Link>
      );
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Note({ text }: { text: string | null }) {
  if (!text) return null;
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let n = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={`b${n++}`} className="sh-note-pre">
          {body.join("\n")}
        </pre>
      );
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        body.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      const k = `b${n++}`;
      blocks.push(
        <blockquote key={k} className="sh-note-quote">
          {inline(body.join(" "), k)}
        </blockquote>
      );
      continue;
    }
    if (/^\s*-\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*-\s/, ""));
        i += 1;
      }
      const k = `b${n++}`;
      blocks.push(
        <ul key={k} className="sh-note-list">
          {items.map((it, j) => (
            <li key={`${k}-${j}`}>{inline(it, `${k}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !(lines[i] ?? "").startsWith(">") &&
      !(lines[i] ?? "").trim().startsWith("```") &&
      !/^\s*-\s/.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    const k = `b${n++}`;
    blocks.push(
      <p key={k} className="sh-note-p">
        {inline(para.join(" "), k)}
      </p>
    );
  }

  return <div className="sh-note-body">{blocks}</div>;
}
