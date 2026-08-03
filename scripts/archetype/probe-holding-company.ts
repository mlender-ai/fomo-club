/**
 * WO-SUB-02R B1 — 지주회사 식별 축 실측 프로브.
 *
 * ## 왜 필요한가
 *
 * 전수 데이터(2,686종목)로 확인된 사실: **지주회사는 업종 축으로 식별되지 않는다.**
 * 네이버 `복합기업` 18종목은 지주회사가 아니라 다각화 사업회사(두산·삼성물산·효성·코오롱)이고,
 * 이름 패턴(`지주|홀딩스`)으로 잡은 92종목은 식품 10·철강 8·제약 7·은행 6 … 으로 흩어져 있다.
 * 층화를 잘게 해도 층으로 떠오르지 않는다 — **축이 다른 문제**다.
 *
 * 549종목 수집을 시작하기 전에 식별 축을 확정해야 한다. 다 모은 뒤에 "지주회사 유형이
 * 성립하는지 판정할 표본이 없다"가 되면 수집을 다시 해야 한다.
 *
 * ## 이 프로브가 답하는 것 (경로 2)
 *
 * DART `company.json` 의 `induty_code`(표준산업분류)가 지주회사를 분리하는가.
 * **추측하지 않고 응답을 본다** — WO-SUB-00 의 규칙("확보율 세기 전에 구조 먼저")을 따른다.
 * 우리 코드는 이 엔드포인트를 한 번도 호출한 적이 없어서 필드 구조조차 미확인이다.
 *
 * 판정 기준: 지주회사군과 비지주군의 `induty_code` 가 **겹치지 않으면** 경로 2가 성립한다.
 * 겹치면 이름 패턴(경로 1)이나 공정위 목록(경로 3)으로 내려간다.
 *
 * 로컬에서는 못 돈다(DART 키 없음) — `holding-company-probe.yml` 로 실행한다.
 */

const DART_BASE = "https://opendart.fss.or.kr/api";
const TIMEOUT_MS = 20_000;
/** DART 는 분당 한도를 공개하지 않는다. 프로브라 보수적으로 순차 + 지연. */
const DELAY_MS = 400;

/**
 * 표본. **정답 라벨을 사람이 붙였다** — 이 프로브는 `induty_code` 가 그 라벨을
 * 재현하는지 보는 것이고, 라벨 자체를 DART 에서 가져오면 순환이 된다.
 *
 * `expected` 는 "지주회사 체제의 지배회사인가"다. 사업지주(두산·CJ)도 지주로 본다 —
 * 02R 이 묻는 것은 "NAV 대비 할인으로 봐야 하는가"이고 사업지주도 그 성질을 갖는다.
 */
const SAMPLE: ReadonlyArray<{ code: string; name: string; expected: "지주" | "비지주" }> = [
  { code: "034730", name: "SK", expected: "지주" },
  { code: "003550", name: "LG", expected: "지주" },
  { code: "004990", name: "롯데지주", expected: "지주" },
  { code: "001040", name: "CJ", expected: "지주" },
  { code: "000150", name: "두산", expected: "지주" },
  { code: "105560", name: "KB금융", expected: "지주" },
  { code: "138930", name: "BNK금융지주", expected: "지주" },
  { code: "005490", name: "POSCO홀딩스", expected: "지주" },
  { code: "005930", name: "삼성전자", expected: "비지주" },
  { code: "000660", name: "SK하이닉스", expected: "비지주" },
  { code: "035420", name: "NAVER", expected: "비지주" },
  { code: "068270", name: "셀트리온", expected: "비지주" },
  { code: "011200", name: "HMM", expected: "비지주" },
  { code: "005380", name: "현대차", expected: "비지주" },
  { code: "051910", name: "LG화학", expected: "비지주" },
  { code: "000100", name: "유한양행", expected: "비지주" },
];

interface CompanyResponse {
  status?: string;
  message?: string;
  corp_name?: string;
  corp_cls?: string;
  induty_code?: string;
  est_dt?: string;
  [key: string]: unknown;
}

async function fetchCompany(corpCode: string, key: string): Promise<CompanyResponse | null> {
  const url = `${DART_BASE}/company.json?crtfc_key=${key}&corp_code=${corpCode}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(
    () => null
  );
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as CompanyResponse | null;
}

async function main(): Promise<void> {
  const key = process.env["DART_API_KEY"] ?? process.env["DART_CRTFC_KEY"] ?? "";
  if (!key) {
    console.error("[B1] DART_API_KEY 없음 — 이 프로브는 CI 에서만 돈다");
    process.exit(1);
  }

  // corp_code 매핑이 필요하다. 기존 어댑터를 쓰지 않고 여기서 직접 받는다 —
  // 프로브가 앱 코드에 의존하면 앱 변경이 프로브 결과를 바꾼다.
  const { fetchCorpCodeMap } = await import("../../apps/web/lib/fundamentals/dart-discovery");
  const map = await fetchCorpCodeMap(key, { refresh: false });
  console.log(`[B1] corp_code 매핑 ${map.byStockCode.size}건`);

  const rows: Array<{ name: string; expected: string; industry: string; corpCls: string; raw: CompanyResponse | null }> = [];
  let firstKeys: string[] = [];

  for (const entry of SAMPLE) {
    const corpCode = map.byStockCode.get(entry.code);
    if (!corpCode) {
      rows.push({ name: entry.name, expected: entry.expected, industry: "(corp_code 없음)", corpCls: "-", raw: null });
      continue;
    }
    const body = await fetchCompany(corpCode, key);
    if (firstKeys.length === 0 && body) firstKeys = Object.keys(body);
    rows.push({
      name: entry.name,
      expected: entry.expected,
      industry: body?.status === "000" ? (body.induty_code ?? "(필드 없음)") : `(status ${body?.status ?? "네트워크"})`,
      corpCls: body?.corp_cls ?? "-",
      raw: body,
    });
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log("\n=== 응답 필드 (구조 먼저) ===");
  console.log(firstKeys.join(", ") || "(응답 없음)");

  console.log("\n=== 표본별 induty_code ===");
  console.log("| 종목 | 사람 라벨 | induty_code | corp_cls |");
  console.log("|---|---|---|---|");
  for (const row of rows) console.log(`| ${row.name} | ${row.expected} | \`${row.industry}\` | ${row.corpCls} |`);

  const codesOf = (label: string) =>
    new Set(rows.filter((r) => r.expected === label && /^\d+$/.test(r.industry)).map((r) => r.industry));
  const holding = codesOf("지주");
  const notHolding = codesOf("비지주");
  const overlap = [...holding].filter((code) => notHolding.has(code));

  console.log("\n=== 판정 ===");
  console.log("지주군 코드:", [...holding].sort().join(", ") || "(없음)");
  console.log("비지주군 코드:", [...notHolding].sort().join(", ") || "(없음)");
  console.log("겹치는 코드:", overlap.join(", ") || "없음");
  if (holding.size === 0) {
    console.log("→ ❌ 경로 2 불가: 지주군에서 induty_code 를 하나도 못 받았다");
  } else if (overlap.length === 0) {
    console.log("→ ✅ 경로 2 성립: induty_code 가 두 군을 분리한다. 이 코드 집합을 지주회사 플래그로 쓴다");
  } else {
    console.log("→ ⚠️ 경로 2 부분 성립: 겹치는 코드가 있다. 단독 판정 불가 — 이름 패턴과 AND 로 쓰거나 경로 3으로 간다");
  }
}

main().catch((error) => {
  console.error("[B1] 실패", error);
  process.exit(1);
});
