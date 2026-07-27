/**
 * DART 응답 구조 덤프 — **판정하지 않는다.** 키 구조만 찍는다.
 *
 * `WO-SUB-00` 이 남긴 규칙: *확보율을 세기 전에 응답 구조를 먼저 덤프해 근거를 만들 것.*
 * 추측한 키로 파서를 쓰면 프로덕션에서만 깨진다. `WO-SUB-01` 에서 DART 파서를 쓰지 않은 이유가
 * 이것이다 — 응답을 한 번도 못 봤다(`DART_API_KEY` 가 GitHub Actions Secrets 에 없다).
 *
 * 실행:
 *   DART_API_KEY=… npx tsx scripts/audit/discover_dart_keys.ts 185750 000660
 *
 * 시크릿이 등록되면 `.github/workflows/substance-audit.yml` 이 자동으로 이 스크립트를 돌린다.
 * 덤프 결과를 `docs/fundamentals/SPEC_factsheet.md` §3-5 에 반영하고 나서 파서를 쓸 것.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { flag } from "./universe";

const TIMEOUT_MS = 20_000;
/** 정기보고서 코드 — 1분기 / 반기 / 3분기 / 사업보고서. */
const REPORT_CODES = { Q1: "11013", H1: "11012", Q3: "11014", FY: "11011" } as const;

interface Dump {
  endpoint: string;
  status: number | string;
  contentType: string | null;
  bytes: number;
  /** JSON 이면 상위 키, 배열이면 첫 원소 키. XML/ZIP 이면 앞부분 문자열. */
  shape: unknown;
}

async function probe(label: string, url: string): Promise<Dump> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const contentType = res.headers.get("content-type");
    const buffer = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(buffer.slice(0, 4_000));
    let shape: unknown;
    try {
      const json = JSON.parse(new TextDecoder().decode(buffer)) as Record<string, unknown>;
      const list = json.list;
      shape = {
        topKeys: Object.keys(json),
        status: json.status,
        message: json.message,
        listLength: Array.isArray(list) ? list.length : null,
        firstRowKeys: Array.isArray(list) && list[0] && typeof list[0] === "object" ? Object.keys(list[0] as object) : null,
        firstRow: Array.isArray(list) ? list[0] : null,
      };
    } catch {
      // JSON 이 아니면(ZIP·XML) 앞부분을 그대로 남긴다 — 추측하지 않는다.
      shape = { notJson: true, head: text.slice(0, 300) };
    }
    return { endpoint: label, status: res.status, contentType, bytes: buffer.byteLength, shape };
  } catch (error) {
    return {
      endpoint: label,
      status: error instanceof Error ? error.name : "error",
      contentType: null,
      bytes: 0,
      shape: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const key = process.env.DART_API_KEY || process.env.DART_CRTFC_KEY;
  const outDir = flag(args, "--out") ?? "docs/audit";
  const codes = args.filter((arg) => /^\d{6}$/.test(arg));
  if (codes.length === 0) codes.push("185750", "000660");

  if (!key) {
    console.error("[dart] DART_API_KEY 없음 — 조회하지 않는다. 시크릿 등록 후 재실행할 것.");
    console.error("        레포 Settings → Secrets and variables → Actions → DART_API_KEY");
    process.exit(2);
  }

  const year = new Date().getUTCFullYear();
  const dumps: Dump[] = [];
  // 1) 회사 코드 매핑 파일(ZIP) — 헤더만 확인한다.
  dumps.push(await probe("corpCode.xml(zip)", `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`));
  // 2) 공시 목록 — rcept_no·rcept_dt 가 filed_at 의 근거다.
  dumps.push(
    await probe(
      "list.json(정기공시)",
      `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&bgn_de=${year - 1}0101&pblntf_ty=A&page_count=10`
    )
  );
  // 3) 종목별 주요계정 / 전체 재무제표 — 실제로 어떤 계정명·필드가 오는지.
  for (const code of codes) {
    for (const [label, reprt] of Object.entries(REPORT_CODES)) {
      dumps.push(
        await probe(
          `fnlttSinglAcnt(${code},${label})`,
          `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${key}&corp_code=${code}&bsns_year=${year - 1}&reprt_code=${reprt}`
        )
      );
    }
    dumps.push(
      await probe(
        `fnlttSinglAcntAll(${code},FY)`,
        `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${key}&corp_code=${code}&bsns_year=${year - 1}&reprt_code=${REPORT_CODES.FY}&fs_div=CFS`
      )
    );
  }

  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "dart_key_discovery.json");
  writeFileSync(path, JSON.stringify({ probedAt: new Date().toISOString(), codes, dumps }, null, 2));
  console.log(`[dart] 구조 덤프 저장 — ${path}`);
  for (const dump of dumps) {
    console.log(`  ${dump.endpoint} → ${dump.status} ${dump.contentType ?? ""} ${dump.bytes}B`);
    console.log(`     ${JSON.stringify(dump.shape).slice(0, 400)}`);
  }
  console.log("[dart] 주의: 이 스크립트는 판정하지 않는다. 확보율은 구조를 확인한 뒤에 센다.");
}

main().catch((error) => {
  console.error("[dart] 실패", error);
  process.exit(1);
});
