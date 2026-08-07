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
 * ZIP 의 모든 엔트리를 푼다.
 *
 * `dart-discovery.ts` 의 `unzipSingleEntry` 는 corpCode.xml(단일 엔트리) 전용이다.
 * `document.xml` 은 본문 + 첨부로 **여러 엔트리**가 올 수 있어 첫 엔트리만 보면 본문을 놓칠 수 있다.
 */
function unzipEntries(buffer: Uint8Array): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (!(buffer[offset] === 0x50 && buffer[offset + 1] === 0x4b && buffer[offset + 2] === 0x03 && buffer[offset + 3] === 0x04)) break;
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 30);
    const method = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder("utf-8").decode(buffer.subarray(nameStart, nameStart + nameLength));
    const bodyStart = nameStart + nameLength + extraLength;
    if (compressedSize === 0) break; // 스트리밍 ZIP(크기가 뒤에 옴) — 프로브에서는 다루지 않는다
    const body = buffer.subarray(bodyStart, bodyStart + compressedSize);
    try {
      const raw = method === 8 ? inflateRawSync(body) : Buffer.from(body);
      // DART 본문은 EUC-KR 인 경우가 있다 — 둘 다 시도해 한글이 보이는 쪽을 쓴다.
      const utf8 = new TextDecoder("utf-8").decode(raw);
      const euckr = new TextDecoder("euc-kr").decode(raw);
      const score = (text: string) => (text.match(/[가-힣]/g) ?? []).length;
      out.push({ name, text: score(euckr) > score(utf8) ? euckr : utf8 });
    } catch (error) {
      out.push({ name, text: `__inflate_error: ${error instanceof Error ? error.message : String(error)}` });
    }
    offset = bodyStart + compressedSize;
  }
  return out;
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
    const entries = unzipEntries(buffer);
    console.log(`  ZIP 엔트리 ${entries.length}개: ${entries.map((e) => `${e.name}(${e.text.length}자)`).join(", ")}`);

    const body = entries.reduce((best, entry) => (entry.text.length > best.text.length ? entry : best), entries[0] ?? { name: "-", text: "" });
    const allTitles = titles(body.text);
    console.log(`  제목 태그 ${allTitles.length}개 — 상위 25개:`);
    for (const title of allTitles.slice(0, 25)) console.log(`    · ${title}`);
    const riskTitles = allTitles.filter((title) => RISK_HEADING.test(title));
    console.log(`  위험 관련 제목 ${riskTitles.length}개:`);
    for (const title of riskTitles) console.log(`    ⚠ ${title}`);
  }
}

void main();
