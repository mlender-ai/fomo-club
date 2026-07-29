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

import { inflateRawSync } from "node:zlib";

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

/**
 * `corpCode.xml` ZIP 의 첫(유일) 엔트리를 푼다.
 *
 * 로컬 파일 헤더: `PK\x03\x04` + 26바이트 고정부, 이후 파일명·extra, 그 다음이 압축 본문이다.
 * 압축 방식 8(deflate) 만 다룬다 — 다른 값이면 추측하지 않고 실패로 남긴다.
 */
function unzipSingleEntry(buffer: Uint8Array): { xml: string } | { error: string } {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)) {
    return { error: `ZIP 시그니처 아님(head=${Array.from(buffer.slice(0, 4)).join(",")})` };
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const method = view.getUint16(8, true);
  if (method !== 8) return { error: `지원하지 않는 압축 방식 ${method}` };
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const body = buffer.subarray(30 + nameLength + extraLength);
  try {
    return { xml: new TextDecoder("utf-8").decode(inflateRawSync(body)) };
  } catch (error) {
    return { error: `inflate 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export interface CorpCodeMap {
  /** 종목코드(6자리) → DART corp_code(8자리). 비상장사는 stock_code 가 비어 있어 빠진다. */
  byStockCode: Map<string, string>;
  totalEntries: number;
  listedEntries: number;
  error: string | null;
}

/** 공식 매핑 파일을 받아 종목코드 → corp_code 표를 만든다. */
export async function fetchCorpCodeMap(key: string): Promise<CorpCodeMap> {
  const empty = (error: string): CorpCodeMap => ({ byStockCode: new Map(), totalEntries: 0, listedEntries: 0, error });
  const res = await fetch(`${DART_BASE}/corpCode.xml?crtfc_key=${key}`, { signal: AbortSignal.timeout(60_000) }).catch(
    (error: unknown) => ({ ok: false, status: 0, error }) as const
  );
  if (!("arrayBuffer" in res)) return empty(`corpCode.xml 요청 실패: ${String((res as { error?: unknown }).error)}`);
  if (!res.ok) return empty(`corpCode.xml HTTP ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  const unzipped = unzipSingleEntry(buffer);
  if ("error" in unzipped) {
    // ZIP 이 아니면 대개 에러 XML 이다 — 본문을 남겨 원인을 보이게 한다.
    return empty(`${unzipped.error} / head="${new TextDecoder().decode(buffer.subarray(0, 160))}"`);
  }
  const byStockCode = new Map<string, string>();
  let totalEntries = 0;
  for (const match of unzipped.xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    totalEntries += 1;
    const block = match[1]!;
    const corp = block.match(/<corp_code>([^<]*)<\/corp_code>/)?.[1]?.trim();
    const stock = block.match(/<stock_code>([^<]*)<\/stock_code>/)?.[1]?.trim();
    if (corp && stock && /^\d{6}$/.test(stock)) byStockCode.set(stock, corp);
  }
  return { byStockCode, totalEntries, listedEntries: byStockCode.size, error: null };
}

export interface DartDiscoveryResult {
  probedAt: string;
  keyPresent: boolean;
  stockCode: string;
  corpCode: string | null;
  /** 매핑 파일 통계 — 확보율을 세기 전에 매핑이 열렸는지부터 보인다. */
  corpCodeMap: { totalEntries: number; listedEntries: number; error: string | null };
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
    return { probedAt, keyPresent: false, stockCode, corpCode: null, corpCodeMap: { totalEntries: 0, listedEntries: 0, error: "DART_API_KEY 없음" }, dumps: [], note };
  }

  const year = new Date().getUTCFullYear() - 1;
  const dumps: DartDump[] = [];
  // 1) corp_code 매핑 — 이것이 열리지 않으면 나머지는 의미가 없다.
  const map = await fetchCorpCodeMap(key);
  const corpCode = map.byStockCode.get(stockCode) ?? null;
  // 2) 공시 목록 — rcept_no·rcept_dt 가 filed_at 의 근거다.
  //    corp_code 를 넣으면 기간 제한(3개월)이 풀린다(실측: 없으면 status 100).
  dumps.push(
    await probe(
      "list.json(정기공시)",
      `${DART_BASE}/list.json?crtfc_key=${key}${corpCode ? `&corp_code=${corpCode}` : ""}&bgn_de=${year - 1}0101&end_de=${year}1231&pblntf_ty=A&page_count=20`
    )
  );
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
  return {
    probedAt,
    keyPresent: true,
    stockCode,
    corpCode,
    corpCodeMap: { totalEntries: map.totalEntries, listedEntries: map.listedEntries, error: map.error },
    dumps,
    note,
  };
}
