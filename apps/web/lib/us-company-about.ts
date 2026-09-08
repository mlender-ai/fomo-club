import { callAI, isAiConfigured } from "@fomo/shared";
import { readFeedContent, writeFeedContent } from "./feed-content-store";

/**
 * US 회사 소개 한국어 요약 (2026-07-18 User Zero: "이 회사가 무슨 회사인지 내용이 하나도 없다").
 *
 * Nasdaq company-profile 의 CompanyDescription(영문)을 LLM 으로 한국어 2~3문장 요약해
 * FeedContentCache 에 **영구 캐시**(회사 소개는 사실상 불변 — 심볼당 LLM 1콜이면 끝).
 * 영문 원문 노출 금지 정책(#840 계열) 유지: 번역 실패·AI 미설정이면 undefined(섹션 생략이 정직).
 */

const KEY = (symbol: string) => `about:us:${symbol.toUpperCase()}`;
const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
/** 요청 경로(상세 열기) 예산 — 사용자를 기다리게 할 수 없다. */
const LLM_TIMEOUT_MS = 9_000;
/**
 * 백필 예산 — **요청 경로가 아니므로 9초를 쓸 이유가 없다.**
 *
 * 실측(2026-09-08): 백필 탈락이 전부 `llm-failed` 였고 `aiConfigured: true` 였다 —
 * 키는 있고 호출이 실패한다. 요청 경로용 9초를 백필이 그대로 물려받고 있었다.
 */
const BACKFILL_LLM_TIMEOUT_MS = 30_000;
/** 429 를 만나면 제공자가 알려준 만큼 기다린다. 상한은 둔다(라우트 예산 안에서). */
const MAX_RETRY_AFTER_MS = 20_000;

interface AboutRow {
  about: string;
  asOf: string;
}

export async function fetchCompanyDescription(symbol: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.nasdaq.com/api/company/${encodeURIComponent(symbol)}/company-profile`, {
      headers: { "User-Agent": NASDAQ_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: { CompanyDescription?: { value?: string } } };
    const desc = json.data?.CompanyDescription?.value?.trim();
    return desc && desc.length >= 40 ? desc : undefined;
  } catch {
    return undefined;
  }
}

/** 금지 문형 — 소개는 사실 서술만(투자 권유·과장 금지, AGENTS 블랙리스트). */
const FORBIDDEN = /사세요|매수|매도|추천|목표가|반드시|폭등|급등할|놓치면/;

/**
 * LAUNCH-P2 §C-3 — **원문에 없는 것은 못 나온다.**
 *
 * 숫자와 라틴 고유명사는 **원문에 그대로 있어야** 통과한다. 요약이 그럴듯하게 지어낸
 * 숫자(설립연도·매출·직원 수)를 넣는 것이 이 경로의 유일한 큰 위험이고, 그건 우리가
 * 지켜야 하는 「사실 정확성」의 정중앙이다(제약 해제와 무관하게 항상 켜져 있는 규칙).
 */
export function groundedInSource(summary: string, source: string): boolean {
  const src = source.toLowerCase();
  for (const digits of summary.match(/\d[\d,.]*/g) ?? []) {
    const bare = digits.replace(/[.,]$/, "");
    // 연도·금액·개수 — 원문에 없으면 우리가 만든 숫자다.
    if (bare.length >= 2 && !src.includes(bare.toLowerCase())) return false;
  }
  for (const word of summary.match(/[A-Za-z][A-Za-z.&-]{2,}/g) ?? []) {
    if (!src.includes(word.toLowerCase())) return false;
  }
  return true;
}

/**
 * 영문 단위어를 한국어 문장에 남기지 않는다 — **한영혼용은 이 레포가 따로 금지하는 것**이다.
 *
 * 실측에서 나왔다: 「숫자는 원문 형태 그대로」라고 지시하니 LLM 이
 * `15.8 million 명의 회원` 을 냈다. 근거 검증은 통과한다(원문에 그 숫자가 있다) —
 * **다른 규칙이 필요하다.** 이걸 만나면 숫자 없이 다시 쓴다.
 */
export function hasLatinUnitWord(text: string): boolean {
  return /\b(?:million|billion|trillion|thousand|mn|bn)\b/i.test(text);
}

/** 문장 수 — `~해요.` 로 끝나는 문장을 센다. §C-3 은 **최대 2문장**이다. */
function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+|(?<=요\.)\s*/).filter((part) => part.trim().length > 0).length;
}

/** 내보내는 이유: 진단 스크립트가 **사본이 아니라 이 함수를** 재야 한다(사본을 재다 한 번 헛짚었다). */
/** 요약이 떨어진 사유 — **세는 것과 사유를 아는 것은 다른 일이다**(같은 실수를 두 번 했다). */
export type AboutRejectReason =
  /** 호출 자체가 실패 — 아래 셋으로 갈린다. */
  | "llm-failed"
  /** 레이트리밋. 페이싱을 늦추거나 기다리면 풀린다. */
  | "llm-429"
  /** 예산 안에 응답이 안 왔다. */
  | "llm-timeout"
  | "no-korean"
  | "too-latin"
  | "too-short"
  | "too-long"
  | "too-many-sentences"
  | "latin-unit-word"
  | "forbidden-phrase"
  | "not-grounded";

export interface AboutAttempt {
  summary?: string;
  reason?: AboutRejectReason;
  /** 떨어진 문장 앞부분 — 무엇이 문제였는지 사람이 봐야 고친다. */
  sample?: string;
}

/** 한 곳에서 검증한다 — 두 경로(1차·재시도)가 같은 규칙을 쓰도록. */
export function validateSummary(clean: string, description: string): AboutRejectReason | null {
  if (!/[가-힣]/.test(clean)) return "no-korean";
  const latinRatio = (clean.match(/[A-Za-z]/g)?.length ?? 0) / Math.max(1, clean.length);
  if (latinRatio > 0.3) return "too-latin";
  if (clean.length < 30) return "too-short";
  if (clean.length > 400) return "too-long";
  if (sentenceCount(clean) > 2) return "too-many-sentences";
  if (hasLatinUnitWord(clean)) return "latin-unit-word";
  if (FORBIDDEN.test(clean)) return "forbidden-phrase";
  if (!groundedInSource(clean, description)) return "not-grounded";
  return null;
}

/** 1차 프롬프트 — 숫자는 원문 형태 그대로, 단위 변환 금지. */
const PROMPT_LITERAL =
  "아래 영문 회사 소개를 근거로 이 회사가 무엇을 하는 회사인지 한국어로 설명하라. " +
  "**첫 문장은 이 회사가 무엇을 파는지(또는 무슨 서비스를 하는지)로 시작한다.** " +
  "최대 2문장. 입력에 없는 사실·수치·고유명사 추가 금지, 과장·투자 권유 금지, 존댓말(~해요체). " +
  "숫자는 원문에 적힌 형태 그대로만 쓰고 단위를 바꾸지 마라(1.6 million → 160만 금지). " +
  "숫자가 꼭 필요하지 않으면 쓰지 마라. 문장만 출력.";

/**
 * 2차 프롬프트 — **숫자를 아예 쓰지 말고** 다시.
 *
 * 1차가 떨어지는 이유는 대개 단위 환산이다(실측: 첫 백필 40건 전부). 그때 심볼을 버리면
 * 확보율이 0 인데, **숫자 없는 회사 소개는 여전히 유효한 소개**다 —
 * 「무엇을 파는 회사인가」에 숫자가 필요하지 않다.
 */
const PROMPT_NO_NUMBERS =
  "아래 영문 회사 소개를 근거로 이 회사가 무엇을 하는 회사인지 한국어로 설명하라. " +
  "**첫 문장은 이 회사가 무엇을 파는지로 시작한다.** 최대 2문장. " +
  "**숫자를 하나도 쓰지 마라**(연도·금액·개수·비율 전부). 입력에 없는 사실·고유명사 추가 금지, " +
  "과장·투자 권유 금지, 존댓말(~해요체). 문장만 출력.";

/** 응답 한 건을 검증해 통과분 또는 사유를 돌려준다. */
export function attemptOf(content: string, description: string): AboutAttempt {
  const clean = content.replace(/\s+/g, " ").trim();
  const reason = validateSummary(clean, description);
  return reason ? { reason, sample: clean.slice(0, 90) } : { summary: clean };
}

/**
 * LLM 한 번 — 온도 0(§C-3). 회사 소개는 매번 달라질 이유가 없고, 달라지면 캐시가 거짓말이 된다.
 *
 * **429 는 기다렸다 한 번 더** 한다(제공자가 `retry-after` 를 준다). 실패 사유를 셋으로
 * 갈라 돌려준다 — 「레이트리밋」과 「타임아웃」은 다른 처방이다.
 */
async function callTranslate(
  name: string,
  description: string,
  noNumbers: boolean,
  timeoutMs: number
): Promise<AboutAttempt> {
  if (!isAiConfigured()) return { reason: "llm-failed", sample: "AI 미설정" };
  const ask = () =>
    callAI({
      messages: [
        { role: "system", content: noNumbers ? PROMPT_NO_NUMBERS : PROMPT_LITERAL },
        { role: "user", content: JSON.stringify({ company: name, description: description.slice(0, 1200) }) },
      ],
      temperature: 0,
      timeoutMs,
      trace: noNumbers ? "us-company-about-retry" : "us-company-about",
    }).catch(() => ({ ok: false as const, content: "", status: 0 as number, retryAfterMs: undefined, errorBody: "" }));

  let res = await ask();
  if (!res.ok && res.status === 429) {
    const wait = Math.min(res.retryAfterMs ?? 5_000, MAX_RETRY_AFTER_MS);
    await new Promise((resolve) => setTimeout(resolve, wait));
    res = await ask();
  }
  if (!res.ok || !res.content) {
    const reason: AboutRejectReason = res.status === 429 ? "llm-429" : res.status === 0 ? "llm-timeout" : "llm-failed";
    return { reason, sample: `HTTP ${res.status} ${(res.errorBody ?? "").slice(0, 60)}` };
  }
  return attemptOf(res.content, description);
}

/**
 * 사유까지 돌려주는 판 — **백필이 「왜 떨어졌나」를 센다.**
 *
 * 실패를 세는 것과 사유를 아는 것은 다른 일이고, 이 배치에서 그 실수를 두 번 했다
 * (본문 계측을 응답에 안 실었고, 백필 탈락 사유를 안 셌다).
 */
export async function translateAboutWithReason(
  name: string,
  description: string,
  timeoutMs: number = LLM_TIMEOUT_MS
): Promise<AboutAttempt> {
  const first = await callTranslate(name, description, false, timeoutMs);
  if (first.summary) return first;
  // 호출 자체가 안 되는 것은 프롬프트를 바꿔도 안 풀린다.
  if (first.reason === "llm-failed" || first.reason === "llm-429" || first.reason === "llm-timeout") return first;
  const second = await callTranslate(name, description, true, timeoutMs);
  // 두 번 다 떨어지면 **1차 사유**를 남긴다 — 그게 고칠 지점이다.
  return second.summary ? second : first;
}

/** 화면·캐시 경로 — 사유는 버리고 통과분만. */
export async function translateAbout(name: string, description: string): Promise<string | undefined> {
  return (await translateAboutWithReason(name, description)).summary;
}

/** 심볼의 한국어 회사 소개 — 영구 캐시 우선, 미스 시 fetch+번역+저장. 실패는 undefined(fail-open). */
export async function getUsCompanyAbout(name: string, symbol: string): Promise<string | undefined> {
  const cached = await readFeedContent<AboutRow>(KEY(symbol)).catch(() => null);
  if (cached?.about) return cached.about;

  const description = await fetchCompanyDescription(symbol);
  if (!description) return undefined;
  const about = await translateAbout(name, description);
  if (!about) return undefined;
  await writeFeedContent(KEY(symbol), { about, asOf: new Date().toISOString().slice(0, 10) } satisfies AboutRow).catch(
    () => undefined
  );
  return about;
}


/**
 * LAUNCH-P2 §C — **요청 경로 밖에서 캐시를 채운다(백필).**
 *
 * ## 왜 요청 경로에서는 0% 였나
 *
 * `getUsCompanyAbout` 은 상세를 열 때 불린다. 거기서 LLM 을 타는데 예산이 9초이고
 * 레이트리밋(429)이 걸린다 — 실측 확보율 **0%** 였다. 요청 시점에는 고칠 수 없는 문제다
 * (사용자를 9초 이상 기다리게 할 수 없고, 429 를 기다려 줄 수도 없다).
 *
 * 백필은 그 둘이 다 없다: 시간이 넉넉하고, 429 는 **기다렸다 다시** 하면 된다.
 * 소스는 100% 있다(실측 2026-09-08: Nasdaq company-profile 5/5 심볼, 51~678자).
 *
 * ## 한 번에 다 하지 않는다
 *
 * 심볼 212개 × LLM 1콜이면 레이트리밋에 막힌다. 한 번에 `limit` 개만 하고, 이미 채운 것은
 * 건너뛴다(영구 캐시) — 며칠에 걸쳐 채워지고, 채워진 것은 다시 하지 않는다.
 */
export interface AboutBackfillResult {
  /** 이번 실행에서 새로 채운 심볼 수. */
  filled: number;
  /** 이미 캐시에 있어 건너뛴 수. */
  cached: number;
  /** 소스에 설명이 없어 못 채운 수. */
  noSource: number;
  /** 소스는 있는데 번역·검증에서 떨어진 수 — **다음 작업 대상**이다. */
  rejected: number;
  /** 남은 대상 수(다음 실행이 이어서 한다). */
  pending: number;
  /** 채운 심볼 목록(보고용, 최대 20). */
  sample: string[];
  /** **왜 떨어졌나** — 사유별 건수. 이게 없으면 확보율만 보고 무엇을 고칠지 알 수 없다. */
  rejectedBy: Record<string, number>;
  /** 떨어진 문장 표본(최대 3) — 사람이 봐야 고친다. */
  rejectedSample: string[];
}

/** LLM 콜 사이 간격(ms) — 429 를 만들지 않는 쪽이 빠르다. */
const BACKFILL_GAP_MS = 1_200;

export async function backfillUsCompanyAbout(
  symbols: ReadonlyArray<{ symbol: string; name: string }>,
  options: { limit?: number; deadline?: number } = {}
): Promise<AboutBackfillResult> {
  const limit = Math.max(1, options.limit ?? 25);
  const deadline = options.deadline ?? Date.now() + 240_000;
  const out: AboutBackfillResult = {
    filled: 0, cached: 0, noSource: 0, rejected: 0, pending: 0, sample: [], rejectedBy: {}, rejectedSample: [],
  };

  const todo: Array<{ symbol: string; name: string }> = [];
  for (const entry of symbols) {
    const cached = await readFeedContent<AboutRow>(KEY(entry.symbol)).catch(() => null);
    if (cached?.about) out.cached += 1;
    else todo.push(entry);
  }
  out.pending = todo.length;

  for (const entry of todo.slice(0, limit)) {
    if (Date.now() > deadline) break;
    const description = await fetchCompanyDescription(entry.symbol);
    if (!description) { out.noSource += 1; out.pending -= 1; continue; }
    // 첫 시도가 단위 환산으로 떨어지면 **숫자 없이** 한 번 더 — 심볼을 버리지 않는다.
    // 백필은 요청 경로가 아니다 — 넉넉한 예산을 쓴다.
    const attempt = await translateAboutWithReason(entry.name, description, BACKFILL_LLM_TIMEOUT_MS);
    out.pending -= 1;
    if (!attempt.summary) {
      out.rejected += 1;
      const reason = attempt.reason ?? "unknown";
      out.rejectedBy[reason] = (out.rejectedBy[reason] ?? 0) + 1;
      if (out.rejectedSample.length < 3) out.rejectedSample.push(`${entry.symbol} ${reason}: ${attempt.sample ?? ""}`);
      continue;
    }
    const about = attempt.summary;
    await writeFeedContent(KEY(entry.symbol), { about, asOf: new Date().toISOString().slice(0, 10) } satisfies AboutRow)
      .catch(() => undefined);
    out.filled += 1;
    if (out.sample.length < 20) out.sample.push(entry.symbol);
    await new Promise((resolve) => setTimeout(resolve, BACKFILL_GAP_MS));
  }
  return out;
}
