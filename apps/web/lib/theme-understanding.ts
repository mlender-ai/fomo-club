import {
  extractKeywords,
  extractStocks,
  stockDef,
  stockMatchesText,
  buildThemeInsightPrompt,
  buildStockInsightPrompt,
  parseThemeInsightResponse,
  assembleThemeInsight,
  emptyThemeInsight,
  fetchNaverBoardPosts,
  fetchSubredditPosts,
  DEFAULT_SUBREDDITS,
  type SourceDoc,
  type ThemeInsight,
  type KeywordSourceItem,
  type ExtractedStock,
  type WordingVerdict,
  type OfficialFact,
} from "@fomo/core";
import { callAI, isAiConfigured } from "@fomo/shared";
import { fetchAllNews, fetchNaverCompanyResearch, fetchNaverStockNews } from "./fomo-news-sources";
import { fetchFredDocs } from "./fred";
import { fetchDcStockTitles } from "./dcinside";
import { fetchDartDisclosuresForCode } from "./dart-disclosures";

/**
 * 이해 레이어 오케스트레이션 — DATA_ENGINE_STRATEGY §4 Track A. (네트워크 + LLM)
 *
 * 기존 수집(뉴스 RSS + 네이버 종토방)이 가져온 *원문*을 모아 LLM 에이전트가 읽고 구조화한다.
 * 순수 가공·가드(grounding/투자조언/균형)는 @fomo/core(assembleThemeInsight)에 위임 — 여기는 수집+호출만.
 *
 * 정직성: AI 미설정·실패·원문 부족 → emptyThemeInsight(정직한 빈 상태). 가짜 생성 금지.
 */

// 한 테마만 깊게 보는 PoC → 품질 우선 본 모델. 충실 추출 위해 온도 낮게.
const MODEL = process.env["AI_MODEL"] || "openai/gpt-4.1";
const TEMPERATURE = Number.parseFloat(process.env["AI_TEMPERATURE"] ?? "") || 0.2;

const MAX_NEWS = 12;
const MAX_COMMUNITY = 10;

export interface StockUnderstandingOptions {
  naverCode?: string;
  market?: string;
  country?: string;
}

/** 테마 → 종토방 종목코드(원문 커뮤니티 수집 대상). 지금은 반도체만(PoC). */
const THEME_NAVER_CODES: Record<string, { code: string; label: string }[]> = {
  반도체: [
    { code: "005930", label: "삼성전자" },
    { code: "000660", label: "SK하이닉스" },
  ],
};


/** 뉴스 + 종토방 원문을 SourceDoc[] 로(제목·본문 보존, S1.. 식별자 부여). */
export async function collectThemeDocs(theme: string): Promise<SourceDoc[]> {
  const codes = THEME_NAVER_CODES[theme] ?? [];

  const [newsRes, dcRes, ...commRes] = await Promise.allSettled([
    fetchAllNews(),
    fetchDcStockTitles(),
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
      ...(a.tier ? { tier: a.tier } : {}),
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
        tier: art.tier ?? "news-mid",
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
          tier: "community-mid", // 종토방 = 개미 본진(§4.5)
        });
      }
    } else if (r && r.status === "rejected") {
      console.warn("[theme-understanding] community error", c.label, r.reason);
    }
  });

  // 디시 주식갤러리(C-3) — 날것 심리(community-low). 테마 관련 글만 필터(기존 extract 재사용).
  // 욕설·단정은 워딩 필터(룰+LLM)가 카드 진입 전 거른다.
  if (dcRes.status === "fulfilled" && dcRes.value.length > 0) {
    const dcItems: KeywordSourceItem[] = dcRes.value.map((t) => ({ title: t }));
    const dcBucket = extractKeywords(dcItems).find((k) => k.keyword === theme);
    for (const art of (dcBucket?.articles ?? []).slice(0, 6)) {
      docs.push({
        id: nextId(),
        kind: "community",
        title: art.title,
        source: "디시 주식갤러리",
        tier: "community-low",
      });
    }
  } else if (dcRes.status === "rejected") {
    console.warn("[theme-understanding] dcinside error", dcRes.reason);
  }

  // 공식 데이터(FRED) — 금리·거시 테마에 연준 공식 숫자(official-high). grounding 강화(C-2).
  try {
    docs.push(...(await fetchFredDocs(theme, nextId)));
  } catch (err) {
    console.warn("[theme-understanding] fred error", err);
  }

  return docs;
}

/**
 * 워딩 안전 LLM 판정(2단계) — 룰 필터(assemble)를 통과한 워딩을 한 번 더 본다.
 * 거를 것: 욕설/혐오/정치선동/개인비방/특정종목 단정·매매권유/허위·찌라시. 살릴 것: 감정·심리 표현.
 * 애매하면 unsafe(안전 우선). 실패 시 룰 통과분 유지(이미 룰-세이프). 변조 없음 — 통과/탈락만 결정.
 */
async function judgeWordingsSafety(
  texts: readonly string[]
): Promise<Map<string, { safe: boolean; reason: string }>> {
  const out = new Map<string, { safe: boolean; reason: string }>();
  if (texts.length === 0) return out;
  const prompt = [
    "너는 투자 감정 앱의 커뮤니티 워딩 안전 심사관이다. 각 표현을 카드에 그대로 노출해도 되는지 판정해라.",
    "거를 것(safe=false): 욕설/비방/혐오, 정치 선동, 개인 비방, 특정 종목 단정('무조건 간다/판다')·매매 권유, 허위·찌라시('내부정보/카더라').",
    "살릴 것(safe=true): 투자자의 감정·심리를 드러내는 생생한 표현(예: '전강후약 쎄함', '존버 지친다').",
    "애매하면 safe=false(안전 우선). 표현을 고치지 말고 판정만.",
    '출력은 JSON 배열만: [{"text":"원문그대로","safe":true,"reason":"짧은 사유"}]',
    "",
    JSON.stringify(texts),
  ].join("\n");
  const res = await callAI({
    model: MODEL,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
    trace: "wording-judge",
  });
  if (!res.ok) return out; // 룰 통과분 유지(이미 룰-세이프)
  const content = res.content;
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end <= start) return out;
  try {
    const arr = JSON.parse(content.slice(start, end + 1)) as unknown;
    if (Array.isArray(arr)) {
      for (const r of arr) {
        if (r && typeof r === "object") {
          const o = r as Record<string, unknown>;
          const text = typeof o.text === "string" ? o.text.trim() : "";
          if (text) out.set(text, { safe: o.safe === true, reason: typeof o.reason === "string" ? o.reason : "" });
        }
      }
    }
  } catch (err) {
    console.warn("[wording-judge] parse error — 룰 통과분 유지", err);
  }
  return out;
}

/** 공식 데이터(FRED 등 kind=official) 원문을 중립 팩트 리스트로(방향성 주장 아님 — C-2). */
function officialFactsFrom(docs: readonly SourceDoc[]): OfficialFact[] {
  return docs
    .filter((d) => d.kind === "official" && d.source && d.tier)
    .map((d) => ({
      label: d.title,
      ...(d.body ? { detail: d.body } : {}),
      source: d.source!,
      ...(d.url ? { url: d.url } : {}),
      tier: d.tier!,
    }));
}

function validNaverCode(code: string | undefined | null): string | undefined {
  const c = code?.trim();
  return c && /^\d{6}$/.test(c) ? c : undefined;
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 개별 종목 원문 수집(B 트랙 §1) — 종목 *국적*에 맞는 소스를 연결한다.
 * - 한국 종목(종토방 코드 보유): 한국뉴스(종목명 필터) + 네이버 종토방 + 디시.
 * - 미국/글로벌 종목(엔비디아 등): 뉴스(종목명 필터) + **레딧 글 제목**(외신/해외 커뮤니티) + 디시.
 * grounding 가드 그대로 — 별칭(엔비디아=Nvidia=NVDA)이 원문에 실제 substring/단어경계로 존재하는 글만.
 */
export async function collectStockDocs(stock: string, opts: StockUnderstandingOptions = {}): Promise<SourceDoc[]> {
  const def = stockDef(stock);
  const code = validNaverCode(opts.naverCode) ?? def?.naverCode;
  const isForeign = def ? def.country !== "KR" : opts.country ? opts.country !== "KR" : false;
  const matches = (s: string) => {
    if (stockMatchesText(stock, s)) return true;
    return s.toLowerCase().includes(stock.trim().toLowerCase());
  };

  const [stockNewsRes, researchRes, dartRes, newsRes, dcRes, commRes, redditRes] = await Promise.allSettled([
    code ? fetchNaverStockNews(code, MAX_NEWS) : Promise.resolve([]),
    code ? fetchNaverCompanyResearch(code, stock, 6) : Promise.resolve([]),
    code ? fetchDartDisclosuresForCode(code, stock, todayKst()) : Promise.resolve([]),
    fetchAllNews(),
    fetchDcStockTitles(),
    code ? fetchNaverBoardPosts(code) : Promise.resolve([]),
    // 미국/글로벌 종목만 레딧 원문 수집(국내주는 종토방이 본진). 코인은 cryptocurrency 포함.
    isForeign
      ? Promise.allSettled(DEFAULT_SUBREDDITS.map((s) => fetchSubredditPosts(s))).then((rs) =>
          rs.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        )
      : Promise.resolve([]),
  ]);

  const docs: SourceDoc[] = [];
  let n = 0;
  const nextId = () => `S${++n}`;
  const seenNews = new Set<string>();
  const pushNews = (a: Awaited<ReturnType<typeof fetchAllNews>>[number]) => {
    const key = a.url || a.title;
    if (!key || seenNews.has(key)) return;
    seenNews.add(key);
    docs.push({
      id: nextId(),
      kind: "news",
      title: a.title,
      ...(a.summary ? { body: a.summary } : {}),
      ...(a.source ? { source: a.source } : {}),
      ...(a.url ? { url: a.url } : {}),
      ...(a.publishedAt ? { publishedAt: a.publishedAt } : {}),
      tier: a.tier ?? "news-mid",
    });
  };

  // 네이버 종목별 뉴스 — 전체 금융 RSS보다 종목 커버리지가 높아 stock-insight grounded 근거의 1순위 연료다.
  if (stockNewsRes.status === "fulfilled") {
    const hit = stockNewsRes.value
      .filter((a) => matches(`${a.title} ${a.summary ?? ""}`))
      .slice(0, MAX_NEWS);
    for (const a of hit) pushNews(a);
  } else {
    console.warn("[stock-understanding] naver stock news error", stockNewsRes.reason);
  }

  // 증권사 리서치 리포트 — 종목코드로 좁게 조회한 보고서 제목·증권사·PDF 링크. 무료 공개 HTML만 사용한다.
  if (researchRes.status === "fulfilled") {
    for (const a of researchRes.value.slice(0, 6)) pushNews(a);
  } else {
    console.warn("[stock-understanding] naver research error", stock, researchRes.reason);
  }

  // DART 공시 — 발견 이벤트에만 쓰지 않고 depth 공식 사실에도 합류시킨다.
  if (dartRes.status === "fulfilled") {
    for (const hit of dartRes.value.slice(0, 4)) {
      docs.push({
        id: nextId(),
        kind: "official",
        title: hit.label,
        body: `${hit.asOf} 접수 공시`,
        source: hit.source,
        publishedAt: hit.asOf,
        tier: "official-high",
      });
    }
  } else {
    console.warn("[stock-understanding] dart disclosure error", stock, dartRes.reason);
  }

  // 뉴스 — 종목명(별칭 포함)이 제목/요약에 등장하는 기사만.
  if (newsRes.status === "fulfilled") {
    const hit = newsRes.value.filter((a) => matches(`${a.title} ${a.summary ?? ""}`)).slice(0, MAX_NEWS);
    for (const a of hit) pushNews(a);
  } else {
    console.warn("[stock-understanding] news error", newsRes.reason);
  }

  // 종토방(국내 종목) — 그 종목 토론방 제목 원문.
  if (commRes.status === "fulfilled") {
    for (const post of commRes.value.slice(0, MAX_COMMUNITY)) {
      docs.push({
        id: nextId(),
        kind: "community",
        title: post.title,
        source: `네이버 종토방 ${stock}`,
        ...(post.tsMs ? { publishedAt: new Date(post.tsMs).toISOString() } : {}),
        tier: "community-mid",
      });
    }
  }

  // 레딧(미국/글로벌 종목) — 종목 별칭이 제목에 등장하는 글만. 해외 심리 grounding.
  if (redditRes.status === "fulfilled") {
    const hit = (redditRes.value as { title: string; tsMs: number }[])
      .filter((p) => matches(p.title))
      .slice(0, MAX_COMMUNITY);
    for (const p of hit) {
      docs.push({
        id: nextId(),
        kind: "community",
        title: p.title,
        source: "Reddit",
        ...(p.tsMs ? { publishedAt: new Date(p.tsMs).toISOString() } : {}),
        tier: "community-mid",
      });
    }
  }

  // 디시 — 종목명 언급 글만(community-low). 워딩 필터가 진입 전 거른다.
  if (dcRes.status === "fulfilled") {
    for (const t of dcRes.value.filter(matches).slice(0, 6)) {
      docs.push({ id: nextId(), kind: "community", title: t, source: "디시 주식갤러리", tier: "community-low" });
    }
  }

  return docs;
}

/**
 * 그날 테마 원문에 실제 등장한 종목 추출(B 트랙 §1) — 마스터 리스트 없이 "원문이 곧 필터".
 * 테마 docs(뉴스+커뮤니티)를 종목 어휘로 스캔 → 빈도 임계 이상만, market 동봉(시장 분리 훅).
 * 화면·표기(국기/시장 라벨)는 광혁 UI. 엔진은 데이터(종목·market·빈도)만 정확히 제공한다.
 */
export async function collectThemeStocks(
  theme: string,
  opts: { minMentions?: number } = {}
): Promise<ExtractedStock[]> {
  const docs = await collectThemeDocs(theme);
  const items: KeywordSourceItem[] = docs.map((d) => ({
    title: d.title,
    ...(d.body ? { summary: d.body } : {}),
  }));
  return extractStocks(items, opts);
}

/** 개별 종목 이해·구조화(작업3, BM 심장) — 테마와 동일 구조/가드. 자료 적으면 정직한 빈 상태. */
export async function understandStock(stock: string, opts: StockUnderstandingOptions = {}): Promise<ThemeInsight> {
  return runUnderstanding(stock, await collectStockDocs(stock, opts), "stock");
}

/**
 * 이해 코어(테마/종목 공용) — 수집된 docs 를 LLM 으로 읽고 grounding 검증(assemble) → 워딩 안전 판정.
 * subject 는 테마명 또는 종목명. 실패/미설정/빈 docs → 정직한 빈 상태.
 */
export async function runUnderstanding(
  subject: string,
  docs: SourceDoc[],
  kind: "theme" | "stock" = "theme"
): Promise<ThemeInsight> {
  if (docs.length === 0) return emptyThemeInsight(subject, "수집된 원문이 없음(소스 도달 실패 또는 매칭 0)");

  // 공식 지표 팩트(FRED) — LLM 결과와 별개로 항상 노출(있으면). 강세/약세로 해석하지 않는다.
  const officialFacts = officialFactsFrom(docs);
  const withFacts = (insight: ThemeInsight): ThemeInsight =>
    officialFacts.length > 0 ? { ...insight, officialFacts } : insight;

  if (!isAiConfigured()) {
    return withFacts(emptyThemeInsight(subject, "AI 미설정 — 이해 레이어 비활성(정직한 빈 상태)"));
  }

  try {
    const res = await callAI({
      model: MODEL,
      temperature: TEMPERATURE,
      timeoutMs: Number.parseInt(process.env["AI_UNDERSTANDING_TIMEOUT_MS"] ?? "", 10) || 45_000,
      trace: kind === "stock" ? "understanding-stock" : "understanding-theme",
      metadata: { subject, kind, docs: docs.length },
      messages: [
        {
          role: "user",
          content:
            kind === "stock"
              ? buildStockInsightPrompt(subject, docs)
              : buildThemeInsightPrompt(subject, docs),
        },
      ],
    });
    if (!res.ok) {
      return withFacts(emptyThemeInsight(subject, `LLM ${res.status} — 정직한 빈 상태`));
    }
    const raw = parseThemeInsightResponse(res.content);
    const insight = assembleThemeInsight(subject, docs, raw);

    // 2단계: 룰 통과 워딩을 LLM 으로 한 번 더 안전 판정(욕설/단정/혐오/찌라시 — 룰이 못 잡는 뉘앙스).
    if (insight.wordings.length === 0) return withFacts(insight);
    const judged = await judgeWordingsSafety(insight.wordings.map((w) => w.text));
    const llmAudit: WordingVerdict[] = insight.wordings.map((w) => {
      const v = judged.get(w.text);
      return {
        text: w.text,
        kept: v ? v.safe : true, // 판정 누락(LLM 실패) → 룰-세이프이므로 유지
        reason: v ? v.reason || "LLM 판정" : "LLM 판정 생략(폴백 — 룰 통과 유지)",
        stage: "llm",
      };
    });
    const safeWordings = insight.wordings.filter((w) => (judged.get(w.text)?.safe ?? true));
    const dropped = llmAudit.filter((a) => !a.kept);
    if (dropped.length > 0) {
      console.warn("[wording-judge] dropped:", dropped.map((d) => `"${d.text}"(${d.reason})`).join(" | "));
    }
    return withFacts({
      ...insight,
      wordings: safeWordings,
      wordingAudit: [...(insight.wordingAudit ?? []), ...llmAudit],
    });
  } catch (err) {
    console.warn("[understanding] error", err);
    return withFacts(emptyThemeInsight(subject, "이해 레이어 호출 실패 — 정직한 빈 상태"));
  }
}

/** 테마 이해·구조화 — 테마 docs 수집 후 공용 코어. */
export async function understandTheme(theme: string): Promise<ThemeInsight> {
  return runUnderstanding(theme, await collectThemeDocs(theme));
}
