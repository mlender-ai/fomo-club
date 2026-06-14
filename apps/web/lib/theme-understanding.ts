import {
  extractKeywords,
  buildThemeInsightPrompt,
  parseThemeInsightResponse,
  assembleThemeInsight,
  emptyThemeInsight,
  type SourceDoc,
  type ThemeInsight,
  type KeywordSourceItem,
} from "@fomo/core";
import { fetchNaverBoardPosts } from "@fomo/core";
import { fetchAllNews } from "./fomo-news-sources";

/**
 * 이해 레이어 오케스트레이션 — DATA_ENGINE_STRATEGY §4 Track A. (네트워크 + LLM)
 *
 * 기존 수집(뉴스 RSS + 네이버 종토방)이 가져온 *원문*을 모아 LLM 에이전트가 읽고 구조화한다.
 * 순수 가공·가드(grounding/투자조언/균형)는 @fomo/core(assembleThemeInsight)에 위임 — 여기는 수집+호출만.
 *
 * 정직성: AI 미설정·실패·원문 부족 → emptyThemeInsight(정직한 빈 상태). 가짜 생성 금지.
 */

const AI_API_URL = process.env["AI_API_URL"] ?? "";
// 한 테마만 깊게 보는 PoC → 품질 우선 본 모델. 충실 추출 위해 온도 낮게.
const MODEL = process.env["AI_MODEL"] || "openai/gpt-4.1";
const TEMPERATURE = Number.parseFloat(process.env["AI_TEMPERATURE"] ?? "") || 0.2;

const MAX_NEWS = 12;
const MAX_COMMUNITY = 10;

/** 테마 → 종토방 종목코드(원문 커뮤니티 수집 대상). 지금은 반도체만(PoC). */
const THEME_NAVER_CODES: Record<string, { code: string; label: string }[]> = {
  반도체: [
    { code: "005930", label: "삼성전자" },
    { code: "000660", label: "SK하이닉스" },
  ],
};

function resolveAiKey(): string {
  const configured = process.env["AI_API_KEY"] ?? "";
  if (!configured || configured.toUpperCase() === "USE_GITHUB_TOKEN") {
    return process.env["GITHUB_TOKEN"] ?? "";
  }
  return configured;
}

interface LlmResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** 뉴스 + 종토방 원문을 SourceDoc[] 로(제목·본문 보존, S1.. 식별자 부여). */
export async function collectThemeDocs(theme: string): Promise<SourceDoc[]> {
  const codes = THEME_NAVER_CODES[theme] ?? [];

  const [newsRes, ...commRes] = await Promise.allSettled([
    fetchAllNews(),
    ...codes.map((c) => fetchNaverBoardPosts(c.code)),
  ]);

  const docs: SourceDoc[] = [];
  let n = 0;
  const nextId = () => `S${++n}`;

  // 뉴스 — 해당 테마로 매칭된 기사만(기존 extract 재사용, 카운팅 아님 — 필터로만 사용).
  if (newsRes.status === "fulfilled") {
    const items: KeywordSourceItem[] = newsRes.value.map((a) => ({
      title: a.title,
      ...(a.summary ? { summary: a.summary } : {}),
      ...(a.url ? { url: a.url } : {}),
      publishedAt: a.publishedAt,
      source: a.source,
      lang: a.lang,
    }));
    const bucket = extractKeywords(items).find((k) => k.keyword === theme);
    for (const art of (bucket?.articles ?? []).slice(0, MAX_NEWS)) {
      docs.push({
        id: nextId(),
        kind: "news",
        title: art.title,
        ...(art.summary ? { body: art.summary } : {}),
        ...(art.source ? { source: art.source } : {}),
        ...(art.url ? { url: art.url } : {}),
        ...(art.publishedAt ? { publishedAt: art.publishedAt } : {}),
      });
    }
  } else {
    console.warn("[theme-understanding] news error", newsRes.reason);
  }

  // 커뮤니티(종토방) — 제목 원문 보존(개수가 아니라 내용).
  codes.forEach((c, i) => {
    const r = commRes[i];
    if (r && r.status === "fulfilled") {
      for (const post of r.value.slice(0, Math.ceil(MAX_COMMUNITY / codes.length))) {
        docs.push({
          id: nextId(),
          kind: "community",
          title: post.title,
          source: `네이버 종토방 ${c.label}`,
          ...(post.tsMs ? { publishedAt: new Date(post.tsMs).toISOString() } : {}),
        });
      }
    } else if (r && r.status === "rejected") {
      console.warn("[theme-understanding] community error", c.label, r.reason);
    }
  });

  return docs;
}

/** 테마 이해·구조화 — 수집 → LLM → grounding 검증(assemble). 실패 시 정직한 빈 상태. */
export async function understandTheme(theme: string): Promise<ThemeInsight> {
  const docs = await collectThemeDocs(theme);
  if (docs.length === 0) return emptyThemeInsight(theme, "수집된 원문이 없음(소스 도달 실패 또는 매칭 0)");

  const apiKey = resolveAiKey();
  if (!AI_API_URL || !apiKey) {
    return emptyThemeInsight(theme, "AI 미설정 — 이해 레이어 비활성(정직한 빈 상태)");
  }

  try {
    const res = await fetch(AI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: TEMPERATURE,
        messages: [{ role: "user", content: buildThemeInsightPrompt(theme, docs) }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.warn("[theme-understanding] LLM", res.status);
      return emptyThemeInsight(theme, `LLM ${res.status} — 정직한 빈 상태`);
    }
    const data = (await res.json()) as LlmResponse;
    const raw = parseThemeInsightResponse(data.choices?.[0]?.message?.content ?? "");
    return assembleThemeInsight(theme, docs, raw);
  } catch (err) {
    console.warn("[theme-understanding] error", err);
    return emptyThemeInsight(theme, "이해 레이어 호출 실패 — 정직한 빈 상태");
  }
}
