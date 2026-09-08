import { parseBodyAmount, parseBodyEarnings, type BodyAmount, type BodyEarnings } from "@fomo/core/keyword-cards/disclosure-body";

/**
 * LAUNCH-P2 §A-2·§B — **DART 공시 본문을 가져온다.** 열쇠가 필요 없는 경로다.
 *
 * ## 두 홉이다
 *
 * ```
 * ① dsaf001/main.do?rcpNo=…   ← 뷰어 껍데기. 본문이 없다(실측 523자, 금액 0건)
 *      viewDoc("20260807900376", "11514220", …)  ← 여기서 dcmNo 를 캔다
 * ② report/viewer.do?rcpNo=…&dcmNo=…             ← 여기에 본문이 있다
 * ```
 *
 * 종전 코드(`fetchDartReportText`)는 ①만 읽었다. 그래서 본문을 읽는다고 하면서 실제로는
 * 껍데기의 메뉴 글자만 보고 있었다 — 금액 확보율 0% 의 절반이 이것이다.
 *
 * ## 인코딩이 결과를 가른다
 *
 * 문서 선언은 `utf-8` 인데 **손상된 바이트가 섞여 온다.** 거기서 cp949 로 넘어가면 라벨
 * (`계약금액`)까지 깨져 아무것도 못 읽는다(실측: 그 한 줄 때문에 4건 → 2건이 됐다).
 * 그래서 **선언을 먼저 읽고**, utf-8 이면 손실을 허용해 디코딩한다. 라벨은 살아남는다.
 */

const SHELL = "https://dart.fss.or.kr/dsaf001/main.do";
const VIEWER = "https://dart.fss.or.kr/report/viewer.do";
const TIMEOUT_MS = 12_000;
/** 뷰어가 돌려주는 본문 상한 — 정기보고서는 20만 자를 넘는다. 앞부분만 본다. */
const MAX_BODY_CHARS = 60_000;

/** `viewDoc("rcpNo", "dcmNo", …)` 에서 문서 번호를 캔다. */
export function parseDcmNo(shellHtml: string): string | null {
  const m = /viewDoc\(\s*"(\d+)"\s*,\s*"(\d+)"/.exec(shellHtml);
  return m?.[2] ?? null;
}

/** 태그를 벗기고 공백을 정리한다. `<COMMENT>` 는 메타라 먼저 버린다. */
export function stripDartMarkup(html: string): string {
  const withoutMeta = html
    .replace(/<COMMENT>[\s\S]*?<\/COMMENT>/gi, " ")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  return withoutMeta
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&cr;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BODY_CHARS);
}

/** 선언을 보고 디코딩한다 — utf-8 선언이면 **손실을 허용**해야 라벨이 살아난다. */
export function decodeDartBody(buffer: ArrayBuffer): string {
  const head = new TextDecoder("ascii").decode(buffer.slice(0, 400)).toLowerCase();
  if (head.includes("utf-8")) return new TextDecoder("utf-8").decode(buffer);
  try {
    return new TextDecoder("euc-kr", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

async function get(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "FomoClub/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // 공시 본문은 확정된 문서다 — 하루 캐시로 같은 rcpNo 를 다시 받지 않는다.
      next: { revalidate: 86_400 },
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** 본문 텍스트. 두 홉 중 어디서든 실패하면 `null`(지어내지 않는다). */
export async function fetchDartBodyText(rceptNo: string | undefined | null): Promise<string | null> {
  const no = rceptNo?.trim();
  if (!no || !/^\d{8,}$/.test(no)) return null;
  const shell = await get(`${SHELL}?rcpNo=${no}`);
  if (!shell) return null;
  const dcmNo = parseDcmNo(await shell.text());
  if (!dcmNo) return null;
  const doc = await get(`${VIEWER}?rcpNo=${no}&dcmNo=${dcmNo}&eleId=0&offset=0&length=0&dtd=HTML`);
  if (!doc) return null;
  return stripDartMarkup(decodeDartBody(await doc.arrayBuffer()));
}

/** 본문에서 읽어낸 것. 둘 다 없으면 부르는 쪽이 아무것도 붙이지 않는다. */
export interface DartBodyFacts {
  earnings?: BodyEarnings;
  amount?: BodyAmount;
}

/** 한 공시의 본문을 읽어 실적표·금액을 뽑는다. 실패 사유는 세는 쪽이 정한다. */
export async function readDartBodyFacts(
  rceptNo: string | undefined | null,
  title: string | undefined | null
): Promise<DartBodyFacts | null> {
  const text = await fetchDartBodyText(rceptNo);
  if (!text) return null;
  const earnings = parseBodyEarnings(text);
  const amount = parseBodyAmount(title, text);
  if (!earnings && !amount) return {};
  return { ...(earnings ? { earnings } : {}), ...(amount ? { amount } : {}) };
}
