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
const LLM_TIMEOUT_MS = 9_000;

interface AboutRow {
  about: string;
  asOf: string;
}

async function fetchCompanyDescription(symbol: string): Promise<string | undefined> {
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

/** 문장 수 — `~해요.` 로 끝나는 문장을 센다. §C-3 은 **최대 2문장**이다. */
function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+|(?<=요\.)\s*/).filter((part) => part.trim().length > 0).length;
}

async function translateAbout(name: string, description: string): Promise<string | undefined> {
  if (!isAiConfigured()) return undefined;
  const res = await callAI({
    messages: [
      {
        role: "system",
        content:
          "아래 영문 회사 소개를 근거로 이 회사가 무엇을 하는 회사인지 한국어로 설명하라. " +
          "**첫 문장은 이 회사가 무엇을 파는지(또는 무슨 서비스를 하는지)로 시작한다.** " +
          "최대 2문장. 입력에 없는 사실·수치·고유명사 추가 금지, 과장·투자 권유 금지, 존댓말(~해요체). 문장만 출력.",
      },
      { role: "user", content: JSON.stringify({ company: name, description: description.slice(0, 1200) }) },
    ],
    // §C-3 — 온도 0. 회사 소개는 매번 달라질 이유가 없고, 달라지면 캐시가 거짓말이 된다.
    temperature: 0,
    timeoutMs: LLM_TIMEOUT_MS,
    trace: "us-company-about",
  }).catch(() => ({ ok: false as const, content: "" }));
  if (!res.ok || !res.content) return undefined;
  const clean = res.content.replace(/\s+/g, " ").trim();
  const hasKorean = /[가-힣]/.test(clean);
  const latinRatio = (clean.match(/[A-Za-z]/g)?.length ?? 0) / Math.max(1, clean.length);
  if (!hasKorean || latinRatio > 0.3 || clean.length < 30 || clean.length > 400 || FORBIDDEN.test(clean)) return undefined;
  // §C-3 최대 2문장 · 근거 검증 패스. 어느 하나라도 어기면 **버린다**(섹션 생략이 정직하다).
  if (sentenceCount(clean) > 2) return undefined;
  if (!groundedInSource(clean, description)) return undefined;
  return clean;
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
}

/** LLM 콜 사이 간격(ms) — 429 를 만들지 않는 쪽이 빠르다. */
const BACKFILL_GAP_MS = 1_200;

export async function backfillUsCompanyAbout(
  symbols: ReadonlyArray<{ symbol: string; name: string }>,
  options: { limit?: number; deadline?: number } = {}
): Promise<AboutBackfillResult> {
  const limit = Math.max(1, options.limit ?? 25);
  const deadline = options.deadline ?? Date.now() + 240_000;
  const out: AboutBackfillResult = { filled: 0, cached: 0, noSource: 0, rejected: 0, pending: 0, sample: [] };

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
    const about = await translateAbout(entry.name, description);
    out.pending -= 1;
    if (!about) { out.rejected += 1; continue; }
    await writeFeedContent(KEY(entry.symbol), { about, asOf: new Date().toISOString().slice(0, 10) } satisfies AboutRow)
      .catch(() => undefined);
    out.filled += 1;
    if (out.sample.length < 20) out.sample.push(entry.symbol);
    await new Promise((resolve) => setTimeout(resolve, BACKFILL_GAP_MS));
  }
  return out;
}
