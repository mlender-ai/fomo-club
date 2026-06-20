import { THEME_DICTIONARY } from "../keyword-cards/extract";
import { resolveStock } from "../keyword-cards/stocks";
import type { ThemeInsight } from "./types";

/**
 * 발굴 엔진(연관 확산) — BM_STRATEGY 구멍1 1차. 순수(네트워크/LLM 0).
 *
 * understandTheme 출력 *위에서만* 가공한다(추가 LLM 호출 없음 — 토큰 절약).
 * 고르는 기준 = **연관 ∩ 의외성**:
 *  - 연관: 테마 원문의 grounded 근거에 함께 등장한 종목(맥락 안 — 생뚱맞은 섹터 금지).
 *  - 의외성: 대장주(테마 사전 related = 다 아는 것)는 제외 → "덜 알려진 수혜주".
 *  - 연관 근거 필수(grounding): "왜 연관인지"가 grounded 근거(claim)에 있어야 한다. 없으면 폐기(환각 금지).
 * 데이터 부족하면 빈 배열(가짜로 안 채움). 같은 insight → 같은 결과(결정성).
 */
export interface RelatedStock {
  /** 발굴된 연관주명. */
  stock: string;
  /** 왜 연관인지 — grounded 근거 claim 그대로(원문에 박힘). */
  reason: string;
  /** 근거 출처(SourceDoc.id). */
  sourceId: string;
  /** 어느 관점 근거에서 나왔나. */
  side: "bull" | "bear";
}

const norm = (s: string) => s.replace(/\s+/g, "");

export function discoverRelatedStocks(insight: ThemeInsight, opts: { max?: number } = {}): RelatedStock[] {
  const max = opts.max ?? 2;
  // 대장주(다 아는 것) = 테마 사전 related + 테마명. 의외성을 위해 후보에서 제외.
  const majors = new Set(
    [...(THEME_DICTIONARY[insight.theme]?.related ?? []), insight.theme].map(norm)
  );
  const evidence = [
    ...insight.bull.map((e) => ({ e, side: "bull" as const })),
    ...insight.bear.map((e) => ({ e, side: "bear" as const })),
  ];

  const out: RelatedStock[] = [];
  const seen = new Set<string>();
  for (const stock of insight.stocks) {
    // ★ 종목 검증 게이트: 실제 상장 종목(티커 보유)으로 해석돼야 한다.
    // "MLCC·HBM·온디바이스AI" 등 부품·기술·소재어는 vocab 에 없어 null → 폐기(가짜 종목 노출 금지).
    const def = resolveStock(stock);
    if (!def) continue;
    const canonical = def.canonical; // 별칭(하이닉스 등) → 표준명으로 정규화
    const ns = norm(canonical);
    if (majors.has(ns) || seen.has(ns)) continue; // 의외성: 대장주·중복 제외
    // 연관 근거(grounding): 이 종목을 *언급한* grounded 근거를 찾는다(후보명 또는 표준명). 없으면 폐기.
    const nStock = norm(stock);
    const hit = evidence.find(({ e }) => {
      const c = norm(e.claim);
      return c.includes(nStock) || c.includes(ns);
    });
    if (!hit) continue;
    seen.add(ns);
    out.push({ stock: canonical, reason: hit.e.claim, sourceId: hit.e.sourceId, side: hit.side });
    if (out.length >= max) break;
  }
  return out;
}
