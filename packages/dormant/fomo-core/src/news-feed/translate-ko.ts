import type { RawArticle } from "./types";

/**
 * 영문 기사 → 한국어 번역 헬퍼(순수부). docs/PIVOT_FEED_FIRST.md.
 *
 * 실제 LLM 호출은 apps/web 이 담당하고, 프롬프트 빌드/응답 파싱/적용은 여기서 테스트 보장.
 * 번역은 title/summary 원문은 두고 titleKo/summaryKo 자리에만 채운다(localizeArticle 가 선택).
 * 실패 시 원문(영문) 폴백 — 빈 화면/깨진 카드 금지.
 */

export interface KoTranslation {
  id: string;
  titleKo: string;
  summaryKo?: string;
}

/** 번역 대상(영문 기사) → LLM 프롬프트. JSON in/out 으로 매칭을 안정화. */
export function buildKoTranslationPrompt(
  items: { id: string; title: string; summary?: string }[]
): string {
  const payload = items.map((a) => ({ id: a.id, title: a.title, summary: a.summary ?? "" }));
  return [
    "다음 영문 금융 뉴스 제목과 요약을 자연스러운 한국어로 번역해줘.",
    "- 사실 그대로, 과장/투자권유 없이 담담하게.",
    "- 고유명사(종목명/인명/티커)는 한국에서 통용되는 표기를 쓰되 모르면 원문 유지.",
    "- 입력 JSON 배열의 각 항목에 대해 같은 id로 매핑.",
    '- 반드시 JSON 배열만 출력: [{"id","titleKo","summaryKo"}]. 다른 텍스트 금지.',
    "",
    JSON.stringify(payload),
  ].join("\n");
}

/** LLM 응답 문자열 → KoTranslation[]. 코드펜스/잡텍스트 섞여도 첫 JSON 배열을 견고하게 추출. */
export function parseKoTranslations(content: string): KoTranslation[] {
  if (!content) return [];
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(content.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: KoTranslation[] = [];
  for (const r of arr) {
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : null;
      const titleKo = typeof o.titleKo === "string" ? o.titleKo.trim() : "";
      if (id && titleKo) {
        out.push({
          id,
          titleKo,
          ...(typeof o.summaryKo === "string" && o.summaryKo.trim()
            ? { summaryKo: o.summaryKo.trim() }
            : {}),
        });
      }
    }
  }
  return out;
}

/** 번역 결과를 기사에 적용 — id 매칭으로 titleKo/summaryKo 채움. 원문은 보존. */
export function applyKoTranslations<T extends RawArticle>(
  articles: T[],
  translations: KoTranslation[]
): T[] {
  if (translations.length === 0) return articles;
  const byId = new Map(translations.map((t) => [t.id, t]));
  return articles.map((a) => {
    const t = byId.get(a.id);
    if (!t) return a;
    return {
      ...a,
      titleKo: t.titleKo,
      ...(t.summaryKo ? { summaryKo: t.summaryKo } : {}),
    };
  });
}
