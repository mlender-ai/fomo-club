/**
 * KR 위험 섹션 추출 (WO-SUB-06 §5-2 · 커밋 2 의 KR 절반).
 *
 * ## 실측이 뒤집은 전제 (2026-08-07, 표본 4종목 전부)
 *
 * 착수 시엔 "KR 사업보고서에 US Item 1A 대응물이 없다" 고 봤다. **틀렸다.** 프로브
 * (`scripts/risk-kr-source-probe.ts`)로 실제 목차를 보니 4종목(종근당·삼성전자·BNK금융지주·
 * POSCO홀딩스) 전부 같은 서식이고 표준 섹션이 있다:
 *
 *   II. 사업의 내용 → **5. 위험관리 및 파생거래**
 *   III. 재무에 관한 사항 → 주석 → **재무위험관리의 목적 및 정책(위험관리)**
 *
 * ## 다만 성격이 US 와 다르다 — 라벨로 구분한다
 *
 * Item 1A 는 "이 사업이 틀릴 수 있는 이유" 를 나열한다. KR 의 `위험관리 및 파생거래` 는
 * **관리 방침·파생상품 현황** 쪽으로 기울어 있다. 같은 것으로 취급해 한 통에 담으면 "이 회사
 * 고유 리스크" 라는 주장이 KR 에서 약해진다. 그래서 섹션 종류를 `section` 으로 남겨 합성
 * 프롬프트와 화면이 구분할 수 있게 한다.
 *
 * ## ZIP 은 중앙 디렉터리로 읽는다
 *
 * `document.xml` 은 **스트리밍 ZIP** 이라 로컬 헤더의 `compressedSize` 가 0 이다(실측). 로컬
 * 헤더만 읽으면 엔트리 0 개가 나오는데, 프로브 1차가 그 상태에서 조용히 빈 배열을 돌려줬다.
 * `dart-discovery.ts` 의 `unzipSingleEntry`(corpCode.xml 전용)를 여기 재사용할 수 없는 이유다.
 */

import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { SourceDocument } from "@fomo/core";

const DART_BASE = "https://opendart.fss.or.kr/api";
const TIMEOUT_MS = 180_000;

/** 사업보고서 본문 XML 의 제목 태그. 목차 구조가 여기 드러난다. */
const TITLE_RE = /<TITLE[^>]*>([\s\S]*?)<\/TITLE>/gi;

/**
 * 위험 섹션 헤더. 실측 목차 문자열 그대로 잡는다.
 *
 * `business` = II. 사업의 내용 안의 사업 위험 서술, `financial` = 재무제표 주석의 재무위험관리.
 * 둘을 합치지 않는다 — 주석 쪽은 회계 정책 서술이라 사업 리스크로 읽히면 안 된다.
 */
const SECTION_PATTERNS: ReadonlyArray<{ section: KrRiskSection; pattern: RegExp }> = [
  { section: "business", pattern: /^\s*\d+\s*\.\s*위험관리\s*및\s*파생거래/ },
  { section: "financial", pattern: /재무위험관리의?\s*목적\s*및\s*정책/ },
];

export type KrRiskSection = "business" | "financial";

export interface KrRiskExtraction {
  section: KrRiskSection;
  /** 헤더 다음부터 다음 제목 전까지의 평문. */
  text: string;
  heading: string;
}

export interface KrRiskResult {
  document: SourceDocument | null;
  sections: KrRiskExtraction[];
  errors: string[];
  diagnostics: { titles: number; riskHeadings: number; bodyChars: number } | null;
}

/** ZIP 전체 엔트리 — 중앙 디렉터리 기준. 엔트리 0개면 사유를 만들어 올린다. */
export function unzipAll(buffer: Uint8Array): { entries: Array<{ name: string; text: string }>; error: string | null } {
  const decode = (raw: Uint8Array): string => {
    const utf8 = new TextDecoder("utf-8").decode(raw);
    const euckr = new TextDecoder("euc-kr").decode(raw);
    const score = (text: string) => (text.match(/[가-힣]/g) ?? []).length;
    return score(euckr) > score(utf8) ? euckr : utf8;
  };

  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66_000); i -= 1) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { entries: [], error: "EOCD 미발견 — ZIP 이 아니거나 잘렸다" };

  const eocdView = new DataView(buffer.buffer, buffer.byteOffset + eocd, 22);
  const count = eocdView.getUint16(10, true);
  let cursor = eocdView.getUint32(16, true);
  const entries: Array<{ name: string; text: string }> = [];

  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length) return { entries, error: `중앙 디렉터리 잘림(entry ${index})` };
    const cd = new DataView(buffer.buffer, buffer.byteOffset + cursor, 46);
    const method = cd.getUint16(10, true);
    const compressedSize = cd.getUint32(20, true);
    const nameLength = cd.getUint16(28, true);
    const extraLength = cd.getUint16(30, true);
    const commentLength = cd.getUint16(32, true);
    const localOffset = cd.getUint32(42, true);
    const name = decode(buffer.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (localOffset + 30 > buffer.length) continue;
    const lh = new DataView(buffer.buffer, buffer.byteOffset + localOffset, 30);
    const bodyStart = localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    try {
      const body = buffer.subarray(bodyStart, bodyStart + compressedSize);
      entries.push({ name, text: decode(method === 8 ? inflateRawSync(body) : body) });
    } catch {
      // 한 엔트리 실패가 전체를 죽이지 않는다 — 본문은 보통 가장 큰 엔트리다.
    }
  }
  return { entries, error: entries.length === 0 ? `entry ${count}건인데 해동 0건` : null };
}

function plain(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** 최소 길이 — 목차 줄만 잡히는 것을 배제한다. US 하한(500)보다 낮은 이유는 KR 섹션이 더 짧다. */
const MIN_SECTION_CHARS = 300;
const MAX_SECTION_CHARS = 120_000;

/**
 * 본문 XML → 위험 섹션 구간.
 *
 * 제목 태그의 **위치로** 구간을 자른다. 헤더 다음 제목이 종료점이므로 US 처럼 종료 헤더 목록을
 * 따로 둘 필요가 없다 — DART 서식은 모든 절이 `<TITLE>` 로 열린다(실측: 제목 136~140개).
 */
export function extractKrRiskSections(bodyXml: string): { sections: KrRiskExtraction[]; titles: number } {
  const matches = [...bodyXml.matchAll(TITLE_RE)].map((match) => ({
    index: match.index ?? -1,
    end: (match.index ?? 0) + match[0].length,
    heading: plain(match[1] ?? ""),
  }));
  const sections: KrRiskExtraction[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i]!;
    const hit = SECTION_PATTERNS.find((entry) => entry.pattern.test(current.heading));
    if (!hit) continue;
    const stop = matches[i + 1]?.index ?? bodyXml.length;
    const text = plain(bodyXml.slice(current.end, stop));
    if (text.length < MIN_SECTION_CHARS || text.length > MAX_SECTION_CHARS) continue;
    sections.push({ section: hit.section, text, heading: current.heading });
  }
  return { sections, titles: matches.length };
}

/**
 * 종목 → 최근 사업보고서의 위험 섹션.
 *
 * `corpCode` 는 호출부가 넘긴다(`fetchCorpCodeMap` 을 종목마다 다시 부르지 않는다 — 매핑 전송이
 * 238초라는 실측이 있다).
 */
export async function fetchKrRiskSections(symbol: string, corpCode: string, apiKey: string): Promise<KrRiskResult> {
  const errors: string[] = [];
  if (!apiKey) return { document: null, sections: [], errors: ["dart: API 키 없음"], diagnostics: null };

  const listQuery = new URLSearchParams({
    crtfc_key: apiKey,
    corp_code: corpCode,
    bgn_de: `${new Date().getUTCFullYear() - 1}0101`,
    end_de: `${new Date().getUTCFullYear()}1231`,
    pblntf_ty: "A",
    page_count: "100",
  }).toString();

  let annual: { rcept_no?: string; report_nm?: string; rcept_dt?: string } | undefined;
  try {
    const res = await fetch(`${DART_BASE}/list.json?${listQuery}`, { signal: AbortSignal.timeout(60_000) });
    const json = (await res.json()) as { status?: string; message?: string; list?: Array<{ report_nm?: string; rcept_no?: string; rcept_dt?: string }> };
    if (json.status !== "000") {
      errors.push(`dart: list.json status=${json.status} ${json.message ?? ""}`);
      return { document: null, sections: [], errors, diagnostics: null };
    }
    annual = (json.list ?? []).find((row) => /사업보고서/.test(row.report_nm ?? ""));
  } catch (error) {
    errors.push(`dart: list.json 실패 — ${error instanceof Error ? error.message : String(error)}`);
    return { document: null, sections: [], errors, diagnostics: null };
  }
  if (!annual?.rcept_no) {
    errors.push("dart: 최근 사업보고서 없음");
    return { document: null, sections: [], errors, diagnostics: null };
  }

  const url = `${DART_BASE}/document.xml?${new URLSearchParams({ crtfc_key: apiKey, rcept_no: annual.rcept_no }).toString()}`;
  let buffer: Uint8Array;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      errors.push(`dart: document.xml HTTP ${res.status}`);
      return { document: null, sections: [], errors, diagnostics: null };
    }
    buffer = new Uint8Array(await res.arrayBuffer());
  } catch (error) {
    errors.push(`dart: document.xml 실패 — ${error instanceof Error ? error.message : String(error)}`);
    return { document: null, sections: [], errors, diagnostics: null };
  }

  // 키가 틀리면 ZIP 대신 XML 이 온다 — 조용한 빈 결과 금지(DUMP 문서 교훈).
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    errors.push(`dart: ZIP 아님 — ${new TextDecoder("utf-8").decode(buffer.slice(0, 200))}`);
    return { document: null, sections: [], errors, diagnostics: null };
  }

  const { entries, error: zipError } = unzipAll(buffer);
  if (zipError) errors.push(`dart: ${zipError}`);
  if (entries.length === 0) return { document: null, sections: [], errors, diagnostics: null };

  // 본문은 가장 큰 엔트리다(첨부는 감사보고서 등으로 더 작다 — 실측 5.9~7.7MB vs 0.5~0.7MB).
  const body = entries.reduce((best, entry) => (entry.text.length > best.text.length ? entry : best), entries[0]!);
  const { sections, titles } = extractKrRiskSections(body.text);
  const diagnostics = { titles, riskHeadings: sections.length, bodyChars: body.text.length };
  if (sections.length === 0) {
    errors.push(`dart: 위험 섹션 미발견(제목 ${titles}개)`);
    return { document: null, sections: [], errors, diagnostics };
  }

  const joined = sections.map((section) => section.text).join("\n");
  const document: SourceDocument = {
    doc_id: `dart:${symbol}:${annual.rcept_no}:risk`,
    kind: "disclosure",
    source: "dart_business_report",
    url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${annual.rcept_no}`,
    as_of: annual.rcept_dt ? `${annual.rcept_dt.slice(0, 4)}-${annual.rcept_dt.slice(4, 6)}-${annual.rcept_dt.slice(6, 8)}` : null,
    fetched_at: new Date().toISOString(),
    snapshot_hash: createHash("sha256").update(joined).digest("hex").slice(0, 16),
    chars: joined.length,
  };
  return { document, sections, errors, diagnostics };
}
