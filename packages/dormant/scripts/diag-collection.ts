/**
 * 수집 진단(Phase 0) — 테마별 수집 0건의 원인을 (i)구조적/(ii)일시적/(iii)실부재로 분류.
 *
 * 순서: 대조군(반도체)→의심(조선·자동차)→대조군(바이오). 앞뒤 대조군이 정상인데
 * 중간이 0이면 소스 장애가 아니라 테마→소스 매핑 공백(구조적).
 * LLM 불필요(수집만). 실행: npm run diag:collection  (또는 tsx scripts/diag-collection.ts [테마...])
 *
 * 근본 레버: 뉴스 = THEME_DICTIONARY(packages/fomo-core/src/keyword-cards/extract.ts),
 *           종토방 = THEME_NAVER_CODES(apps/web/lib/theme-understanding.ts).
 */
import { extractKeywords, type KeywordSourceItem } from "@fomo/core";
import { collectThemeDocs, themeNaverCodesFor } from "../apps/web/lib/theme-understanding";
import { fetchAllNews } from "../apps/web/lib/fomo-news-sources";
import { fetchUsMarketDiagnostics } from "../apps/web/lib/us-market-source";

const ARGS = process.argv.slice(2);
const COUNTRY_ARG = ARGS.find((arg) => arg.startsWith("--country="))?.split("=")[1]?.toUpperCase();
const COUNTRY = COUNTRY_ARG ?? (process.env.DISCOVERY_COUNTRY ?? "KR").toUpperCase();
const THEMES = ARGS.filter((arg) => !arg.startsWith("--")).length > 0 ? ARGS.filter((arg) => !arg.startsWith("--")) : ["반도체", "조선", "자동차", "바이오"];
const CONTROLS = new Set(["반도체", "바이오"]); // 소스 건강성 기준선

interface Row {
  theme: string;
  naverCodes: number;
  total: number;
  news: number;
  community: number;
  official: number;
}

async function main(): Promise<void> {
  if (COUNTRY === "US") {
    const diag = await fetchUsMarketDiagnostics();
    console.log("=== US 동적 발견 유니버스 ===");
    console.log(`source=${diag.source}`);
    console.log(`seedCount=${diag.seedCount}`);
    console.log(`moverSymbols=${diag.moverSymbols}`);
    console.log(`quoteSymbols=${diag.quoteSymbols}`);
    console.log(`rows=${diag.rows}`);
    console.log(`rowsWithPrice=${diag.rowsWithPrice}`);
    console.log(`rowsWithSparkline=${diag.rowsWithSparkline}`);
    console.log(`dynamicRows=${diag.dynamicRows}`);
    console.log(`strongMomentumRows=${diag.strongMomentumRows}`);
    process.exit(0);
  }

  // 1) 뉴스 소스 건강성 + 매칭 가능한 키워드 버킷(한 번만 호출).
  console.log("=== 뉴스 소스 건강성 / 키워드 버킷 ===");
  let bucketKeywords = new Set<string>();
  try {
    const news = await fetchAllNews();
    const items: KeywordSourceItem[] = news.map((a) => ({
      title: a.title,
      ...(a.summary ? { summary: a.summary } : {}),
      publishedAt: a.publishedAt,
      source: a.source,
      lang: a.lang,
    }));
    const buckets = extractKeywords(items)
      .map((k) => ({ keyword: k.keyword, n: k.articles.length }))
      .sort((a, b) => b.n - a.n);
    bucketKeywords = new Set(buckets.map((b) => b.keyword));
    console.log(`fetchAllNews: ${news.length}건 (소스 정상)`);
    console.log(`매칭 키워드 버킷 ${buckets.length}개: ${buckets.map((b) => `${b.keyword}(${b.n})`).join(", ")}`);
  } catch (err) {
    console.log(`fetchAllNews REJECTED: ${(err as Error)?.message}`);
  }

  // 2) 테마별 실제 collectThemeDocs 결과를 kind 로 분해.
  console.log("\n=== 테마별 collectThemeDocs (kind 분해) ===");
  const rows: Row[] = [];
  for (const theme of THEMES) {
    const docs = await collectThemeDocs(theme);
    const naverCodes = themeNaverCodesFor(theme).length;
    const byKind = new Map<string, number>();
    for (const d of docs) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1);
    const row: Row = {
      theme,
      naverCodes,
      total: docs.length,
      news: byKind.get("news") ?? 0,
      community: byKind.get("community") ?? 0,
      official: byKind.get("official") ?? 0,
    };
    rows.push(row);
    console.log(
      `  ${theme.padEnd(6)} codes=${row.naverCodes}  total=${row.total}  news=${row.news}  community=${row.community}  official=${row.official}`
    );
  }

  // 3) 분류 판정.
  console.log("\n=== 판정 ===");
  const controlsOk = rows.filter((r) => CONTROLS.has(r.theme)).every((r) => r.total > 0);
  for (const r of rows) {
    if (r.total > 0) {
      console.log(`  ${r.theme}: 정상(${r.total}건)`);
    } else if (controlsOk && !bucketKeywords.has(r.theme) && r.naverCodes === 0) {
      console.log(`  ${r.theme}: (i) 구조적 매핑 공백 — 소스 정상인데 테마 버킷/종토방코드 없음`);
    } else if (controlsOk && r.naverCodes === 0) {
      console.log(`  ${r.theme}: (i) 구조적 종토방 매핑 공백 — 뉴스 버킷은 있으나 대표 종목 코드 없음`);
    } else if (controlsOk && !bucketKeywords.has(r.theme)) {
      console.log(`  ${r.theme}: (i) 구조적 뉴스 버킷 공백 — 종토방 코드는 있으나 뉴스 키워드 매칭 없음`);
    } else if (!controlsOk) {
      console.log(`  ${r.theme}: (ii) 일시적 의심 — 대조군도 실패(소스 장애/레이트리밋)`);
    } else {
      console.log(`  ${r.theme}: (iii) 실부재 가능 — 소스·버킷 정상이나 오늘 원문 0`);
    }
  }
  process.exit(0);
}

void main();
