import { describe, it, expect } from "vitest";
import { decodeHtmlEntities, stripWrappingQuotes, cleanText, cleanQuote } from "../src/sanitize";

describe("decodeHtmlEntities", () => {
  it("named 엔티티를 디코드한다", () => {
    expect(decodeHtmlEntities("그가 &quot;사자&quot; 라고 했다")).toBe('그가 "사자" 라고 했다');
    expect(decodeHtmlEntities("A &amp; B &lt;tag&gt;")).toBe("A & B <tag>");
    expect(decodeHtmlEntities("don&#39;t")).toBe("don't");
  });

  it("십진/십육진 숫자 엔티티를 디코드한다", () => {
    expect(decodeHtmlEntities("&#34;quote&#34;")).toBe('"quote"');
    expect(decodeHtmlEntities("&#x27;apos&#x27;")).toBe("'apos'");
  });

  it("&amp; 이중 디코드를 피한다", () => {
    // &amp;quot; 는 한 번만 풀려 &quot; 가 아니라 그대로 '&quot;' 이어야 한다(원문 보존).
    expect(decodeHtmlEntities("&amp;quot;")).toBe('&quot;');
  });

  it("엔티티 없으면 원문 유지", () => {
    expect(decodeHtmlEntities("평범한 문장")).toBe("평범한 문장");
  });
});

describe("stripWrappingQuotes", () => {
  it("양끝 따옴표 한 겹을 벗긴다", () => {
    expect(stripWrappingQuotes('"국장 장투할거야?"')).toBe("국장 장투할거야?");
    expect(stripWrappingQuotes("'치고 빠질래'")).toBe("치고 빠질래");
  });

  it("중첩 따옴표를 모두 벗긴다 (버그 3-a)", () => {
    expect(stripWrappingQuotes('""국장 장투할거야? 난 치고 빠질래""')).toBe(
      "국장 장투할거야? 난 치고 빠질래"
    );
    expect(stripWrappingQuotes("“‘섞인 따옴표’”")).toBe("섞인 따옴표");
  });

  it("짝이 안 맞으면 벗기지 않는다", () => {
    expect(stripWrappingQuotes('"열린 따옴표만')).toBe('"열린 따옴표만');
    expect(stripWrappingQuotes("중간에 \"따옴표\" 있는 문장")).toBe('중간에 "따옴표" 있는 문장');
  });

  it("빈 문자열·따옴표만 있는 경우 안전", () => {
    expect(stripWrappingQuotes("")).toBe("");
    expect(stripWrappingQuotes('""')).toBe("");
  });
});

describe("cleanText / cleanQuote", () => {
  it("cleanText: 엔티티 디코드 + 트림, 따옴표는 보존", () => {
    expect(cleanText('  그가 &quot;말&quot;했다  ')).toBe('그가 "말"했다');
    expect(cleanText(null)).toBe("");
    expect(cleanText(undefined)).toBe("");
  });

  it("cleanQuote: 디코드 후 감싼 따옴표까지 제거 (화면이 다시 입힘)", () => {
    // &quot; 로 감싸인 원문 → 디코드하면 "…" → 다시 한 겹 벗겨 알맹이만
    expect(cleanQuote("&quot;난 치고 빠질래&quot;")).toBe("난 치고 빠질래");
    expect(cleanQuote('""국장 장투할거야?""')).toBe("국장 장투할거야?");
    expect(cleanQuote(null)).toBe("");
  });

  it("cleanQuote: 따옴표 없는 평문은 그대로", () => {
    expect(cleanQuote("그냥 한 말")).toBe("그냥 한 말");
  });
});
