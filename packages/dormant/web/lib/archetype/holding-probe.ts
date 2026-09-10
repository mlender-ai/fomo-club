import { fetchCorpCodeMap } from "../fundamentals/dart-discovery";

/**
 * WO-SUB-02R B1 — 지주회사 식별 축 실측 (경로 2: DART `company.json` 의 `induty_code`).
 *
 * ## 왜 백엔드에서 도는가
 *
 * `DART_API_KEY` 는 **GitHub 시크릿에 없다**(실측 2026-08-03: 목록에 부재). Vercel 환경변수에만
 * 있어서, 워크플로가 `secrets.DART_API_KEY` 를 참조해도 빈 값이 온다 —
 * `substance-audit`·`business-context-goldenset` 세 배치 로그 모두 `DART_API_KEY:` 가 비어 있었다.
 * 그래서 키가 실제로 있는 곳(Vercel 런타임)에서 돌린다. 팩트시트 백필이 같은 이유로 같은 방식이다.
 *
 * ## 무엇을 답하는가
 *
 * 전수 데이터(2,686종목)로 확인된 사실: **지주회사는 업종 축으로 식별되지 않는다.**
 * 네이버 `복합기업` 18종목은 지주회사가 아니라 다각화 사업회사(두산·삼성물산·효성·코오롱)이고,
 * 이름 패턴(`지주|홀딩스`) 92종목은 식품 10·철강 8·제약 7·은행 6 … 으로 흩어져 있다.
 * 층화를 잘게 해도 층으로 떠오르지 않는다 — 축이 다른 문제다.
 *
 * `induty_code`(표준산업분류)가 두 군을 분리하면 그것을 지주회사 플래그로 쓴다.
 * 겹치면 이름 패턴과 AND 로 쓰거나 공정위 지정 목록(경로 3)으로 내려간다.
 *
 * **추측하지 않고 응답을 본다** — 이 엔드포인트는 우리 코드가 한 번도 호출한 적이 없어
 * 필드 구조조차 미확인이다(WO-SUB-00 규칙: 확보율 세기 전에 구조 먼저).
 */

const DART_BASE = "https://opendart.fss.or.kr/api";
const TIMEOUT_MS = 20_000;
/** DART 는 분당 한도를 공개하지 않는다. 프로브라 순차 + 지연으로 보수적으로 간다. */
const DELAY_MS = 350;

/**
 * 표본. **정답 라벨을 사람이 붙였다** — DART 에서 라벨을 가져오면 순환이 된다.
 *
 * `expected` 는 "지주회사 체제의 지배회사인가"다. 사업지주(두산·CJ)도 지주로 본다 —
 * 02R 이 묻는 것은 "NAV 대비 할인으로 봐야 하는가"이고 사업지주도 그 성질을 갖는다.
 */
export const HOLDING_PROBE_SAMPLE: ReadonlyArray<{ code: string; name: string; expected: "지주" | "비지주" }> = [
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

export interface HoldingProbeRow {
  code: string;
  name: string;
  expected: "지주" | "비지주";
  /** DART 가 준 표준산업분류. 못 받으면 사유 문자열이 들어온다. */
  induty_code: string | null;
  induty_note: string | null;
  corp_cls: string | null;
  corp_name: string | null;
}

export type HoldingProbeVerdict = "path2_ok" | "path2_partial" | "path2_unavailable";

export interface HoldingProbeResult {
  generatedAt: string;
  /** 응답 필드 목록 — 구조 실측 기록. 우리 코드가 처음 보는 엔드포인트다. */
  responseKeys: string[];
  rows: HoldingProbeRow[];
  holdingCodes: string[];
  nonHoldingCodes: string[];
  overlapCodes: string[];
  /** 지주군에서 2회 이상 나오고 비지주군에 없는 코드 — 플래그로 쓸 수 있는 것. */
  flagCodes: string[];
  /** 1회만 나와 업종 코드와 구분되지 않는 코드 — 플래그로 쓰면 오탐한다. */
  inconclusiveCodes: string[];
  verdict: HoldingProbeVerdict;
  note: string;
  errors: string[];
}

interface CompanyResponse {
  status?: string;
  message?: string;
  corp_name?: string;
  corp_cls?: string;
  induty_code?: string;
  [key: string]: unknown;
}

async function fetchCompany(corpCode: string, key: string): Promise<CompanyResponse | null> {
  const query = new URLSearchParams({ crtfc_key: key, corp_code: corpCode });
  const res = await fetch(`${DART_BASE}/company.json?${query}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as CompanyResponse | null;
}

export async function probeHoldingCompanyAxis(): Promise<HoldingProbeResult> {
  const key = (process.env["DART_API_KEY"] ?? process.env["DART_CRTFC_KEY"] ?? "").trim();
  const errors: string[] = [];
  const now = new Date().toISOString();
  if (!key) {
    return {
      generatedAt: now,
      responseKeys: [],
      rows: [],
      holdingCodes: [],
      nonHoldingCodes: [],
      overlapCodes: [],
      flagCodes: [],
      inconclusiveCodes: [],
      verdict: "path2_unavailable",
      note: "DART_API_KEY 없음 — 이 런타임에 키가 설정되지 않았다",
      errors: ["dart: 키 없음"],
    };
  }

  const map = await fetchCorpCodeMap(key, {});
  if (map.error) errors.push(`corpcode: ${map.error}`);

  const rows: HoldingProbeRow[] = [];
  let responseKeys: string[] = [];
  for (const entry of HOLDING_PROBE_SAMPLE) {
    const corpCode = map.byStockCode.get(entry.code);
    if (!corpCode) {
      rows.push({ ...entry, induty_code: null, induty_note: "corp_code 없음", corp_cls: null, corp_name: null });
      continue;
    }
    const body = await fetchCompany(corpCode, key);
    if (responseKeys.length === 0 && body) responseKeys = Object.keys(body).sort();
    const ok = body?.status === "000";
    const code = ok ? (body?.induty_code ?? null) : null;
    rows.push({
      ...entry,
      induty_code: code,
      induty_note: ok ? (code === null ? "induty_code 필드 없음" : null) : `status ${body?.status ?? "네트워크"}`,
      corp_cls: body?.corp_cls ?? null,
      corp_name: body?.corp_name ?? null,
    });
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  const codesOf = (label: "지주" | "비지주") =>
    new Set(rows.filter((row) => row.expected === label && row.induty_code !== null).map((row) => row.induty_code!));
  const holding = codesOf("지주");
  const nonHolding = codesOf("비지주");
  const overlap = [...holding].filter((code) => nonHolding.has(code)).sort();

  /**
   * 판정은 여기서 한다 — 소비자가 각자 해석하면 기준이 갈린다.
   *
   * **"겹침 없음" 을 성립 근거로 쓰지 않는다.** 표본이 16종목이라, 지주 한 곳에서만 나온
   * 코드는 그 회사의 **업종 코드**일 수 있고 겹치지 않은 것은 비지주 표본이 그 업종을
   * 안 담았기 때문일 수 있다. 실측이 정확히 그랬다 — POSCO홀딩스 `2411`(제철)·
   * 두산 `26221`(전자부품)이 지주군 단독으로 나왔지만, 시장에는 철강 54종목·
   * 전자장비 97종목이 있어 그 코드를 지주 플래그로 쓰면 제조사를 대량 오탐한다.
   *
   * 그래서 **지주군에서 2회 이상 나오고 비지주군에 없는 코드**만 플래그 후보로 인정한다.
   * 1회만 나온 코드는 판단 불가로 남긴다(업종 코드와 구분되지 않는다).
   */
  const holdingCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.expected !== "지주" || row.induty_code === null) continue;
    holdingCounts.set(row.induty_code, (holdingCounts.get(row.induty_code) ?? 0) + 1);
  }
  const flagCodes = [...holdingCounts.entries()]
    .filter(([code, count]) => count >= 2 && !nonHolding.has(code))
    .map(([code]) => code)
    .sort();
  const inconclusive = [...holdingCounts.entries()]
    .filter(([, count]) => count < 2)
    .map(([code]) => code)
    .sort();
  const holdingSamples = rows.filter((row) => row.expected === "지주").length;
  const covered = rows.filter((row) => row.expected === "지주" && row.induty_code !== null && flagCodes.includes(row.induty_code)).length;

  let verdict: HoldingProbeVerdict;
  let note: string;
  if (flagCodes.length === 0) {
    verdict = "path2_unavailable";
    note =
      holding.size === 0
        ? "지주군에서 induty_code 를 하나도 못 받았다 — 경로 2 불가"
        : `지주군 코드가 전부 1회씩만 나왔다(${inconclusive.join(", ")}) — 업종 코드와 구분되지 않아 플래그로 쓸 수 없다`;
  } else if (covered === holdingSamples) {
    verdict = "path2_ok";
    note = `${flagCodes.join(", ")} 가 지주 표본 전부를 덮는다 — 단독 플래그로 쓴다`;
  } else {
    verdict = "path2_partial";
    note =
      `${flagCodes.join(", ")} 가 지주 표본 ${covered}/${holdingSamples} 를 덮는다. ` +
      `나머지는 사업 업종으로 분류돼(${inconclusive.join(", ")}) 이 축으로 못 잡는다 — ` +
      `이름 패턴과 **OR** 로 합치고, 둘 다 안 걸리는 사업지주는 결손으로 기록한다`;
  }

  return {
    generatedAt: now,
    responseKeys,
    rows,
    holdingCodes: [...holding].sort(),
    nonHoldingCodes: [...nonHolding].sort(),
    overlapCodes: overlap,
    flagCodes,
    inconclusiveCodes: inconclusive,
    verdict,
    note,
    errors,
  };
}
