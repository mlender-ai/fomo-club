import { createHash } from "node:crypto";
import {
  buildSlot3,
  computeBadge,
  contextViolations,
  promptOf,
  type BusinessContext,
  type SourceChunk,
  type SourceDocument,
  type VariableObservation,
} from "@fomo/core";
import { classifyArchetype } from "@fomo/core";
import { readFactSheet } from "../fundamentals/repository";
import { fetchNaverFundamentals } from "../fundamentals/naver-fundamentals";
import { loadCikMap } from "../fundamentals/sec-xbrl";
import type { UniverseEntry } from "../fundamentals/universe";
import { budgetChunks, chunkDocument, chunkShortText } from "./chunk";
import { fetchBusinessSection, SECTION_PROMPT_CHARS } from "./sec-filing";
import { synthesizeSlots, verifiedSentence, SYNTHESIZE_PROMPT_ID, VERIFY_PROMPT_ID } from "./synthesize";

/**
 * 사업 실체 3슬롯 조립 (WO-SUB-03 §4).
 *
 * ```
 * 소스 수집 → 섹션 추출 → 청킹 → 합성(슬롯1·2) → 근거 검증 → 슬롯3 결합 → 배지 → 저장
 * ```
 *
 * ## KR 소스 정책 (설계상 중요)
 *
 * 지시서 §3-2 는 슬롯 1·2 의 소스를 **공시 문서로 한정**한다(사업보고서 "사업의 내용").
 * 그 경로는 **DART 이며 우리는 아직 키가 없다**(WO-SUB-01·02 에서 확인). 그래서 KR 은 현재
 * 네이버 `corporationSummary`(벤더 편집 3문장)를 쓴다.
 *
 * 이건 공시가 아니다. 그래서 **숨기지 않고 라벨한다** — `kind: "vendor_summary"` 로 저장하고,
 * 공시 근거가 없으면 배지에서 `충분` 을 주지 않는다(`badge.ts`). 배치 규칙 6("소스 종류 분리")은
 * 섞지 말라는 것이고, 우리는 섞지 않고 구분해 표기한다. DART 가 열리면 KR 도 `disclosure` 로 올라간다.
 */

/**
 * LLM 입력 해시(WO-SUB-03.5 PART C-2 불변성 키) — 합성에 **실제로 들어간 것**만 넣는다.
 * 프롬프트 버전·문서 해시로는 청크 예산/선택 변경을 못 잡는다(3,500자 → 24,000자 같은 변경).
 */
function computeInputHash(input: {
  canonical: string;
  archetype: string;
  revenueSummary: string;
  chunks: readonly { source_id: string; text: string }[];
}): string {
  const payload = [
    input.canonical,
    input.archetype,
    input.revenueSummary,
    ...input.chunks.map((chunk) => `${chunk.source_id}:${chunk.text}`),
  ].join("\u001f");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/** LLM 에 넣을 청크 총 문자 예산. */
const CHUNK_BUDGET_CHARS = SECTION_PROMPT_CHARS;

function emptyContext(entry: UniverseEntry, errors: string[]): BusinessContext {
  return {
    canonical: entry.canonical,
    market: entry.country,
    synthesized_at: new Date().toISOString(),
    prompt_version: `${promptOf(SYNTHESIZE_PROMPT_ID).hash}+${promptOf(VERIFY_PROMPT_ID).hash}`,
    model: "",
    slot1_revenue_source: null,
    slot2_dependency: null,
    slot3_dependency_state: null,
    badge: "없음",
    insufficient_reason: errors[0] ?? "사업 정보를 확보하지 못했습니다.",
    documents: [],
    cited_chunks: [],
    errors,
  };
}

interface SourceBundle {
  documents: SourceDocument[];
  chunks: SourceChunk[];
  errors: string[];
  /** 섹션 추출 진단(US) — 실패율 분석용. */
  extraction: { item1Matches: number; item1aMatches: number; candidates: number; chosenChars: number | null } | null;
}

async function collectUs(entry: UniverseEntry): Promise<SourceBundle> {
  const symbol = entry.symbol?.trim().toUpperCase();
  if (!symbol) return { documents: [], chunks: [], errors: ["universe: 심볼 없음"], extraction: null };
  const { map, failed } = await loadCikMap();
  if (failed) return { documents: [], chunks: [], errors: ["sec: CIK 매핑 로드 실패 — 미확인"], extraction: null };
  const cik = map.get(symbol);
  if (!cik) return { documents: [], chunks: [], errors: [`sec: CIK 매핑 없음(${symbol})`], extraction: null };

  const section = await fetchBusinessSection(symbol, cik);
  if (!section.document || !section.text) {
    return { documents: [], chunks: [], errors: section.errors, extraction: section.diagnostics };
  }
  return {
    documents: [section.document],
    chunks: chunkDocument(section.document.doc_id, "disclosure", section.text),
    errors: section.errors,
    extraction: section.diagnostics,
  };
}

async function collectKr(entry: UniverseEntry): Promise<SourceBundle> {
  const code = entry.naverCode?.trim();
  if (!code) return { documents: [], chunks: [], errors: ["universe: 종목코드 없음"], extraction: null };
  // 5년 종가는 여기서 필요 없다 — 최근 창만 요청해 응답을 줄인다.
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const naver = await fetchNaverFundamentals(code, from);
  const sentences = naver.businessSummary;
  if (sentences.length === 0) {
    return { documents: [], chunks: [], errors: [...naver.errors, "naver: corporationSummary 없음"], extraction: null };
  }
  const text = sentences.join("\n");
  const document: SourceDocument = {
    doc_id: `naver:${code}:corporationSummary`,
    // 공시가 아니다 — 벤더 편집 요약임을 타입으로 못박는다.
    kind: "vendor_summary",
    source: "naver_corporation_summary",
    url: `https://m.stock.naver.com/api/stock/${code}/finance/quarter`,
    as_of: null,
    fetched_at: naver.fetchedAt,
    snapshot_hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
    chars: text.length,
  };
  return {
    documents: [document],
    chunks: chunkShortText(document.doc_id, "vendor_summary", sentences),
    errors: naver.errors,
    extraction: null,
  };
}

export interface BuildOptions {
  observations: Readonly<Record<string, VariableObservation | undefined>>;
}

/**
 * 종목 1개 사업 실체. 실패해도 **레코드는 만든다** — 배지 `없음` + 사유가 정직한 결과다.
 * 소스가 하나도 안 열리면 섹션을 표시하지 않고 "사업 정보를 확보하지 못했습니다"만 나간다(완료 조건 5).
 */
export async function buildBusinessContext(entry: UniverseEntry, options: BuildOptions): Promise<BusinessContext> {
  const bundle = entry.country === "US" ? await collectUs(entry) : await collectKr(entry);
  if (bundle.chunks.length === 0) return emptyContext(entry, bundle.errors);

  const errors = [...bundle.errors];
  const { used, dropped } = budgetChunks(bundle.chunks, CHUNK_BUDGET_CHARS);
  // 조용한 truncation 금지 — 몇 개를 뺐는지 남긴다.
  if (dropped > 0) errors.push(`chunk: 예산 초과로 ${dropped}개 제외(총 ${bundle.chunks.length}개)`);

  // 아키타입은 합성 프롬프트의 맥락 입력이다(팩트시트가 없으면 생략 — 합성을 막지는 않는다).
  const factsheet = await readFactSheet(entry.country, entry.canonical).catch(() => null);
  const archetype = factsheet ? classifyArchetype(factsheet.factsheet).code : "UNCLASSIFIED";
  const revenueTtm = factsheet?.factsheet.fiscal.ttm.revenue ?? null;
  const revenueSummary =
    revenueTtm !== null
      ? `TTM 매출 ${revenueTtm.toLocaleString("ko-KR")} ${factsheet?.factsheet.currency ?? ""}`
      : "매출 미확보";

  const inputHash = computeInputHash({
    canonical: entry.displayName || entry.canonical,
    archetype,
    revenueSummary,
    chunks: used,
  });

  const synthesis = await synthesizeSlots({
    canonical: entry.displayName || entry.canonical,
    archetype,
    chunks: used,
    revenueSummary,
  });
  errors.push(...synthesis.errors);

  const kind = bundle.chunks[0]!.kind;
  const slot1 = await verifiedSentence(synthesis.slot1, used, kind, errors, "slot1");
  const slot2 = await verifiedSentence(synthesis.slot2, used, kind, errors, "slot2");
  const slot3 = slot2 ? buildSlot3(slot2.text, options.observations) : null;

  const citedIds = new Set([...(slot1?.source_ids ?? []), ...(slot2?.source_ids ?? [])]);
  const context: BusinessContext = {
    canonical: entry.canonical,
    market: entry.country,
    synthesized_at: new Date().toISOString(),
    prompt_version: `${promptOf(SYNTHESIZE_PROMPT_ID).hash}+${promptOf(VERIFY_PROMPT_ID).hash}`,
    archetype,
    input_hash: inputHash,
    model: synthesis.model,
    slot1_revenue_source: slot1,
    slot2_dependency: slot2,
    slot3_dependency_state: slot3,
    badge: "없음",
    insufficient_reason: synthesis.insufficientReason,
    documents: bundle.documents,
    cited_chunks: bundle.chunks.filter((chunk) => citedIds.has(chunk.source_id)),
    errors,
  };

  // 금지 패턴(소재지·법인격·평가 형용사·인과)에 걸린 슬롯은 폐기한다 — 검증 패스가 잡지 못하는 실패다.
  for (const violation of contextViolations(context)) {
    errors.push(`${violation.slot}: 금지 패턴(${violation.rule}) "${violation.matched}" — 폐기`);
    if (violation.slot === "slot1") context.slot1_revenue_source = null;
    if (violation.slot === "slot2") {
      context.slot2_dependency = null;
      context.slot3_dependency_state = null;
    }
    if (violation.slot === "slot3") context.slot3_dependency_state = null;
  }

  context.badge = computeBadge(context);
  if (context.badge === "없음" && !context.insufficient_reason) {
    context.insufficient_reason = "근거를 갖춘 문장을 만들지 못했습니다.";
  }
  return context;
}
