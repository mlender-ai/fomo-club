import { THEME_DICTIONARY } from "../keyword-cards/extract";
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

/** 카테고리·일반명사 토큰(종목명 아님). "반도체 부품"·"기술주"·"지주사" 등. */
// 주의: "한미반도체" 같은 실제 종목이 안 걸리게 어미 앵커(반도체$/메모리$) 안 씀.
// standalone "반도체"·"메모리"는 아래 CATEGORY 정확매칭이 잡는다.
const GENERIC_TERM =
  /(부품|소재|장비주|기술주|지주사|대형주|중소형주|성장주|가치주|배당주|섹터|업종|관련주|테마주|수혜주|대장주)/;

/**
 * 연관주 후보가 *진짜 종목*처럼 보이나(v1.1). LLM 이 stocks 에 카테고리어("미국 AI주", "반도체 부품")를
 * 섞어 넣어 발굴 가치 없는 게 뽑히던 문제 보정. 휴리스틱(보수적 — 애매하면 제외).
 */
function isLikelyStock(name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  if (/(주|株)$/.test(n)) return false; // "미국 AI주", "중국 기술주", "반도체주" — 카테고리
  if (GENERIC_TERM.test(n)) return false; // 부품/기술주/지주사 등
  // 지역+카테고리 ("미국 AI주", "중국 기술주") — 종목명에 지역 수식어가 붙지 않는다.
  if (/\s/.test(n) && /(미국|중국|국내|글로벌|해외|아시아)/.test(n)) return false;
  // 테마/카테고리 일반명사 자체.
  const CATEGORY = new Set(["반도체", "메모리", "반도체부품", "AI반도체", "메모리반도체", "코인", "금리", "2차전지", "바이오", "방산", "원자력", "공급망", "AI"]);
  if (CATEGORY.has(norm(n))) return false;
  return true;
}

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
    const ns = norm(stock);
    if (!ns || majors.has(ns) || seen.has(ns)) continue; // 의외성: 대장주·중복 제외
    if (!isLikelyStock(stock)) continue; // v1.1: 카테고리어("미국 AI주"·"반도체 부품") 제외
    // 연관 근거(grounding): 이 종목을 *언급한* grounded 근거를 찾는다. 없으면 폐기.
    const hit = evidence.find(({ e }) => norm(e.claim).includes(ns));
    if (!hit) continue;
    seen.add(ns);
    out.push({ stock, reason: hit.e.claim, sourceId: hit.e.sourceId, side: hit.side });
    if (out.length >= max) break;
  }
  return out;
}
