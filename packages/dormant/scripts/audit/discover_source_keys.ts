/**
 * WO-SUB-00 §4-3 보조 — **소스 응답의 실제 키를 먼저 본다.**
 *
 * 1차 실측에서 여러 셀이 0% 로 나왔는데, 그중 상당수가 "소스에 없다"가 아니라
 * "우리 파서가 키를 잘못 짚었다"일 수 있었다. 추측한 키로 센 확보율은 커버리지가 아니라 잡음이다.
 * 그래서 매트릭스를 채우기 전에 응답 구조를 덤프해 근거를 만든다.
 *
 * 이 스크립트는 판정하지 않는다 — 구조만 보여준다.
 */

const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SEC_UA = process.env.SEC_USER_AGENT || "FOMO Club research contact@fomoclub.app";

async function show(label: string, url: string, headers: Record<string, string> = {}, depth = 2): Promise<void> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(20_000) });
    console.log(`\n### ${label}\n${url}\n→ HTTP ${res.status} (${res.headers.get("content-type") ?? "?"})`);
    if (!res.ok) {
      console.log(`   본문 앞부분: ${(await res.text()).slice(0, 200)}`);
      return;
    }
    const json = (await res.json()) as unknown;
    console.log(outline(json, depth));
  } catch (error) {
    console.log(`\n### ${label}\n${url}\n→ 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 값은 짧게, 키 구조는 깊이 제한으로 보여준다. */
function outline(value: unknown, depth: number, indent = "  "): string {
  if (value === null) return `${indent}null`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${indent}[] (0개)`;
    return `${indent}[${value.length}개] 첫 원소:\n${outline(value[0], depth - 1, `${indent}  `)}`;
  }
  if (typeof value === "object") {
    if (depth <= 0) return `${indent}{${Object.keys(value as object).slice(0, 30).join(", ")}}`;
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([k, v]) => {
        if (v !== null && typeof v === "object") return `${indent}${k}:\n${outline(v, depth - 1, `${indent}  `)}`;
        return `${indent}${k}: ${JSON.stringify(v)?.slice(0, 120)}`;
      })
      .join("\n");
  }
  return `${indent}${JSON.stringify(value)?.slice(0, 120)}`;
}

async function main(): Promise<void> {
  const usSymbol = process.argv[2] ?? "CLBK";
  const krCode = process.argv[3] ?? "185750"; // 종근당

  console.log(`== 키 구조 덤프 — US ${usSymbol} / KR ${krCode} ==`);

  await show("Nasdaq summary", `https://api.nasdaq.com/api/quote/${usSymbol}/summary?assetclass=stocks`, {
    "User-Agent": NASDAQ_UA,
  });
  await show("Nasdaq analyst/earnings-forecast", `https://api.nasdaq.com/api/analyst/${usSymbol}/earnings-forecast`, {
    "User-Agent": NASDAQ_UA,
  }, 3);
  await show("Nasdaq historical(5y)", `https://api.nasdaq.com/api/quote/${usSymbol}/historical?assetclass=stocks&fromdate=2021-07-26&todate=2026-07-26&limit=100`, {
    "User-Agent": NASDAQ_UA,
  }, 3);
  await show("Naver basic", `https://m.stock.naver.com/api/stock/${krCode}/basic`, {}, 2);
  await show("Naver integration", `https://m.stock.naver.com/api/stock/${krCode}/integration`, {}, 2);
  await show("Naver finance/quarter", `https://m.stock.naver.com/api/stock/${krCode}/finance/quarter`, {}, 3);
  await show("SEC company_tickers", "https://www.sec.gov/files/company_tickers.json", { "User-Agent": SEC_UA }, 1);
}

main().catch((error) => {
  console.error("[discover] 실패", error);
  process.exit(1);
});
