import { createHash } from "node:crypto";
import type { SourceDocument } from "@fomo/core";

/**
 * US 공시 원문 수집 + 사업 섹션 추출 (WO-SUB-03 §4-1·§4-2).
 *
 * 대상은 최근 연간보고서(10-K, 외국 발행사는 20-F)의 **Item 1. Business** 다.
 *
 * WO-SUB-06 §5-2 가 **Item 1A(Risk Factors)** 를 추가로 쓴다. 같은 문서·같은 다중 매치 함정을
 * 공유하므로 파일을 나누지 않고 구간 판정을 일반화해(`pickSection`) 두 섹션이 함께 쓴다.
 *
 * ## 실측으로 확인한 함정 (2026-07-29)
 *
 * "Item 1. Business" 문자열은 한 문서에 **여러 번** 나온다. 목차 항목과 상호참조까지 잡힌다.
 *  · CLBK 10-K: 4곳(101570·292174·310318·433659). 101570 은 목차 줄이라 19자 뒤에 바로 "Item 1A" 가 온다
 *  · SHOP: 2곳 · MU: 3곳 — MU 는 Item 1A 도 8곳
 *
 * 그래서 **"마지막 매치"나 "첫 매치"를 쓰면 안 된다.** 목차는 짧은 구간을, 상호참조는 엉뚱한 구간을 만든다.
 * 판정 방법: Item 1 매치마다 그 뒤 첫 Item 1A 매치를 짝지어 구간을 만들고,
 * 길이가 상식 범위(3,000~200,000자)인 구간 중 **가장 긴 것**을 고른다.
 * 짝이 없거나 전부 범위를 벗어나면 **추출 실패**로 기록하고 넘어간다(§4-2: 전체 문서를 LLM 에 넣지 않는다).
 */

const SEC_UA = process.env.SEC_USER_AGENT?.trim() || "FOMO Club research contact@fomoclub.app";
const TIMEOUT_MS = 45_000;
const DELAY_MS = 150;
/** 사업 섹션으로 인정할 길이 범위. 목차 줄(수십 자)과 문서 전체(수십만 자)를 배제한다. */
const MIN_SECTION_CHARS = 3_000;
const MAX_SECTION_CHARS = 200_000;
/**
 * LLM 입력 상한 — 섹션이 길면 앞부분만 쓴다(사업 개요는 Item 1 **앞부분**에 온다).
 *
 * 실측으로 24,000자 → 3,500자로 내렸다. 24,000자는 호출당 6~8k 토큰이라
 * 골든셋에서 **분당 토큰 한도(TPM)** 를 계속 넘겨 429 가 재시도로도 풀리지 않았다
 * (일일 쿼터가 아니었다 — 작은 호출은 같은 시각에 200 이 돌아왔다. 무료 티어 70b 모델은 TPM 이 낮다).
 * 우리가 뽑는 것은 60자 문장 2개이고, "어디서 돈을 버는가"·"무엇에 걸려 있나"의 근거는
 * Item 1 앞부분(사업 개요)에 있을 것으로 봤다.
 *
 * ⚠️ **"입력을 키워도 출력이 좋아지지 않는다"는 아직 검증되지 않았다**(WO-SUB-03.5 PART C-1).
 * 실측: 이 예산이 청크의 중위 **89%** 를 버렸다(Rhinebeck 122개 → 2개). 그 상태의 골든셋은
 * 429 로 23/30 이 합성조차 못 해 비교 근거가 되지 못한다. 페이싱 준수 재실행으로 3,500자 성적을
 * 먼저 확보한 뒤 24,000자 A/B 필요 여부를 판단한다 — 그때까지 이 값은 **잠정**이다.
 *
 * A/B 재실행용으로 env 오버라이드를 둔다(코드 수정 없이 같은 커밋으로 두 조건을 돌리기 위함).
 */
export const SECTION_PROMPT_CHARS = ((): number => {
  const override = Number.parseInt(process.env["SECTION_PROMPT_CHARS_OVERRIDE"] ?? "", 10);
  return Number.isFinite(override) && override > 0 ? override : 3_500;
})();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": SEC_UA, Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": SEC_UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** HTML → 평문. 표 구조는 잃지만 사업 서술 추출에는 충분하다. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * 사업 섹션 시작 헤더.
 *
 * 실측: 많은 발행사가 **Item 1 과 Item 2 를 합쳐** 쓴다 —
 * Valero 는 "ITEMS 1 AND 2. BUSINESS AND PROPERTIES" 라 `Item 1 … Business` 만 찾으면 헤더를 못 만난다
 * (골든셋 1차에서 "Item 1 Business 헤더 미발견"으로 실패). 합본 표기를 함께 받는다.
 */
const ITEM1_RE = /Items?\s*1(?:\s*(?:and|&|,)\s*2)?\.?\s*[—–\-:.]?\s*Business/gi;
const ITEM1A_RE = /Item\s*1A\.?\s*[—–\-:.]?\s*Risk\s*Factors/gi;
/**
 * Item 1A 의 종료 헤더 후보. 표준 순서는 1B → 2 → 3 이고 발행사에 따라 앞의 것이 없다.
 * `Properties` / `Legal Proceedings` 를 함께 요구해 목차 밖 상호참조("see Item 2")를 걸러낸다.
 */
const ITEM1B_RE = /Item\s*1B\.?\s*[—–\-:.]?\s*Unresolved\s*Staff\s*Comments/gi;
const ITEM2_RE = /Item\s*2\.?\s*[—–\-:.]?\s*Properties/gi;
const ITEM3_RE = /Item\s*3\.?\s*[—–\-:.]?\s*Legal\s*Proceedings/gi;

export interface SectionExtraction {
  text: string | null;
  /** 실패 사유. 성공이면 null. */
  reason: string | null;
  /** 진단 — 매치 개수와 선택한 구간 길이. 추출 실패율 분석에 쓴다. */
  diagnostics: { item1Matches: number; item1aMatches: number; candidates: number; chosenChars: number | null };
}

/**
 * 평문에서 Item 1 Business 구간을 뽑는다. 판정 방법은 파일 상단 주석 참조.
 * 실패는 정상 결과다 — 사유를 남기고 그 종목을 실패 목록에 넣는다.
 */
/**
 * 참조 편입(incorporation by reference) 탐지 — WO-SUB-06 §5-2.
 *
 * **실측(USB 10-K, 2026-02-23 제출)**: Item 1A 본문이 위험요소가 아니라 안내문 한 단락이다 —
 * "Information in response to this Item 1A can be found in the 2025 Annual Report on pages 135 to
 * 150 under the heading Risk Factors. That information is incorporated into this report by
 * reference." 1A~1B 구간이 224자뿐이라 하한(500자)에 **우연히** 막혔다.
 *
 * 우연에 기대면 안 된다: 안내문이 조금만 길면 그 문단이 "위험요소 확보"로 기록되고 LLM 입력으로
 * 들어간다. 그러면 §4 규칙 1(소스 없는 리스크를 쓰지 않는다)이 조용히 깨진다 — 소스는 있는데
 * 내용이 없는 경우다. 그래서 길이와 무관하게 문구로 판정한다.
 *
 * 실제 위험요소 본문은 별도 exhibit(보통 Exhibit 13 Annual Report)에 있다. 거기까지 따라갈지는
 * 이 패턴의 실측 규모를 본 뒤 정한다 — 지금은 사유를 남기고 유형 리스크로 내려간다.
 */
const INCORPORATION_RE =
  /incorporated\s+(?:in|into)\s+this\s+(?:report|Report|Form\s*10-K)?\s*by\s+reference|incorporated\s+herein\s+by\s+reference|response\s+to\s+this\s+Item\s*1A\s+can\s+be\s+found/i;

export const INCORPORATED_BY_REFERENCE_REASON =
  "Item 1A 본문이 참조 편입 안내문(위험요소 원문은 별도 exhibit)";

/**
 * 구간이 위험요소 본문이 아니라 참조 안내문인지.
 *
 * **헤더 직후 창으로만 판정한다.** 길이 기준(예: "구간이 4,000자 미만")은 오탐을 낸다 — 실제
 * 위험요소 본문에도 "incorporated herein by reference" 상호참조가 섞이기 때문이다(테스트가 잡음).
 * 참조 편입 발행사는 예외 없이 **헤더 바로 다음 문장**에서 어디를 보라고 말하므로, 그 창 밖의
 * 같은 문구는 본문 안의 상호참조로 본다.
 */
const INCORPORATION_HEAD_CHARS = 400;

export function isIncorporationByReference(text: string): boolean {
  return INCORPORATION_RE.test(text.slice(0, INCORPORATION_HEAD_CHARS));
}

function offsetsOf(plain: string, pattern: RegExp): number[] {
  return [...plain.matchAll(pattern)].map((match) => match.index ?? -1).filter((index) => index >= 0);
}

interface PickOptions {
  startLabel: string;
  endLabel: string;
  minChars?: number;
  maxChars?: number;
}

/**
 * 시작 헤더 × 종료 헤더로 구간을 고른다 — 판정 방법은 파일 상단 주석 참조.
 *
 * 종료 헤더를 **배열**로 받는 이유: Item 1A 의 다음 헤더는 발행사마다 다르다. 표준은 Item 1B
 * (Unresolved Staff Comments) 지만 소규모 발행사는 1B 를 생략하고 Item 2 로 바로 가며,
 * Item 1·2 합본 발행사(Valero)는 Item 2 자체가 없어 Item 3 이 다음 헤더다. 하나만 보면
 * 그 발행사 전체가 조용히 추출 실패로 빠진다.
 */
function pickSection(plain: string, startRe: RegExp, endRes: readonly RegExp[], options: PickOptions): SectionExtraction {
  const minChars = options.minChars ?? MIN_SECTION_CHARS;
  const maxChars = options.maxChars ?? MAX_SECTION_CHARS;
  const starts = offsetsOf(plain, startRe);
  const ends = endRes.flatMap((pattern) => offsetsOf(plain, pattern)).sort((a, b) => a - b);
  const diagnostics = { item1Matches: starts.length, item1aMatches: ends.length, candidates: 0, chosenChars: null as number | null };
  if (starts.length === 0) return { text: null, reason: `${options.startLabel} 헤더 미발견`, diagnostics };
  if (ends.length === 0) return { text: null, reason: `${options.endLabel} 헤더 미발견(구간 종료점 없음)`, diagnostics };

  const spans = starts
    .map((start) => {
      const end = ends.find((candidate) => candidate > start);
      return end === undefined ? null : { start, end, chars: end - start };
    })
    .filter((span): span is { start: number; end: number; chars: number } => span !== null)
    .filter((span) => span.chars >= minChars && span.chars <= maxChars);
  diagnostics.candidates = spans.length;
  if (spans.length === 0) {
    return {
      text: null,
      reason: `유효 구간 없음(${options.startLabel} ${starts.length}곳 / ${options.endLabel} ${ends.length}곳)`,
      diagnostics,
    };
  }
  const chosen = spans.reduce((best, span) => (span.chars > best.chars ? span : best), spans[0]!);
  diagnostics.chosenChars = chosen.chars;
  return { text: plain.slice(chosen.start, chosen.end).trim(), reason: null, diagnostics };
}

export function extractBusinessSection(plain: string): SectionExtraction {
  return pickSection(plain, ITEM1_RE, [ITEM1A_RE], { startLabel: "Item 1 Business", endLabel: "Item 1A Risk Factors" });
}

/**
 * Item 1A(Risk Factors) 구간 — WO-SUB-06 §5-2 의 US 소스.
 *
 * **소규모 발행사는 Item 1A 를 아예 쓰지 않는다**(Regulation S-K 가 smaller reporting company 에
 * 위험요소 기재를 면제한다). 그때 헤더 미발견은 결함이 아니라 사실이므로 사유를 남기고 넘긴다 —
 * §5-2 "확보 실패 시 유형 리스크만 표시" 경로로 간다.
 *
 * 하한을 사업 섹션보다 낮춘 이유: 위험요소는 목차 줄과 구별될 정도면 충분하고, 면제 발행사가
 * "해당 없음" 한 줄만 쓰는 경우도 그 자체가 관측이다. 상한은 그대로 둔다(문서 전체 배제).
 */
export function extractRiskFactorsSection(plain: string): SectionExtraction {
  const picked = pickSection(plain, ITEM1A_RE, [ITEM1B_RE, ITEM2_RE, ITEM3_RE], {
    startLabel: "Item 1A Risk Factors",
    endLabel: "Item 1B/2/3",
    minChars: 500,
  });
  if (picked.text && isIncorporationByReference(picked.text)) {
    return { text: null, reason: INCORPORATED_BY_REFERENCE_REASON, diagnostics: picked.diagnostics };
  }
  if (!picked.text) {
    // 하한 미달로 걸린 구간이 실제로는 참조 편입 안내문일 수 있다 — 사유를 정확히 남긴다.
    const start = offsetsOf(plain, ITEM1A_RE)[0];
    if (start !== undefined) {
      const peek = plain.slice(start, start + 1_200);
      if (isIncorporationByReference(peek)) {
        return { text: null, reason: INCORPORATED_BY_REFERENCE_REASON, diagnostics: picked.diagnostics };
      }
    }
  }
  return picked;
}

export interface FilingSection {
  document: SourceDocument | null;
  /** 추출된 사업 섹션 원문. */
  text: string | null;
  errors: string[];
  diagnostics: SectionExtraction["diagnostics"] | null;
}

interface FilingTable {
  form?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
  filingDate?: string[];
}

interface SubmissionsResponse {
  filings?: {
    recent?: FilingTable;
    /** SEC 는 오래된 공시를 별도 JSON 으로 페이지네이션한다. `recent` 에 없으면 여기를 봐야 한다. */
    files?: Array<{ name?: string }>;
  };
}

const ANNUAL_FORMS = new Set(["10-K", "20-F", "40-F"]);

interface AnnualFiling {
  form: string;
  accession: string;
  primaryDocument: string;
  filedAt: string | null;
}

function findAnnual(table: FilingTable | undefined): AnnualFiling | null {
  const forms = table?.form ?? [];
  const index = forms.findIndex((form) => ANNUAL_FORMS.has(form));
  if (index < 0) return null;
  const accession = (table?.accessionNumber?.[index] ?? "").replace(/-/g, "");
  const primaryDocument = table?.primaryDocument?.[index] ?? "";
  if (!accession || !primaryDocument) return null;
  return { form: forms[index]!, accession, primaryDocument, filedAt: table?.filingDate?.[index] ?? null };
}

/**
 * 최근 연간보고서 탐색. `filings.recent` 에 없으면 **페이지네이션된 과거 파일까지** 본다 —
 * 실측: CLBK 는 지배구조 변경 후 신규 CIK 라 `recent` 가 Form 4 로 가득 차 10-K 가 밀려나 있었다.
 * `recent` 만 보고 "연간보고서 없음"으로 끝내면 실제로 존재하는 공시를 놓친다.
 */
async function findAnnualFiling(cik: string): Promise<{ filing: AnnualFiling | null; errors: string[] }> {
  const errors: string[] = [];
  const submissions = await getJson<SubmissionsResponse>(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!submissions) return { filing: null, errors: ["sec: submissions 조회 실패"] };
  const fromRecent = findAnnual(submissions.filings?.recent);
  if (fromRecent) return { filing: fromRecent, errors };

  const files = (submissions.filings?.files ?? []).map((file) => file.name).filter((name): name is string => !!name);
  for (const name of files.slice(0, 3)) {
    await sleep(DELAY_MS);
    const page = await getJson<FilingTable>(`https://data.sec.gov/submissions/${name}`);
    const hit = findAnnual(page ?? undefined);
    if (hit) return { filing: hit, errors };
  }
  errors.push(`sec: 최근 연간보고서(10-K/20-F/40-F) 없음(recent + 과거 파일 ${Math.min(files.length, 3)}개 조회)`);
  return { filing: null, errors };
}

/** 연간보고서 평문 1회 조회 — 두 섹션 추출기가 같은 문서를 두 번 받지 않게 분리했다. */
async function fetchAnnualPlain(
  cik: string
): Promise<{ plain: string | null; filing: AnnualFiling | null; url: string | null; errors: string[] }> {
  const { filing, errors } = await findAnnualFiling(cik);
  if (!filing) return { plain: null, filing: null, url: null, errors };
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filing.accession}/${filing.primaryDocument}`;
  await sleep(DELAY_MS);
  const html = await getText(url);
  if (!html) {
    errors.push(`sec: 보고서 본문 조회 실패(${url})`);
    return { plain: null, filing, url, errors };
  }
  return { plain: htmlToPlain(html), filing, url, errors };
}

/**
 * 섹션 추출 결과 → `SourceDocument`.
 *
 * `doc_id` 에 섹션 구분(`suffix`)을 넣는 이유: 한 10-K 에서 사업 섹션과 위험요소를 각각 뽑으면
 * accession 이 같다. 구분이 없으면 **다른 내용이 같은 doc_id 를 갖게 되고** WO-SUB-06 §4 규칙 2
 * ("소스 종류를 분리한다")가 원장 수준에서 깨진다.
 */
function sectionDocument(symbol: string, filing: AnnualFiling, url: string, text: string, suffix: string): SourceDocument {
  return {
    doc_id: `sec:${symbol.toUpperCase()}:${filing.accession}:${suffix}`,
    kind: "disclosure",
    source: `sec_${filing.form.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    url,
    as_of: filing.filedAt,
    fetched_at: new Date().toISOString(),
    snapshot_hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
    chars: text.length,
  };
}

/** 심볼 → 최근 연간보고서의 사업 섹션. CIK 매핑은 호출부가 넘긴다(SEC 매핑 재조회 중복 방지). */
export async function fetchBusinessSection(symbol: string, cik: string): Promise<FilingSection> {
  const { plain, filing, url, errors } = await fetchAnnualPlain(cik);
  if (!plain || !filing || !url) return { document: null, text: null, errors, diagnostics: null };
  const extraction = extractBusinessSection(plain);
  if (!extraction.text) {
    errors.push(`sec: 섹션 추출 실패 — ${extraction.reason}`);
    return { document: null, text: null, errors, diagnostics: extraction.diagnostics };
  }
  return {
    // 기존 doc_id 규약 유지 — 사업 섹션 레코드가 이미 저장돼 있어 suffix 를 붙이면 전량 재합성된다.
    document: {
      ...sectionDocument(symbol, filing, url, extraction.text, "business"),
      doc_id: `sec:${symbol.toUpperCase()}:${filing.accession}`,
    },
    text: extraction.text,
    errors,
    diagnostics: extraction.diagnostics,
  };
}

/** 심볼 → 최근 연간보고서의 위험요소(Item 1A) 섹션. WO-SUB-06 §5-2. */
export async function fetchRiskFactorsSection(symbol: string, cik: string): Promise<FilingSection> {
  const { plain, filing, url, errors } = await fetchAnnualPlain(cik);
  if (!plain || !filing || !url) return { document: null, text: null, errors, diagnostics: null };
  const extraction = extractRiskFactorsSection(plain);
  if (!extraction.text) {
    errors.push(`sec: 위험요소 추출 실패 — ${extraction.reason}`);
    return { document: null, text: null, errors, diagnostics: extraction.diagnostics };
  }
  return {
    document: sectionDocument(symbol, filing, url, extraction.text, "risk-factors"),
    text: extraction.text,
    errors,
    diagnostics: extraction.diagnostics,
  };
}
