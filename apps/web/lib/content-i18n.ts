/**
 * US 뉴스 콘텐츠 한글화 (2026-07-12 User Zero: "콘텐츠에 영문만 있는 것도 있고 — 크리티컬").
 *
 * 근본 원인: 브리핑·버즈는 Groq로 한글 카피를 생성하지만, narrative(STORY) 트리거와
 * hot-issue 헤드라인은 US 기사 원문(영어)을 그대로 노출했다. 제품은 한국어 우선인데
 * 미장 뉴스가 영어로 떴다.
 *
 * 설계(제품 헌법 준수 — LLM은 크론에서만, 요청 경로는 캐시 읽기 전용):
 * - 크론(feed-content): 최신 US 기사 제목을 Groq로 배치 번역해 FeedContentCache에 저장.
 * - 요청 경로(discovery·feed-hub): `hydrateKoreanTitles()`로 캐시를 모듈 맵에 적재하고
 *   `koreanTitle(url)`로 동기 조회. 번역이 없으면 원문 폴백(무회귀).
 */

import { callAI, isAiConfigured } from "@fomo/shared";
import { readFeedContent, readFeedContentByPrefix, writeFeedContent } from "./feed-content-store";
import { kstDate } from "./fomo";

const CACHE_PREFIX = "i18n:us-titles";
const MAX_TITLES_PER_RUN = 60;
const HANGUL = /[가-힣]/;

interface KoreanTitleMap {
  /** 기사 url → 자연스러운 한국어 제목. */
  map: Record<string, string>;
  updatedAt: string;
}

// 요청 경로에서 동기 조회하기 위한 모듈 캐시(daily-30·feed-hub 는 캐시라 회당 1회만 hydrate).
const koCache = new Map<string, string>();
let hydratedAt = 0;

/** 저장된 번역을 모듈 맵으로 적재. 60초 스로틀(중복 DB 읽기 방지). fail-open. */
export async function hydrateKoreanTitles(): Promise<void> {
  if (Date.now() - hydratedAt < 60_000 && koCache.size > 0) return;
  try {
    const rows = await readFeedContentByPrefix<KoreanTitleMap>(CACHE_PREFIX, 3);
    for (const { row } of rows) {
      if (!row?.map) continue;
      for (const [url, ko] of Object.entries(row.map)) {
        if (typeof ko === "string" && ko.trim()) koCache.set(url, ko);
      }
    }
    hydratedAt = Date.now();
  } catch {
    // 캐시 부재/DB 오류 — 원문 폴백(무회귀).
  }
}

/** 동기 조회 — hydrate 이후 사용. 번역 없으면 undefined(호출부가 원문 폴백). */
export function koreanTitle(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return koCache.get(url);
}

/** 이미 한국어면 번역 불필요(한글 포함 여부로 판별). */
function looksKorean(text: string): boolean {
  return HANGUL.test(text);
}

function parseJsonArray(content: string): string[] | null {
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed.map((x) => (typeof x === "string" ? x : "")) : null;
  } catch {
    return null;
  }
}

/**
 * 크론 전용 — 미번역 US 기사 제목을 Groq로 배치 번역해 저장한다.
 * 이미 저장된 url 은 건너뛴다(증분). AI 미설정·실패 시 조용히 no-op(fail-open).
 * @returns 새로 번역·저장한 제목 수.
 */
/** 청크 크기 — 한 콜 60개는 개수 불일치로 전체 폐기되기 쉬움(2026-07-14 usDeck=75→translated=0 실측). */
const TRANSLATE_CHUNK_SIZE = 15;

async function translateChunk(chunk: ReadonlyArray<{ url: string; title: string }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const numbered = chunk.map((a, i) => `${i + 1}. ${a.title.replace(/\s+/g, " ").trim()}`).join("\n");
  const result = await callAI({
    trace: "content-i18n",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "너는 금융 뉴스 헤드라인을 자연스러운 한국어로 번역한다. 티커·기업명·숫자·통화는 그대로 유지하고, " +
          "직역투가 아닌 한국 경제뉴스체로 옮긴다. 매수/매도/예측 표현을 새로 넣지 말고 사실만 옮긴다. " +
          '입력과 동일한 개수·순서의 JSON 문자열 배열만 출력한다. 예: ["번역1","번역2"]',
      },
      { role: "user", content: numbered },
    ],
  }).catch(() => ({ ok: false as const, content: "" }));
  if (!result.ok || !result.content) return out;
  const translated = parseJsonArray(result.content);
  // 개수 불일치면 이 청크만 폐기 — 순서 어긋난 매핑(다른 기사 제목이 붙는 오염)은 절대 금지.
  if (!translated || translated.length !== chunk.length) return out;
  for (let i = 0; i < chunk.length; i += 1) {
    const ko = (translated[i] ?? "").replace(/\s+/g, " ").trim();
    if (ko && looksKorean(ko)) out.set(chunk[i]!.url, ko);
  }
  return out;
}

export async function translateAndStoreUsTitles(articles: ReadonlyArray<{ url: string; title: string; lang?: string }>): Promise<number> {
  if (!isAiConfigured()) return 0;
  const date = kstDate();
  const existing = (await readFeedContent<KoreanTitleMap>(`${CACHE_PREFIX}:${date}`))?.map ?? {};
  const pending = articles
    .filter((a) => a.url && a.title && (a.lang ?? "en") === "en" && !looksKorean(a.title) && !existing[a.url])
    .filter((a, index, arr) => arr.findIndex((x) => x.url === a.url) === index)
    .slice(0, MAX_TITLES_PER_RUN);
  if (pending.length === 0) return 0;

  // 청크 순차 번역 — 한 청크 실패가 나머지를 깎아먹지 않는다(부분 성공 허용).
  const map: Record<string, string> = { ...existing };
  let added = 0;
  for (let start = 0; start < pending.length; start += TRANSLATE_CHUNK_SIZE) {
    const chunk = pending.slice(start, start + TRANSLATE_CHUNK_SIZE);
    const translated = await translateChunk(chunk);
    for (const [url, ko] of translated) {
      map[url] = ko;
      added += 1;
    }
  }
  if (added > 0) {
    await writeFeedContent(`${CACHE_PREFIX}:${date}`, { map, updatedAt: new Date().toISOString() } satisfies KoreanTitleMap);
  }
  return added;
}
