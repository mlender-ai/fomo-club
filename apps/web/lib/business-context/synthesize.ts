import { callAI, isAiConfigured } from "@fomo/shared";
import { promptOf, sourcedSentence, type BusinessSourceKind, type SourceChunk, type SourcedSentence } from "@fomo/core";

/**
 * 합성 + 근거 검증 (WO-SUB-03 §4-4·§4-5).
 *
 * 두 호출은 **분리한다.** 같은 호출에서 자가 검증시키면 통과율이 거짓이 된다 —
 * 만든 모델이 자기 문장을 지지된다고 판정하는 것은 검증이 아니다.
 *
 * 온도 0, 프롬프트는 생성 번들에서 로드(본문 해시 기록), 동일 입력 → 동일 출력.
 */

const TEMPERATURE = 0;
/**
 * 호출 간 최소 간격(ms)과 429 재시도.
 *
 * 실측(골든셋 1차): 종목당 3콜(합성 1 + 검증 2)을 페이싱 없이 연속 발사해 **Groq 429 로 22종목이 실패**했다.
 * 파이프라인이 아니라 배치 잡의 결함이었다 — LLM 은 무료 티어의 분당 한도가 낮다.
 * 전역 큐로 간격을 강제하고, 429 는 지수 백오프로 재시도한다.
 */
/**
 * 호출 간격 — **토큰 한도 기준**으로 잡는다. 무료 티어 70b 모델의 TPM 이 낮아
 * 종목당 3콜(합성 ~1k + 검증 2×~0.3k 토큰)을 6초 간격으로 흘려야 한도 안에 들어온다.
 * 골든셋 실측: 2.6초 간격 + 24k자 입력에서 전 종목 429.
 */
const MIN_CALL_INTERVAL_MS = 6_000;
const RATE_LIMIT_RETRIES = 4;
/**
 * 429 재발 시 **자동 감속**(WO-SUB-03.5 PART C-1 재실행 요구사항).
 *
 * 고정 간격만으로는 부족하다 — 호출 크기가 종목마다 달라 분당 소비가 균일하지 않고,
 * 제공자 한도는 예고 없이 바뀐다. 429 를 받으면 간격을 늘리고(곱셈), 연속 성공하면
 * 천천히 회복한다(가법 회복 — 다시 벽에 부딪히지 않게 회복은 감속보다 느리게).
 * 감속 이력은 결과에 남긴다(조용한 감속 금지 — 완주 시간이 왜 길어졌는지 보이게).
 */
const MAX_CALL_INTERVAL_MS = 30_000;
const SLOWDOWN_FACTOR = 1.6;
const RECOVERY_STEP_MS = 500;
const RECOVERY_AFTER_SUCCESSES = 5;

let currentIntervalMs = MIN_CALL_INTERVAL_MS;
let consecutiveSuccesses = 0;
/** 감속·회복 이벤트 로그. 배치가 결과에 첨부한다. */
const pacingEvents: string[] = [];

/** 429 를 받았을 때 — 간격을 곱셈으로 늘린다. */
function slowDown(reason: string): void {
  const before = currentIntervalMs;
  currentIntervalMs = Math.min(MAX_CALL_INTERVAL_MS, Math.round(currentIntervalMs * SLOWDOWN_FACTOR));
  consecutiveSuccesses = 0;
  if (currentIntervalMs !== before) {
    pacingEvents.push(`감속 ${before}ms → ${currentIntervalMs}ms (${reason})`);
  }
}

/** 성공이 이어지면 조금씩 회복한다(감속보다 느리게). */
function noteSuccess(): void {
  consecutiveSuccesses += 1;
  if (consecutiveSuccesses < RECOVERY_AFTER_SUCCESSES) return;
  consecutiveSuccesses = 0;
  const before = currentIntervalMs;
  currentIntervalMs = Math.max(MIN_CALL_INTERVAL_MS, currentIntervalMs - RECOVERY_STEP_MS);
  if (currentIntervalMs !== before) pacingEvents.push(`회복 ${before}ms → ${currentIntervalMs}ms`);
}

/**
 * 실제 소비 토큰 누계 — **일일 쿼터 예산의 유일한 근거다.**
 *
 * 07-29 진단의 종목당 ~1,600토큰 추정대로면 TPD 100,000 에 62종목이 들어가야 하는데
 * 실측은 5종목에서 소진됐다(12배 차이). 다음 계획을 또 추정으로 세우지 않도록 실제 값을 센다.
 */
let totalTokensUsed = 0;
let billedCalls = 0;

/** 배치가 읽어 결과에 남긴다. 감속이 있었다면 완주 시간이 길어진 이유가 여기 있다. */
export function pacingReport(): {
  intervalMs: number;
  events: readonly string[];
  totalTokensUsed: number;
  billedCalls: number;
  quotaExhausted: boolean;
} {
  return {
    intervalMs: currentIntervalMs,
    events: [...pacingEvents],
    totalTokensUsed,
    billedCalls,
    quotaExhausted: quotaExhausted(),
  };
}

/**
 * 일일 쿼터(TPD/RPD) 소진 — **분당 한도와 같은 429 로 오는데 대응이 정반대다.**
 *
 * TPM 은 기다리면 풀리지만 TPD 는 그날 안에 풀리지 않는다. 실측(run 30740841495):
 *
 *   on tokens per day (TPD): Limit 100000, Used 99966, Requested 1077
 *   x-ratelimit-remaining-tokens: 12000   ← **분당 잔량은 가득 차 있었다**
 *   retry-after: 902
 *
 * 페이싱은 분당 잔량만 보므로 "여유 있다"고 판단했고 재시도는 902초를 네 번 그대로 기다렸다.
 * 골든셋 3배치가 각각 70분 스텝 타임아웃을 꽉 채우고 **5/30 종목**으로 끝난 진짜 원인이다.
 * 감속(6초→30초 상한)도 소용이 없었다 — 벽이 분당 한도가 아니었다.
 *
 * 그래서 TPD 를 만나면 **기다리지 않고 즉시 접는다.** 남은 러너 시간을 태우는 대신
 * 소진 사실을 페이싱 이력에 남겨 배치가 `quota_exhausted` 로 저장할 수 있게 한다.
 */
const DAILY_QUOTA_PATTERN = /\b(?:tokens|requests) per day\b|\((?:TPD|RPD)\)/i;

let quotaExhaustedAt: string | null = null;

/** 429 응답 본문이 **일일** 한도인지. 본문이 없으면 판별하지 않는다(추측으로 배치를 접지 않는다). */
export function isDailyQuotaError(errorBody: string | undefined): boolean {
  return Boolean(errorBody) && DAILY_QUOTA_PATTERN.test(errorBody as string);
}

/** 이 실행에서 일일 쿼터가 소진됐는가. 배치가 루프를 접는 근거로 쓴다. */
export function quotaExhausted(): boolean {
  return quotaExhaustedAt !== null;
}

/** 호출 결과에서 일일 쿼터 소진을 감지해 상태에 남긴다. */
export function noteQuotaFrom(result: { ok: boolean; status: number; errorBody?: string }): void {
  if (result.ok || result.status !== 429 || quotaExhaustedAt) return;
  if (!isDailyQuotaError(result.errorBody)) return;
  quotaExhaustedAt = new Date().toISOString();
  // 조용한 중단 금지 — 왜 멈췄는지가 결과 파일에 남아야 한다.
  pacingEvents.push(`일일 쿼터 소진 — 재시도 중단(${quotaExhaustedAt})`);
}

/** 제공자가 알려준 실제 소비량을 누적한다(추정 아님). */
export function noteTokenUsage(totalTokens: number | undefined): void {
  if (typeof totalTokens !== "number" || !Number.isFinite(totalTokens)) return;
  totalTokensUsed += totalTokens;
  billedCalls += 1;
}

/** 테스트용 — 모듈 전역 상태를 되돌린다. */
export function resetQuotaState(): void {
  quotaExhaustedAt = null;
  pacingEvents.length = 0;
  totalTokensUsed = 0;
  billedCalls = 0;
}

let lastCallAt = 0;
/** 직렬화 큐 — 병렬 호출이 간격을 우회하지 못하게 한다. */
let callChain: Promise<unknown> = Promise.resolve();
/**
 * 제공자가 알려준 남은 토큰과 리셋 시각. **고정 간격만으로는 부족하다** —
 * 실측: 6초 간격에서도 일부 종목이 429 를 받았다(호출 크기가 종목마다 달라 분당 소비가 균일하지 않다).
 * 이제 `x-ratelimit-*` 를 캡처하므로 **남은 양을 보고 기다린다**(추측 아님, 제공자 값 기준).
 */
let remainingTokens: number | null = null;
let resetTokensMs = 0;
/** 이 밑으로 남으면 리셋을 기다린다 — 큰 합성 호출 하나를 감당할 여유. */
const TOKEN_FLOOR = 2_500;

/** "3.165s" · "2m52.8s" → ms. 파싱 실패는 0(대기하지 않음). */
export function parseResetDuration(text: string | undefined): number {
  if (!text) return 0;
  const match = text.match(/(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?/);
  if (!match) return 0;
  const minutes = Number.parseFloat(match[1] ?? "0") || 0;
  const seconds = Number.parseFloat(match[2] ?? "0") || 0;
  return Math.round((minutes * 60 + seconds) * 1_000);
}

function noteRateLimit(rateLimit: Record<string, string> | undefined): void {
  if (!rateLimit) return;
  const remaining = Number.parseInt(rateLimit["x-ratelimit-remaining-tokens"] ?? "", 10);
  if (Number.isFinite(remaining)) remainingTokens = remaining;
  const reset = parseResetDuration(rateLimit["x-ratelimit-reset-tokens"]);
  if (reset > 0) resetTokensMs = reset;
}

async function paced<T>(run: () => Promise<T>): Promise<T> {
  const task = callChain.then(async () => {
    // 남은 토큰이 바닥이면 리셋까지 기다린다. 제공자가 준 값이라 추측이 아니다.
    if (remainingTokens !== null && remainingTokens < TOKEN_FLOOR && resetTokensMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, resetTokensMs + 500));
      remainingTokens = null;
    }
    const wait = currentIntervalMs - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    return run();
  });
  callChain = task.catch(() => undefined);
  return task;
}

/**
 * 429·5xx 는 백오프 재시도. 그 외 실패는 그대로 돌려준다(무한 재시도 금지).
 *
 * **export 하는 이유(WO-SUB-06.5)**: 리스크 합성 배치도 같은 LLM 한도를 쓴다. 배치마다 페이싱
 * 상태를 따로 두면 둘이 각자 "분당 여유가 있다"고 판단해 합산 TPM 을 넘긴다 — 골든셋 1차에서
 * 22종목을 429 로 잃은 것이 정확히 그 형태였다(페이싱 없는 연속 발사). 상태를 공유해야 한다.
 */
export async function callWithRetry(options: Parameters<typeof callAI>[0]): Promise<Awaited<ReturnType<typeof callAI>>> {
  // 이미 소진됐으면 호출하지 않는다 — 간격 대기까지 포함해 전부 낭비다.
  if (quotaExhausted()) return { content: "", ok: false, status: 429, model: "", errorBody: "일일 쿼터 소진 — 호출 생략" };
  let last = await paced(() => callAI(options));
  noteRateLimit(last.rateLimit);
  noteQuotaFrom(last);
  noteTokenUsage(last.totalTokens);
  if (last.ok) noteSuccess();
  for (let attempt = 1; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
    if (last.ok) return last;
    if (last.status !== 429 && last.status < 500) return last;
    // 일일 한도는 기다려도 그날 안에 안 풀린다 — 재시도하지 않고 그대로 돌려준다.
    if (quotaExhausted()) return last;
    // 429 가 실제로 왔다 → 이후 호출 간격을 늘린다(자동 감속). 재시도만으로는 다음 종목에서 또 맞는다.
    if (last.status === 429) slowDown(`429 재시도 ${attempt}회`);
    // 제공자가 준 리셋 시각을 우선 쓴다(retry-after → reset-tokens → 백오프).
    const wait = last.retryAfterMs ?? parseResetDuration(last.rateLimit?.["x-ratelimit-reset-tokens"]) ?? 0;
    await new Promise((resolve) => setTimeout(resolve, Math.max(wait, 4_000 * attempt) + 500));
    last = await paced(() => callAI(options));
    noteRateLimit(last.rateLimit);
    noteQuotaFrom(last);
  noteTokenUsage(last.totalTokens);
    if (last.ok) noteSuccess();
  }
  return last;
}
const SYNTH_TIMEOUT_MS = 30_000;
const VERIFY_TIMEOUT_MS = 20_000;
const SYNTH_MAX_TOKENS = 500;
const VERIFY_MAX_TOKENS = 300;
/** 슬롯 문장 길이 상한(§4-4 제약 1). 초과하면 폐기한다 — 자르면 문장이 깨진다. */
const MAX_SLOT_CHARS = 60;

export const SYNTHESIZE_PROMPT_ID = "synthesize.v1";
export const VERIFY_PROMPT_ID = "verify.v1";

interface RawSlot {
  text?: unknown;
  source_ids?: unknown;
}

interface SynthesisRaw {
  slot1_revenue_source?: RawSlot | null;
  slot2_dependency?: RawSlot | null;
  insufficient_reason?: unknown;
}

export interface SynthesisResult {
  slot1: { text: string; sourceIds: string[] } | null;
  slot2: { text: string; sourceIds: string[] } | null;
  insufficientReason: string | null;
  model: string;
  promptId: string;
  promptHash: string;
  errors: string[];
}

function parseSlot(raw: RawSlot | null | undefined, validIds: ReadonlySet<string>, errors: string[], label: string):
  | { text: string; sourceIds: string[] }
  | null {
  if (!raw || typeof raw !== "object") return null;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  if (text.length > MAX_SLOT_CHARS) {
    // 자르지 않는다 — 60자를 넘긴 문장을 잘라 쓰면 뜻이 바뀐다.
    errors.push(`${label}: 길이 초과(${text.length}자 > ${MAX_SLOT_CHARS}) — 폐기`);
    return null;
  }
  const ids = Array.isArray(raw.source_ids) ? raw.source_ids.filter((id): id is string => typeof id === "string") : [];
  // **모델이 만들어낸 source_id 를 신뢰하지 않는다.** 실제로 입력에 있던 id 만 남긴다.
  const known = ids.map((id) => id.trim()).filter((id) => validIds.has(id));
  const unknown = ids.length - known.length;
  if (unknown > 0) errors.push(`${label}: 입력에 없는 source_id ${unknown}개 제거`);
  if (known.length === 0) {
    errors.push(`${label}: 유효 근거 없음 — 폐기`);
    return null;
  }
  return { text, sourceIds: known };
}

/** JSON 응답 파싱 — 코드펜스·앞뒤 잡텍스트를 견딘다. */
export function parseJsonObject(content: string): Record<string, unknown> | null {
  const fenced = content.replace(/```json\s*|```/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 슬롯 1·2 합성. LLM 미설정이면 합성하지 않는다(억지 폴백 금지). */
export async function synthesizeSlots(input: {
  canonical: string;
  archetype: string;
  chunks: readonly SourceChunk[];
  revenueSummary: string;
}): Promise<SynthesisResult> {
  const prompt = promptOf(SYNTHESIZE_PROMPT_ID);
  const errors: string[] = [];
  const base: SynthesisResult = {
    slot1: null,
    slot2: null,
    insufficientReason: null,
    model: "",
    promptId: prompt.id,
    promptHash: prompt.hash,
    errors,
  };
  if (!isAiConfigured()) {
    errors.push("ai: 미설정 — 합성하지 않음");
    return base;
  }
  if (input.chunks.length === 0) {
    base.insufficientReason = "근거 청크가 없습니다.";
    return base;
  }

  const result = await callWithRetry({
    messages: [
      { role: "system", content: prompt.text },
      {
        role: "user",
        content: JSON.stringify({
          company: input.canonical,
          archetype: input.archetype,
          revenue_summary: input.revenueSummary,
          chunks: input.chunks.map((chunk) => ({ source_id: chunk.source_id, text: chunk.text })),
        }),
      },
    ],
    temperature: TEMPERATURE,
    jsonMode: true,
    maxTokens: SYNTH_MAX_TOKENS,
    timeoutMs: SYNTH_TIMEOUT_MS,
  });
  base.model = result.model;
  if (!result.ok) {
    // 429 는 분당 토큰 한도(TPM)와 일일 쿼터(TPD)가 **같은 코드**로 온다.
    // 어느 쪽인지는 응답 본문에 있는데 `callAI` 가 실패 시 본문을 버려서 여기서는 알 수 없다
    // (@fomo/shared 의 제약 — 이 WO 범위 밖). 그래서 상태 코드만 남긴다.
    errors.push(`ai: 합성 호출 실패(${result.status})${result.status === 429 ? " — 토큰 한도(TPM/TPD 구분 불가)" : ""}`);
    return base;
  }
  const parsed = parseJsonObject(result.content) as SynthesisRaw | null;
  if (!parsed) {
    errors.push("ai: 합성 응답 JSON 파싱 실패");
    return base;
  }
  const validIds = new Set(input.chunks.map((chunk) => chunk.source_id));
  base.slot1 = parseSlot(parsed.slot1_revenue_source, validIds, errors, "slot1");
  base.slot2 = parseSlot(parsed.slot2_dependency, validIds, errors, "slot2");
  base.insufficientReason =
    typeof parsed.insufficient_reason === "string" && parsed.insufficient_reason.trim()
      ? parsed.insufficient_reason.trim()
      : null;
  return base;
}

export interface VerifyOutcome {
  supported: boolean;
  unsupportedSpan: string | null;
  /** 검증기가 판정하지 못한 경우(호출 실패·파싱 실패). 이때는 폐기한다. */
  inconclusive: boolean;
  /**
   * 판정 불가의 **원인**. `inconclusive` 만으로는 세 가지가 구분되지 않는다 —
   * LLM 미설정 / 인용 없음 / 호출 실패(쿼터·429·타임아웃) / 응답 파싱 실패.
   * 전부 같은 신호로 뭉개지면 배치가 왜 0건인지 알 수 없다(실측으로 겪은 문제다).
   * 판정에는 쓰지 않는다 — 기록·진단용이다.
   */
  inconclusiveReason?: string;
}

/**
 * 근거 검증 — 생성 문장이 인용 청크에서 지지되는지 **별도 호출**로 확인한다.
 * 판정 실패(호출·파싱 오류)는 `supported: false` 로 처리한다. 의심스러우면 폐기하는 쪽이다.
 */
export async function verifySentence(sentence: string, citedChunks: readonly SourceChunk[]): Promise<VerifyOutcome> {
  const prompt = promptOf(VERIFY_PROMPT_ID);
  if (!isAiConfigured()) return { supported: false, unsupportedSpan: null, inconclusive: true, inconclusiveReason: "LLM 미설정" };
  if (citedChunks.length === 0) return { supported: false, unsupportedSpan: null, inconclusive: true, inconclusiveReason: "인용 청크 없음" };
  const result = await callWithRetry({
    messages: [
      { role: "system", content: prompt.text },
      {
        role: "user",
        content: JSON.stringify({
          sentence,
          chunks: citedChunks.map((chunk) => ({ source_id: chunk.source_id, text: chunk.text })),
        }),
      },
    ],
    temperature: TEMPERATURE,
    jsonMode: true,
    maxTokens: VERIFY_MAX_TOKENS,
    timeoutMs: VERIFY_TIMEOUT_MS,
  });
  if (!result.ok) {
    return {
      supported: false,
      unsupportedSpan: null,
      inconclusive: true,
      inconclusiveReason: `검증 호출 실패(HTTP ${result.status})${result.errorBody ? `: ${result.errorBody.slice(0, 120)}` : ""}`,
    };
  }
  const parsed = parseJsonObject(result.content);
  if (!parsed || typeof parsed.supported !== "boolean") {
    // 응답 앞머리를 남긴다 — 잘린 JSON(토큰 상한)과 형식 위반을 구분할 수 있어야 한다.
    return {
      supported: false,
      unsupportedSpan: null,
      inconclusive: true,
      inconclusiveReason: `검증 응답 파싱 실패(${result.content.length}자): ${result.content.slice(0, 120)}`,
    };
  }
  return {
    supported: parsed.supported,
    unsupportedSpan: typeof parsed.unsupported_span === "string" ? parsed.unsupported_span : null,
    inconclusive: false,
  };
}

/** 합성 결과 한 슬롯을 검증까지 통과시켜 `SourcedSentence` 로 만든다. 실패하면 null. */
/**
 * **인용한 청크에서 종류를 뽑는다** — 번들의 첫 청크가 아니다.
 *
 * 왜 중요한가: 배지가 `충분` 에 도달하려면 슬롯 중 하나가 `vendor_summary` 가 아니어야 한다
 * (`badge.ts` `onlyVendorBacked`). 번들 첫 청크로 종류를 정하면, 공시 청크와 벤더 청크가
 * 섞인 번들에서 **벤더 근거로 만든 문장이 `disclosure` 로 표시되어 받을 자격 없는 배지를
 * 받는다.** KR 슬롯1 을 공시로 승격하면 정확히 그 혼합 번들이 생긴다.
 *
 * 섞여 있으면 **약한 쪽(`vendor_summary`)** 으로 내려 잡는다. 오분류는 안전한 쪽으로.
 */
export function kindOfCited(cited: readonly SourceChunk[], fallback: BusinessSourceKind): BusinessSourceKind {
  if (cited.length === 0) return fallback;
  return cited.some((chunk) => chunk.kind === "vendor_summary") ? "vendor_summary" : cited[0]!.kind;
}

export async function verifiedSentence(
  slot: { text: string; sourceIds: string[] } | null,
  chunks: readonly SourceChunk[],
  /** 인용 청크가 비었을 때만 쓰는 대체값. 정상 경로에서는 인용에서 뽑는다. */
  kind: BusinessSourceKind,
  errors: string[],
  label: string
): Promise<SourcedSentence | null> {
  if (!slot) return null;
  const cited = chunks.filter((chunk) => slot.sourceIds.includes(chunk.source_id));
  const outcome = await verifySentence(slot.text, cited);
  if (!outcome.supported) {
    errors.push(
      outcome.inconclusive
        ? `${label}: 검증 판정 불가 — 폐기`
        : `${label}: 근거 미지지 — 폐기${outcome.unsupportedSpan ? `(${outcome.unsupportedSpan})` : ""}`
    );
    return null;
  }
  return sourcedSentence(slot.text, slot.sourceIds, kindOfCited(cited, kind), true);
}

export const VERIFY_PROMPT_VERSION_ID = VERIFY_PROMPT_ID;
export const PROMPT_BUNDLE_IDS = [SYNTHESIZE_PROMPT_ID, VERIFY_PROMPT_ID] as const;
