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

async function translateAbout(name: string, description: string): Promise<string | undefined> {
  if (!isAiConfigured()) return undefined;
  const res = await callAI({
    messages: [
      {
        role: "system",
        content:
          "아래 영문 회사 소개를 근거로 이 회사가 무엇을 하는 회사인지 한국어 2~3문장으로 설명하라. " +
          "입력에 없는 사실·수치 추가 금지, 과장·투자 권유 금지, 존댓말(~해요체). 문장만 출력.",
      },
      { role: "user", content: JSON.stringify({ company: name, description: description.slice(0, 1200) }) },
    ],
    temperature: 0.2,
    timeoutMs: LLM_TIMEOUT_MS,
    trace: "us-company-about",
  }).catch(() => ({ ok: false as const, content: "" }));
  if (!res.ok || !res.content) return undefined;
  const clean = res.content.replace(/\s+/g, " ").trim();
  const hasKorean = /[가-힣]/.test(clean);
  const latinRatio = (clean.match(/[A-Za-z]/g)?.length ?? 0) / Math.max(1, clean.length);
  if (!hasKorean || latinRatio > 0.3 || clean.length < 30 || clean.length > 400 || FORBIDDEN.test(clean)) return undefined;
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
