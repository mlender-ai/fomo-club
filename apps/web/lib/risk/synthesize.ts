import { isAiConfigured } from "@fomo/shared";
import {
  buildSymbolRiskBlock,
  riskPromptOf,
  type SourceChunk,
  type SymbolRiskBlock,
  type SymbolRiskCandidate,
  type SymbolRiskSourceKind,
} from "@fomo/core";
import { callWithRetry, parseJsonObject, verifySentence } from "../business-context/synthesize";

/**
 * 종목 고유 리스크 합성 (WO-SUB-06 §5-2 처리 2·4).
 *
 * ## 재사용하는 것 / 새로 만드는 것
 *
 * **재사용**: 페이싱·쿼터 감지·재시도(`callWithRetry`)와 근거 검증(`verifySentence`).
 *  · 페이싱 상태를 공유해야 한다 — 배치마다 따로 두면 둘이 각자 분당 여유가 있다고 판단해
 *    합산 TPM 을 넘긴다(골든셋 1차에서 22종목을 429 로 잃은 형태).
 *  · 검증기는 §5-2 가 "WO-SUB-03 과 동일한 근거 검증 패스" 를 요구하므로 같은 것을 쓴다.
 *    두 벌 두면 판정 기준이 갈린다.
 *
 * **새로 만드는 것**: 합성 프롬프트(`risk/synthesize.v1`)와 후보 파싱뿐이다.
 *
 * ## 검증만으로 부족한 이유
 *
 * 검증 패스는 "이 사실이 청크에 있나" 만 판정하므로 **인과 단정을 구조적으로 통과시킨다**
 * (두 사실이 각각 청크에 있으면 지지된다고 본다 — WO-SUB-03 실측). 보일러플레이트도 청크에
 * 실재하므로 통과한다. 그래서 검증 뒤에 `buildSymbolRiskBlock` 의 정규식·사전 게이트를 반드시
 * 통과시킨다. 두 게이트는 다른 실패를 담당한다.
 */

export const RISK_SYNTHESIZE_PROMPT_ID = "synthesize.v1";
/** 온도 0 — §5-2 처리 2 "LLM 배치, 온도 0". 같은 입력에 같은 출력을 요구한다. */
const TEMPERATURE = 0;
const MAX_TOKENS = 700;
const TIMEOUT_MS = 30_000;

/**
 * LLM 입력 상한.
 *
 * WO-SUB-03 이 3,500자로 내린 뒤 그 값이 청크의 중위 89% 를 버린다는 실측이 나왔다(잠정값).
 * 위험 섹션은 사업 섹션보다 훨씬 길다(실측: Item 1A 최대 199,156자 · KR 위험절 최대 23,161자).
 * 여기서 같은 3,500자를 쓰면 위험요소의 앞부분(보통 목차성 서문)만 보게 된다.
 *
 * 그래서 **6,000자**로 둔다 — 종목당 1콜 기준 TPM 안에 들어오는 범위에서 사업 섹션보다 넓게
 * 본다. 이 값도 잠정이고, 골든셋 실측으로 조정한다. env 오버라이드를 둔 이유는 코드 수정 없이
 * 같은 커밋으로 두 조건을 돌리기 위함이다(WO-SUB-03 선례).
 */
export const RISK_PROMPT_CHARS = ((): number => {
  const override = Number.parseInt(process.env["RISK_PROMPT_CHARS_OVERRIDE"] ?? "", 10);
  return Number.isFinite(override) && override > 0 ? override : 6_000;
})();

interface RawRisk {
  text?: unknown;
  source_ids?: unknown;
}

function parseCandidates(content: string, validIds: ReadonlySet<string>, errors: string[]): SymbolRiskCandidate[] {
  const parsed = parseJsonObject(content);
  if (!parsed) {
    errors.push("risk: 합성 응답 JSON 파싱 실패");
    return [];
  }
  const raw = Array.isArray(parsed.risks) ? (parsed.risks as RawRisk[]) : null;
  if (!raw) {
    errors.push("risk: 응답에 risks 배열이 없음");
    return [];
  }
  const out: SymbolRiskCandidate[] = [];
  for (const entry of raw) {
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    const ids = Array.isArray(entry.source_ids) ? entry.source_ids.filter((id): id is string => typeof id === "string") : [];
    if (!text) continue;
    // **존재하지 않는 청크 id 는 버린다** — 환각 인용이다. 걸러내지 않으면 출처가 있는 것처럼
    // 보이지만 그 청크는 없다(§4 규칙 1 이 조용히 깨진다).
    const known = ids.filter((id) => validIds.has(id));
    if (known.length !== ids.length) errors.push(`risk: 존재하지 않는 청크 인용 ${ids.length - known.length}건`);
    out.push({ text, source_ids: known, source_kind: "filing", as_of: "" });
  }
  return out;
}

export interface SynthesizeSymbolRiskInput {
  chunks: readonly SourceChunk[];
  /** 문서 기준일 — 후보의 `as_of` 가 된다. */
  asOf: string;
  sourceKind: SymbolRiskSourceKind;
  /** 소스 단계에서 이미 실패했으면 그 사유. 합성을 시도하지 않고 그대로 블록에 실린다. */
  unavailableReason?: string | null;
}

export interface SynthesizeSymbolRiskResult {
  block: SymbolRiskBlock;
  errors: string[];
  /** 실측 모델 — Groq 별칭은 롤링이라 응답이 준 값을 남긴다(WO-SUB-03.5 결정론 정책). */
  model: string | null;
  promptId: string;
}

/**
 * 청크 → 검증 통과한 종목 고유 리스크 블록.
 *
 * 실패는 정상 결과다. LLM 미설정·쿼터 소진·후보 0건·전량 탈락 모두 사유를 만들어 블록에 남긴다 —
 * "리스크 없음" 으로 저장되면 §10 실패 모드가 된다.
 */
export async function synthesizeSymbolRisk(input: SynthesizeSymbolRiskInput): Promise<SynthesizeSymbolRiskResult> {
  const errors: string[] = [];
  const promptId = RISK_SYNTHESIZE_PROMPT_ID;
  if (input.unavailableReason) {
    return { block: buildSymbolRiskBlock([], input.unavailableReason), errors, model: null, promptId };
  }
  if (!isAiConfigured()) {
    return { block: buildSymbolRiskBlock([], "LLM 미설정 — 합성 생략"), errors, model: null, promptId };
  }
  if (input.chunks.length === 0) {
    return { block: buildSymbolRiskBlock([], "위험 섹션 청크 0건"), errors, model: null, promptId };
  }

  const prompt = riskPromptOf(promptId);
  const result = await callWithRetry({
    messages: [
      { role: "system", content: prompt.text },
      {
        role: "user",
        content: JSON.stringify({
          chunks: input.chunks.map((chunk) => ({ source_id: chunk.source_id, text: chunk.text })),
        }),
      },
    ],
    temperature: TEMPERATURE,
    jsonMode: true,
    maxTokens: MAX_TOKENS,
    timeoutMs: TIMEOUT_MS,
    trace: "risk-synthesis",
  });

  if (!result.ok) {
    const reason = result.errorBody?.includes("per day") ? "일일 쿼터 소진 — 합성 미완" : `합성 호출 실패(HTTP ${result.status})`;
    errors.push(`risk: ${reason}`);
    return { block: buildSymbolRiskBlock([], reason), errors, model: result.model || null, promptId };
  }

  const validIds = new Set(input.chunks.map((chunk) => chunk.source_id));
  const candidates = parseCandidates(result.content, validIds, errors);

  // 검증은 후보마다 별도 호출이다 — 자가 검증이 아니다(WO-SUB-03 §4-5).
  const verified: SymbolRiskCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.source_ids.length === 0) {
      errors.push("risk: 인용 없는 후보 — 검증 생략 후 폐기");
      continue;
    }
    const cited = input.chunks.filter((chunk) => candidate.source_ids.includes(chunk.source_id));
    const outcome = await verifySentence(candidate.text, cited);
    if (!outcome.supported) {
      errors.push(outcome.inconclusive ? "risk: 검증 판정 불가 — 폐기" : "risk: 근거 미지지 — 폐기");
      continue;
    }
    verified.push({ ...candidate, source_kind: input.sourceKind, as_of: input.asOf });
  }

  // 검증을 통과해도 규칙 게이트를 통과해야 한다(인과 단정·보일러플레이트는 검증이 못 잡는다).
  const block = buildSymbolRiskBlock(verified, candidates.length === 0 ? "합성이 후보를 내지 못함" : null);
  return { block, errors, model: result.model || null, promptId };
}
