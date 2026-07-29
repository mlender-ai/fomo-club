/**
 * DART 응답 구조 덤프 (WO-SUB-00 규칙: **확보율을 세기 전에 구조를 먼저 덤프해 근거를 만든다**).
 *
 * `DART_API_KEY` 는 **Vercel 런타임에만** 있다(GH Actions Secrets·로컬에 없음).
 * 그래서 이 코드는 크론 라우트로 노출해 프로덕션 런타임에서 돌린다 —
 * 키를 읽을 수 없는 것과 키를 쓸 수 없는 것은 다르다.
 *
 * **판정하지 않는다.** 확보율·파서는 이 덤프를 근거로 그 다음에 만든다.
 *
 * ## corp_code 매핑을 zip 없이 얻는 방법
 *
 * `fnlttSinglAcnt*` 는 8자리 `corp_code` 를 요구하고, 공식 매핑은 `corpCode.xml`(ZIP)이다.
 * 런타임에서 zip 을 풀지 않고도 얻을 수 있다 — `list.json` 응답의 각 행이
 * `corp_code` 와 `stock_code` 를 **함께** 준다. 정기공시(`pblntf_ty=A`)를 조회해 종목코드로 찾으면 된다.
 */

const DART_BASE = "https://opendart.fss.or.kr/api";
const TIMEOUT_MS = 20_000;

function dartKey(): string | undefined {
  return process.env.DART_API_KEY || process.env.DART_CRTFC_KEY;
}

export interface DartDump {
  endpoint: string;
  url: string;
  status: number | string;
  contentType: string | null;
  bytes: number;
  /** JSON 이면 구조, 아니면 앞부분 문자열. 추측하지 않고 온 것을 그대로 남긴다. */
  shape: unknown;
}

async function probe(endpoint: string, url: string): Promise<DartDump> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const buffer = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(buffer);
    let shape: unknown;
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const list = json.list;
      shape = {
        topKeys: Object.keys(json),
        status: json.status,
        message: json.message,
        listLength: Array.isArray(list) ? list.length : null,
        firstRowKeys: Array.isArray(list) && list[0] && typeof list[0] === "object" ? Object.keys(list[0] as object) : null,
        firstRow: Array.isArray(list) ? list[0] : null,
        // 재무제표 응답은 계정명이 핵심이다 — 어떤 계정이 오는지 그대로 뽑는다.
        accountNames: Array.isArray(list)
          ? [...new Set(list.map((row) => (row as { account_nm?: string }).account_nm).filter(Boolean))].slice(0, 60)
          : null,
      };
    } catch {
      shape = { notJson: true, head: text.slice(0, 200) };
    }
    return { endpoint, url: url.replace(/crtfc_key=[^&]+/, "crtfc_key=***"), status: res.status, contentType: res.headers.get("content-type"), bytes: buffer.byteLength, shape };
  } catch (error) {
    return {
      endpoint,
      url: url.replace(/crtfc_key=[^&]+/, "crtfc_key=***"),
      status: error instanceof Error ? error.name : "error",
      contentType: null,
      bytes: 0,
      shape: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** 정기공시 목록에서 종목코드 → `corp_code` 를 찾는다(ZIP 매핑 파일 없이). */
async function findCorpCode(key: string, stockCode: string, year: number): Promise<{ corpCode: string | null; scanned: number }> {
  let scanned = 0;
  for (let page = 1; page <= 8; page += 1) {
    const url = `${DART_BASE}/list.json?crtfc_key=${key}&bgn_de=${year}0101&end_de=${year}1231&pblntf_ty=A&page_no=${page}&page_count=100`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    if (!res?.ok) break;
    const json = (await res.json()) as { list?: Array<{ corp_code?: string; stock_code?: string }>; total_page?: number };
    const rows = json.list ?? [];
    scanned += rows.length;
    const hit = rows.find((row) => row.stock_code?.trim() === stockCode);
    if (hit?.corp_code) return { corpCode: hit.corp_code, scanned };
    if (typeof json.total_page === "number" && page >= json.total_page) break;
  }
  return { corpCode: null, scanned };
}

export interface DartDiscoveryResult {
  probedAt: string;
  keyPresent: boolean;
  stockCode: string;
  corpCode: string | null;
  corpCodeScanned: number;
  dumps: DartDump[];
  note: string;
}

/** 정기보고서 코드 — 1분기 / 반기 / 3분기 / 사업보고서. */
const REPORT_CODES = { Q1: "11013", H1: "11012", Q3: "11014", FY: "11011" } as const;

export async function discoverDartStructure(stockCode = "185750"): Promise<DartDiscoveryResult> {
  const key = dartKey();
  const probedAt = new Date().toISOString();
  const note = "판정하지 않는다. 확보율·파서는 이 덤프를 근거로 그 다음에 만든다(WO-SUB-00 규칙).";
  if (!key) {
    return { probedAt, keyPresent: false, stockCode, corpCode: null, corpCodeScanned: 0, dumps: [], note };
  }

  const year = new Date().getUTCFullYear() - 1;
  const dumps: DartDump[] = [];
  // 1) 공시 목록 — rcept_no·rcept_dt 가 filed_at 의 근거다.
  dumps.push(await probe("list.json(정기공시)", `${DART_BASE}/list.json?crtfc_key=${key}&bgn_de=${year}0101&end_de=${year}1231&pblntf_ty=A&page_count=10`));
  // 2) corp_code 매핑
  const { corpCode, scanned } = await findCorpCode(key, stockCode, year);
  if (corpCode) {
    // 3) 주요계정 — 분기별로 실제로 무엇이 오는지.
    for (const [label, reprt] of Object.entries(REPORT_CODES)) {
      dumps.push(
        await probe(
          `fnlttSinglAcnt(${label})`,
          `${DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${key}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reprt}`
        )
      );
    }
    // 4) 전체 재무제표 — 현금흐름·EPS 확보 가능성 확인.
    dumps.push(
      await probe(
        "fnlttSinglAcntAll(FY,CFS)",
        `${DART_BASE}/fnlttSinglAcntAll.json?crtfc_key=${key}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${REPORT_CODES.FY}&fs_div=CFS`
      )
    );
  }
  return { probedAt, keyPresent: true, stockCode, corpCode, corpCodeScanned: scanned, dumps, note };
}
