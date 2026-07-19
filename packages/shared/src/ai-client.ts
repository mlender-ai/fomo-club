/**
 * Provider-agnostic AI 클라이언트 — 모든 제품 LLM 호출의 단일 지점.
 *
 * OpenAI 호환 chat-completions(Groq / OpenAI / Anthropic 프록시 / 로컬 등)을
 * AI_API_URL / AI_API_KEY / AI_MODEL 체계로 호출한다(CLAUDE.md 코드원칙 5).
 * 모델 무관 단일 seam → 모델 교체·비교·관측·평가를 여기서 일괄한다.
 * (Claude / Codex / Groq / 향후 모델 전부 이 한 지점을 통과)
 *
 * opik 추적 내장 — OPIK_API_KEY(또는 OPIK_URL_OVERRIDE)가 있을 때만 활성.
 * 미설정·패키지 부재·추적 실패는 모두 fail-open(추적만 생략, 호출은 정상).
 *
 * 정직성: URL/키 미설정이면 호출하지 않고 빈 결과(ok=false)를 돌려준다 — 호출부가 폴백.
 */

export type AiRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface CallAiOptions {
  messages: AiMessage[];
  /** 미지정 시 AI_MODEL env. 호출별 오버라이드로 모델 비교·라우팅. */
  model?: string;
  temperature?: number;
  /** OpenAI 호환 max_tokens. 생략 시 공급자 기본값, 비용/TPM 게이트 경로는 반드시 명시한다. */
  maxTokens?: number;
  /** OpenAI 호환 JSON object 응답 모드. 구조화된 검수 결과처럼 파싱 계약이 필요한 호출에 사용한다. */
  jsonMode?: boolean;
  /** 기본 25_000ms. */
  timeoutMs?: number;
  apiUrl?: string;
  apiKey?: string;
  /** opik 추적/평가 그룹 이름(예: "theme-understanding"). */
  trace?: string;
  /** opik 메타데이터(태그·실험 비교용). */
  metadata?: Record<string, unknown>;
}

export interface CallAiResult {
  content: string;
  ok: boolean;
  status: number;
  model: string;
  retryAfterMs?: number;
}

interface LlmResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

function isGeminiEndpoint(url: string): boolean {
  return /generativelanguage\.googleapis\.com|\/google\/|googleapis\.com\/v1beta\/openai/i.test(url);
}

function isGeminiModel(model: string): boolean {
  return /^gemini(?:-|\/)/i.test(model) || /gemini-2\.5-flash/i.test(model);
}

function geminiApiAllowed(): boolean {
  return process.env["ALLOW_GEMINI_API"] === "1";
}

function groqKey(): string {
  return process.env["GROQ_API_KEY"] ?? "";
}

function groqModel(): string {
  return process.env["GROQ_MODEL"] || DEFAULT_GROQ_MODEL;
}

function resolveRuntimeConfig(opts: Pick<CallAiOptions, "apiUrl" | "apiKey" | "model">): {
  url: string;
  key: string;
  model: string;
  blockedProvider?: "gemini";
} {
  let url = aiApiUrl(opts.apiUrl);
  let key = resolveAiKey(opts.apiKey);
  let model = resolveModel(opts.model);

  if (!url && groqKey()) {
    url = GROQ_API_URL;
    key = groqKey();
    model = groqModel();
  }

  if ((isGeminiEndpoint(url) || isGeminiModel(model)) && !geminiApiAllowed()) {
    const fallbackKey = groqKey();
    if (fallbackKey) {
      return {
        url: GROQ_API_URL,
        key: fallbackKey,
        // 호출부가 명시한 비-Gemini 모델은 보존한다. 전역 Gemini 설정을
        // 우회하는 위원회처럼 호출별 비용·품질 게이트가 있는 경로가
        // GROQ_MODEL 환경값에 의해 다시 무거운 모델로 올라가지 않게 한다.
        model: isGeminiModel(model) ? groqModel() : model,
      };
    }
    return { url: "", key: "", model, blockedProvider: "gemini" };
  }

  return { url, key, model };
}

/** AI_API_KEY → (공란/USE_GITHUB_TOKEN) GITHUB_TOKEN 폴백. 7곳 중복이던 키 해소 로직 단일화. */
export function resolveAiKey(apiKey?: string): string {
  const configured = apiKey ?? process.env["AI_API_KEY"] ?? "";
  if (!configured || configured.toUpperCase() === "USE_GITHUB_TOKEN") {
    return process.env["GITHUB_TOKEN"] ?? "";
  }
  return configured;
}

export function aiApiUrl(apiUrl?: string): string {
  return apiUrl ?? process.env["AI_API_URL"] ?? "";
}

export function resolveModel(model?: string): string {
  return model || process.env["AI_MODEL"] || "openai/gpt-4.1-mini";
}

/** 호출 가능 여부(URL+키). 미설정이면 호출 생략하고 정직한 빈 결과. */
export function isAiConfigured(apiUrl?: string, apiKey?: string): boolean {
  const runtime = resolveRuntimeConfig({
    ...(apiUrl !== undefined ? { apiUrl } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
  });
  return Boolean(runtime.url) && Boolean(runtime.key);
}

/**
 * 단일 LLM 호출. 성공 시 content(=choices[0].message.content), 실패/미설정 시 ok=false + 빈 content.
 * 예외를 던지지 않는다 — 호출부는 result.ok 로 분기하고 자체 폴백을 유지한다.
 */
export async function callAI(opts: CallAiOptions): Promise<CallAiResult> {
  const runtime = resolveRuntimeConfig(opts);
  const { url, key, model } = runtime;
  const result: CallAiResult = { content: "", ok: false, status: 0, model };
  if (runtime.blockedProvider === "gemini") {
    console.warn("[ai-client] Gemini API 호출 차단: GROQ_API_KEY가 없어 LLM 호출을 생략합니다.");
    return result;
  }
  if (!url || !key) return result;

  const finishTrace = beginTrace(opts.trace, {
    model,
    messages: opts.messages,
    ...(opts.metadata ?? {}),
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: opts.messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    });
    result.status = res.status;
    if (!res.ok) {
      const retryAfterSeconds = Number.parseFloat(res.headers.get("retry-after") ?? "");
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        result.retryAfterMs = Math.round(retryAfterSeconds * 1_000);
      }
      console.warn(`[ai-client] ${opts.trace ?? "call"} HTTP ${res.status}`);
      finishTrace({ ok: false, status: res.status });
      return result;
    }
    const data = (await res.json()) as LlmResponse;
    result.content = data.choices?.[0]?.message?.content ?? "";
    result.ok = true;
    finishTrace({ ok: true, status: res.status, content: result.content });
    return result;
  } catch (err) {
    console.warn(`[ai-client] ${opts.trace ?? "call"} error`, err);
    finishTrace({ error: String(err) });
    return result;
  }
}

// ---- opik 추적(선택, fail-open) ------------------------------------------------

type TraceFinish = (output: Record<string, unknown>) => void;
const noopFinish: TraceFinish = () => {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- opik SDK는 동적 로드(선택 의존성)
let opikClientPromise: Promise<any> | undefined;

function opikEnabled(): boolean {
  return Boolean(process.env["OPIK_API_KEY"] || process.env["OPIK_URL_OVERRIDE"]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOpikClient(): Promise<any> {
  if (!opikEnabled()) return null;
  if (opikClientPromise === undefined) {
    opikClientPromise = import("opik")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((m: any) => (m?.Opik ? new m.Opik() : null))
      .catch((err: unknown) => {
        console.warn("[ai-client] opik 추적 비활성(패키지/설정 없음)", err);
        return null;
      });
  }
  return opikClientPromise;
}

/** opik trace 시작 → 종료 콜백 반환. 메인 호출을 절대 블로킹/실패시키지 않는다. */
function beginTrace(name: string | undefined, input: Record<string, unknown>): TraceFinish {
  if (!name || !opikEnabled()) return noopFinish;
  const tracePromise = getOpikClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((client: any) => (client ? client.trace({ name, input }) : null))
    .catch(() => null);
  return (output: Record<string, unknown>) => {
    void tracePromise
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(async (trace: any) => {
        if (!trace) return;
        try {
          const span = trace.span({ name, type: "llm", input, output });
          span.end();
          trace.end({ output });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const client: any = await getOpikClient();
          if (client?.flush) await client.flush();
        } catch {
          /* fail-open: 추적 실패는 제품에 영향 없음 */
        }
      })
      .catch(() => {});
  };
}
