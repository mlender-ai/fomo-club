/**
 * WO-SUB-06 §5-2 — KR 위험요소 소스 실측 프로브.
 *
 * ## 왜 프로브가 필요한가
 *
 * US 는 10-K 에 **Item 1A Risk Factors** 라는 표준 섹션이 있어서 위치가 확정적이다.
 * KR 사업보고서 서식에는 그에 대응하는 표준 위험요소 섹션이 **있다고 가정할 수 없다**
 * (투자위험요소는 증권신고서·투자설명서의 섹션이다). 그래서 "무엇을 뽑을지" 를 정하기 전에
 * 실제 사업보고서 본문의 목차를 본다.
 *
 * 이 배치의 규율: 소스에 없다고 단정하기 전에 조회한다. 반대로 있다고 가정하고 파서를 쓰는 것도
 * 같은 잘못이다 — WO-SUB-00 의 파서 오판이 그 형태였다.
 *
 * 로컬에서는 `DART_API_KEY` 가 없어 돌 수 없다. `.github/workflows/risk-kr-source-probe.yml`
 * (workflow_dispatch)로 시크릿을 가진 환경에서 돌린다.
 */

import { inflateRawSync } from "node:zlib";
import { fetchCorpCodeMap } from "../apps/web/lib/fundamentals/dart-discovery";

const DART_BASE = "https://opendart.fss.or.kr/api";
const KEY = process.env["DART_API_KEY"]?.trim() ?? "";

/** 표본 — 유형이 갈리는 것끼리 고른다(제약·대형제조·은행지주·시클리컬). */
const SAMPLE: Array<{ name: string; stockCode: string }> = [
  { name: "종근당", stockCode: "185750" },
  { name: "삼성전자", stockCode: "005930" },
  { name: "BNK금융지주", stockCode: "138930" },
  { name: "POSCO홀딩스", stockCode: "005490" },
  { name: "KT", stockCode: "030200" },
];

interface ListRow {
  corp_name?: string;
  report_nm?: string;
  rcept_no?: string;
  rcept_dt?: string;
}

async function dartJson<T>(path: string, params: Record<string, string>): Promise<T | { __error: string }> {
  const query = new URLSearchParams({ crtfc_key: KEY, ...params }).toString();
  try {
    const res = await fetch(`${DART_BASE}/${path}?${query}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return { __error: `HTTP ${res.status}` };
    return (await res.json()) as T;
  } catch (error) {
    return { __error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * ZIP 의 모든 엔트리를 푼다 — **중앙 디렉터리 기준**.
 *
 * `dart-discovery.ts` 의 `unzipSingleEntry` 는 corpCode.xml(단일 엔트리) 전용이고 로컬 헤더의
 * 크기 필드를 읽는다. `document.xml` 에는 그 방법이 통하지 않는다.
 *
 * **실측(2026-08-07, 4종목 전부)**: DART `document.xml` 은 **스트리밍 ZIP** 이다 — 로컬 헤더의
 * `compressedSize` 가 0 이고 실제 크기는 본문 뒤 data descriptor 에 온다. 로컬 헤더만 읽으면
 * 엔트리 0 개가 나오는데, 처음 짠 파서가 그때 **조용히 빈 배열을 돌려줬다**. 내가 이 파일 주석에
 * 적어둔 "조용한 빈 결과 금지" 를 내 코드가 어긴 것이다. 그래서 지금은 (1) 중앙 디렉터리에서
 * 크기·오프셋을 읽고 (2) 엔트리가 0 개면 사유를 만들어 올린다.
 */
function unzipEntries(buffer: Uint8Array): { entries: Array<{ name: string; text: string }>; error: string | null } {
  const decode = (raw: Uint8Array): string => {
    // DART 본문은 EUC-KR 인 경우가 있다 — 둘 다 디코드해 한글이 많은 쪽을 쓴다.
    const utf8 = new TextDecoder("utf-8").decode(raw);
    const euckr = new TextDecoder("euc-kr").decode(raw);
    const score = (text: string) => (text.match(/[가-힣]/g) ?? []).length;
    return score(euckr) > score(utf8) ? euckr : utf8;
  };

  // EOCD(`PK\x05\x06`)는 파일 끝에서 최대 64KB 안에 있다.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66_000); i -= 1) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { entries: [], error: "EOCD(중앙 디렉터리 끝) 미발견" };

  const eocdView = new DataView(buffer.buffer, buffer.byteOffset + eocd, 22);
  const count = eocdView.getUint16(10, true);
  const cdOffset = eocdView.getUint32(16, true);
  const entries: Array<{ name: string; text: string }> = [];

  let cursor = cdOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length) return { entries, error: `중앙 디렉터리 잘림(entry ${index})` };
    if (!(buffer[cursor] === 0x50 && buffer[cursor + 1] === 0x4b && buffer[cursor + 2] === 0x01 && buffer[cursor + 3] === 0x02)) {
      return { entries, error: `중앙 디렉터리 시그니처 아님(entry ${index})` };
    }
    const cd = new DataView(buffer.buffer, buffer.byteOffset + cursor, 46);
    const method = cd.getUint16(10, true);
    const compressedSize = cd.getUint32(20, true);
    const nameLength = cd.getUint16(28, true);
    const extraLength = cd.getUint16(30, true);
    const commentLength = cd.getUint16(32, true);
    const localOffset = cd.getUint32(42, true);
    const name = decode(buffer.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    // 로컬 헤더의 이름·extra 길이만 써서 본문 시작을 찾는다(크기는 중앙 디렉터리 값을 신뢰).
    if (localOffset + 30 > buffer.length) {
      entries.push({ name, text: `__error: 로컬 헤더 오프셋 범위 밖(${localOffset})` });
      continue;
    }
    const lh = new DataView(buffer.buffer, buffer.byteOffset + localOffset, 30);
    const bodyStart = localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const body = buffer.subarray(bodyStart, bodyStart + compressedSize);
    try {
      entries.push({ name, text: decode(method === 8 ? inflateRawSync(body) : body) });
    } catch (error) {
      entries.push({ name, text: `__inflate_error: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return { entries, error: entries.length === 0 ? `중앙 디렉터리 entry 수 ${count} 인데 해동 0건` : null };
}

/** DART 본문 XML 의 제목 태그 — 목차 구조가 여기 드러난다. */
function titles(xml: string): string[] {
  return [...xml.matchAll(/<TITLE[^>]*>([\s\S]*?)<\/TITLE>/gi)]
    .map((match) => match[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0 && text.length < 80);
}

const RISK_HEADING = /위험|리스크|risk/i;

async function main(): Promise<void> {
  if (!KEY) {
    console.error("DART_API_KEY 없음 — 시크릿을 가진 환경에서 돌려야 한다.");
    process.exit(1);
  }
  const map = await fetchCorpCodeMap("risk-probe");
  console.log(`corp_code 매핑: 전체 ${map.totalEntries} · 상장 ${map.listedEntries} · 캐시 ${map.fromCache}${map.error ? ` · error=${map.error}` : ""}`);

  for (const target of SAMPLE) {
    const corpCode = map.byStockCode.get(target.stockCode);
    console.log(`\n=== ${target.name} (${target.stockCode}) corp_code=${corpCode ?? "없음"} ===`);
    if (!corpCode) continue;

    // 정기공시(A) 중 사업보고서. 사업보고서는 3월 제출이라 연초부터 훑는다.
    const list = await dartJson<{ status?: string; message?: string; list?: ListRow[] }>("list.json", {
      corp_code: corpCode,
      bgn_de: `${new Date().getUTCFullYear() - 1}0101`,
      end_de: `${new Date().getUTCFullYear()}1231`,
      pblntf_ty: "A",
      page_count: "100",
    });
    if ("__error" in list) {
      console.log(`  list.json 실패: ${list.__error}`);
      continue;
    }
    if (list.status !== "000") {
      console.log(`  list.json status=${list.status} ${list.message ?? ""}`);
      continue;
    }
    const annual = (list.list ?? []).find((row) => /사업보고서/.test(row.report_nm ?? ""));
    if (!annual?.rcept_no) {
      console.log(`  사업보고서 없음 (정기공시 ${list.list?.length ?? 0}건: ${(list.list ?? []).slice(0, 5).map((r) => r.report_nm).join(" / ")})`);
      continue;
    }
    console.log(`  사업보고서 ${annual.report_nm} rcept_no=${annual.rcept_no} rcept_dt=${annual.rcept_dt}`);

    const query = new URLSearchParams({ crtfc_key: KEY, rcept_no: annual.rcept_no }).toString();
    const res = await fetch(`${DART_BASE}/document.xml?${query}`, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) {
      console.log(`  document.xml HTTP ${res.status}`);
      continue;
    }
    const buffer = new Uint8Array(await res.arrayBuffer());
    const head = Array.from(buffer.slice(0, 4)).join(",");
    if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
      // 키 오류면 ZIP 대신 XML 이 온다 — 조용한 빈 결과 금지(DUMP 문서의 교훈)
      console.log(`  ZIP 아님(head=${head}) 본문 앞 300자: ${new TextDecoder("utf-8").decode(buffer.slice(0, 300))}`);
      continue;
    }
    const { entries, error: zipError } = unzipEntries(buffer);
    console.log(`  ZIP ${buffer.length}바이트 → 엔트리 ${entries.length}개${zipError ? ` · ⚠ ${zipError}` : ""}: ${entries.map((e) => `${e.name}(${e.text.length}자)`).join(", ")}`);
    if (entries.length === 0) continue;

    const body = entries.reduce((best, entry) => (entry.text.length > best.text.length ? entry : best), entries[0]!);
    // 목차가 TITLE 태그가 아닌 서식일 수 있으니 원문 일부도 남긴다.
    console.log(`  본문 ${body.name} 앞 200자: ${body.text.slice(0, 200).replace(/\s+/g, " ")}`);
    const allTitles = titles(body.text);
    console.log(`  제목 태그 ${allTitles.length}개 — 상위 25개:`);
    for (const title of allTitles.slice(0, 25)) console.log(`    · ${title}`);
    const riskTitles = allTitles.filter((title) => RISK_HEADING.test(title));
    console.log(`  위험 관련 제목 ${riskTitles.length}개:`);
    for (const title of riskTitles) console.log(`    ⚠ ${title}`);
  }
}

void main();
