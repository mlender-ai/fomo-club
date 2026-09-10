import type { SourceChunk } from "@fomo/core";
import { chunkDocument, budgetChunks } from "../business-context/chunk";
import { INCORPORATED_BY_REFERENCE_REASON, fetchRiskFactorsSection } from "../business-context/sec-filing";
import { fetchCorpCodeMap } from "../fundamentals/dart-discovery";
import { fetchKrRiskSections } from "./dart-risk-section";
import { RISK_PROMPT_CHARS, synthesizeSymbolRisk } from "./synthesize";
import { riskPromptOf } from "@fomo/core";
import { writeSymbolRisk, type SymbolRiskRecord } from "./repository";

/**
 * 종목 고유 리스크 배치 (WO-SUB-06.5 합성 파이프라인).
 *
 * 소스 → 청크 → 합성 → 검증 → 저장. 화면은 저장분만 읽는다(INV-14).
 *
 * ## 소스는 시장별로 다르다
 *
 * | 시장 | 소스 | 실측 |
 * |---|---|---|
 * | US | 10-K **Item 1A Risk Factors** | 20종목 중 17 추출 · 참조편입 2 · 기타 1 |
 * | KR | 사업보고서 **위험관리 및 파생거래**(금융업은 `재무건전성`) + 주석 재무위험관리 | 6/6 |
 *
 * KR 위험 절은 성격이 US 와 달라(관리 방침·파생 현황 쪽) `section` 라벨이 붙어 온다.
 * 주석(`financial`)은 회계 정책 서술이라 **사업 위험(`business`)을 앞에 둔다** — 청크 예산이
 * 앞에서부터 채워지므로 순서가 곧 우선순위다.
 */

/** 종목당 한 번에 넣을 청크 예산. `RISK_PROMPT_CHARS` 와 짝이다. */
const CHUNK_BUDGET = RISK_PROMPT_CHARS;

export interface BuildSymbolRiskTarget {
  canonical: string;
  market: string;
  /** US: SEC CIK. 없으면 US 소스를 시도하지 않는다. */
  cik?: string | undefined;
  /** KR: 종목코드(6자리). corp_code 는 여기서 매핑한다. */
  stockCode?: string | undefined;
}

export interface BuildSymbolRiskOutcome {
  canonical: string;
  market: string;
  stored: boolean;
  items: number;
  unavailable_reason: string | null;
  errors: string[];
}

interface SourceResult {
  chunks: SourceChunk[];
  asOf: string;
  docIds: string[];
  unavailableReason: string | null;
}

async function usSource(canonical: string, cik: string): Promise<SourceResult> {
  const section = await fetchRiskFactorsSection(canonical, cik);
  if (!section.text || !section.document) {
    // 참조 편입은 "소스가 없다" 와 다른 상태다 — 사유를 그대로 올려 화면이 구분할 수 있게 한다.
    const referenced = section.errors.some((error) => error.includes(INCORPORATED_BY_REFERENCE_REASON));
    return {
      chunks: [],
      asOf: "",
      docIds: [],
      unavailableReason: referenced ? INCORPORATED_BY_REFERENCE_REASON : (section.errors[0] ?? "Item 1A 추출 실패"),
    };
  }
  const chunks = chunkDocument(section.document.doc_id, "disclosure", section.text);
  return {
    chunks: budgetChunks(chunks, CHUNK_BUDGET).used,
    asOf: section.document.as_of ?? "",
    docIds: [section.document.doc_id],
    unavailableReason: null,
  };
}

async function krSource(canonical: string, stockCode: string, apiKey: string): Promise<SourceResult> {
  const map = await fetchCorpCodeMap(`risk:${canonical}`).catch(() => null);
  const corpCode = map?.byStockCode.get(stockCode);
  if (!corpCode) return { chunks: [], asOf: "", docIds: [], unavailableReason: "DART corp_code 매핑 없음" };

  const result = await fetchKrRiskSections(canonical, corpCode, apiKey);
  if (result.sections.length === 0 || !result.document) {
    return { chunks: [], asOf: "", docIds: [], unavailableReason: result.errors[0] ?? "KR 위험 절 미발견" };
  }
  // business 를 앞에 둔다 — 예산이 앞에서부터 차므로 순서가 우선순위다.
  const ordered = [...result.sections].sort((a, b) => (a.section === "business" ? -1 : b.section === "business" ? 1 : 0));
  const chunks = ordered.flatMap((section, index) =>
    chunkDocument(`${result.document!.doc_id}:${section.section}${index}`, "disclosure", section.text)
  );
  return {
    chunks: budgetChunks(chunks, CHUNK_BUDGET).used,
    asOf: result.document.as_of ?? "",
    docIds: [result.document.doc_id],
    unavailableReason: null,
  };
}

/**
 * 종목 하나 처리.
 *
 * 실패해도 **레코드를 쓴다.** 사유가 담긴 레코드가 있어야 화면이 "확보하지 못함" 을 말할 수 있고,
 * 운영이 왜 못 했는지 사후에 볼 수 있다. 레코드를 안 쓰면 다음 실행이 같은 실패를 반복한다.
 */
export async function buildSymbolRisk(target: BuildSymbolRiskTarget): Promise<BuildSymbolRiskOutcome> {
  const errors: string[] = [];
  const dartKey = process.env["DART_API_KEY"]?.trim() ?? "";

  let source: SourceResult;
  if (target.market === "US") {
    source = target.cik
      ? await usSource(target.canonical, target.cik)
      : { chunks: [], asOf: "", docIds: [], unavailableReason: "SEC CIK 없음" };
  } else if (target.market === "KR") {
    source = target.stockCode
      ? dartKey
        ? await krSource(target.canonical, target.stockCode, dartKey)
        : { chunks: [], asOf: "", docIds: [], unavailableReason: "DART_API_KEY 없음" }
      : { chunks: [], asOf: "", docIds: [], unavailableReason: "종목코드 없음" };
  } else {
    // 코인은 공시가 없다 — 시도하지 않는다는 사실을 사유로 남긴다.
    source = { chunks: [], asOf: "", docIds: [], unavailableReason: `${target.market} 은 공시 위험요소 소스가 없음` };
  }

  const synthesis = await synthesizeSymbolRisk({
    chunks: source.chunks,
    asOf: source.asOf,
    sourceKind: "filing",
    unavailableReason: source.unavailableReason,
  });
  errors.push(...synthesis.errors);

  const record: SymbolRiskRecord = {
    canonical: target.canonical,
    market: target.market,
    items: synthesis.block.items,
    unavailable_reason: synthesis.block.unavailable_reason,
    source_doc_ids: source.docIds,
    synthesized_at: new Date().toISOString(),
    prompt_id: synthesis.promptId,
    prompt_hash: riskPromptOf(synthesis.promptId).hash,
    model: synthesis.model,
  };
  await writeSymbolRisk(record);

  return {
    canonical: target.canonical,
    market: target.market,
    stored: true,
    items: record.items.length,
    unavailable_reason: record.unavailable_reason,
    errors,
  };
}
