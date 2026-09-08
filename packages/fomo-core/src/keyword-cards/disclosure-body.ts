/**
 * LAUNCH-P2 §A-2 경로 A · §B — **공시 본문에서 숫자를 읽는다.** 순수 함수(네트워크 0).
 *
 * ## 왜 본문인가 — 제목에는 금액이 없다
 *
 * 실측(2026-09-08, 프로덕션 공시 27건): **제목에 금액 표기가 있는 건이 0건**이다.
 * 그런데 `disclosureScaleNote` 는 **제목만** 읽고 있었다 — 그래서 금액 확보율이 0% 였다.
 * 금액은 본문에 있고, 본문은 열쇠 없이 읽을 수 있다(DART 뷰어).
 *
 * ```
 * 단일판매·공급계약체결        본문: 계약금액(원) 40,480,580,000     ← 404.8억
 * 자기주식취득 신탁계약 체결    본문: 1. 계약금액(원) 10,000,000,000  ← 100억
 * 연결재무제표기준영업(잠정)실적  본문: 매출액 당해실적 22,574 … 전년동기 14,661 (백만원)
 * ```
 *
 * ## 잠정실적 공시는 **팩트시트가 없어도** 숫자를 낼 수 있다
 *
 * 종전 경로(`earningsFigures`)는 팩트시트의 분기 재무와 공시를 조인했다. 그런데 잠정실적
 * 공시 본문에는 **당기와 전년동기가 같은 표에** 들어 있다 — 조인 없이 그 자리에서 완성된다.
 * 조인이 실패하는 날에도 이 경로가 살아 있다(지시서 §A-2 의 「A가 실패하면 B로 폴백」의 반대편).
 *
 * ## 지어내지 않는 규칙
 *
 * - **열이 다 있어야 읽는다.** 잠정실적 표는 7열(당기·전기·전기대비·전환·전년동기·전년동기대비·전환)
 *   이고, 7개가 안 되면 그 줄을 **버린다**. 자리를 세어 읽는 파서는 열이 밀리면 조용히 틀린다.
 * - **단위를 못 읽으면 읽지 않는다.** `단위 : 백만원` 을 못 찾으면 값의 자릿수를 알 수 없다.
 * - **금액은 종류별로만 찾는다.** 정기보고서 본문에는 각주의 `배당금액(USD, 천)` 같은 숫자가
 *   섞여 있다(실측에서 실제로 잡혔다). 금액이 **그 공시의 주제인 서식**에서만 찾는다.
 * - 손상된 글자를 만나도 라벨은 살린다 — DART 문서 일부는 `계약금액(?��)` 처럼 괄호 안이
 *   깨져 온다. 괄호 안을 단위로 못 읽으면 **원**으로 본다(주요사항보고서 금액 필드는 원 단위다).
 */

/** 본문에서 읽은 한 항목. */
export interface BodyEarningsRow {
  label: "매출" | "영업이익" | "순이익";
  /** 당기 금액(원). */
  now: number;
  /** 전년 동기 금액(원). */
  prior: number;
}

export interface BodyEarnings {
  /** `2026년 2분기` — 본문 헤더의 `(26년2분기)` 에서 읽는다. 못 읽으면 이 블록이 없다. */
  periodLabel: string;
  rows: BodyEarningsRow[];
}

/** 본문 금액 한 건. */
export interface BodyAmount {
  /** 본문에 적힌 라벨 그대로 — `계약금액` · `취득금액`. */
  label: string;
  /** 원 단위 금액. */
  won: number;
}

/**
 * 본문에 **당기·전년동기 표**를 갖는 서식.
 *
 * 정기보고서(반기·사업보고서)는 여기 없다 — 재무제표 전체가 들어 있어서 이 파서의 7열 표와
 * 모양이 다르고, 남의 숫자를 이 공시의 실적이라고 말할 위험이 크다. 그쪽은 팩트시트 조인
 * (`earningsFigures`)이 담당한다. **두 경로가 서로 다른 서식을 맡는다.**
 */
export const EARNINGS_BODY_FORM = /영업[\s(ㆍ·]*잠정[\s)]*실적|연결재무제표기준영업|매출액또는손익구조|손익구조\s*30/;

/** 잠정실적 표의 열 수(당기·전기·전기대비·전환·전년동기·전년동기대비·전환). */
const EARNINGS_COLUMNS = 7;
/** 전년동기 실적이 있는 열 번호(0부터). */
const PRIOR_COLUMN = 4;

const UNIT_WON: Record<string, number> = {
  원: 1,
  천원: 1_000,
  만원: 10_000,
  백만원: 1_000_000,
  십억원: 1_000_000_000,
  억원: 100_000_000,
};

/** `단위 : 백만원` → 1_000_000. 못 찾으면 `null` — **자릿수를 모르면 읽지 않는다.** */
export function parseBodyUnit(text: string): number | null {
  const m = /단위\s*[:：]\s*([가-힣]+원)/.exec(text);
  const unit = m?.[1];
  return unit && unit in UNIT_WON ? UNIT_WON[unit]! : null;
}

/** `-1,289` → -1289. 숫자로 안 읽히면 `null`. */
function num(token: string | undefined): number | null {
  if (!token) return null;
  const cleaned = token.replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * 이 공시가 말하는 분기 — **`실적기간 당기실적` 의 종료일에서** 읽는다.
 *
 * 헤더의 `(26년2분기)` 를 읽으려 했더니 테스트가 버그를 잡았다: 같은 표에 전년동기 헤더
 * `(25년2분기)` 도 있어서 **첫 괄호를 집으면 작년 분기를 이 공시의 기간이라고 말한다.**
 * 기간 라인은 하나뿐이고 날짜가 명시돼 있으므로 그쪽이 근거다.
 *
 * 괄호 헤더가 함께 있으면 **교차 검증**한다 — 둘이 어긋나면 `null`(둘 중 어느 쪽이
 * 맞는지 우리가 모른다).
 */
export function parseBodyPeriod(text: string): string | null {
  const range = /당기\s*실적\s*(\d{4})-(\d{2})-(\d{2})\s*~\s*(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!range) return null;
  const year = Number(range[4]);
  const endMonth = Number(range[5]);
  if (!Number.isFinite(year) || !Number.isFinite(endMonth) || endMonth < 1 || endMonth > 12) return null;
  const quarter = Math.ceil(endMonth / 3);
  const label = `${year}년 ${quarter}분기`;

  const header = /\((\d{2})년\s*([1-4])분기\)/.exec(text);
  if (header) {
    const headerLabel = `20${header[1]}년 ${header[2]}분기`;
    if (headerLabel !== label) return null;
  }
  return label;
}

/** 본문에서 항목 한 줄을 찾는다. `<라벨> 당해실적 <7열>`. */
function earningsRow(text: string, bodyLabel: string, unit: number): { now: number; prior: number } | null {
  const at = text.indexOf(bodyLabel);
  if (at < 0) return null;
  const after = text.slice(at + bodyLabel.length, at + bodyLabel.length + 220);
  const marker = /당해\s*실적/.exec(after);
  if (!marker) return null;
  const cells = after
    .slice(marker.index + marker[0].length)
    .trim()
    .split(/\s+/)
    .slice(0, EARNINGS_COLUMNS);
  // **열이 다 있어야 읽는다** — 밀린 표를 자리로 읽으면 조용히 틀린다.
  if (cells.length < EARNINGS_COLUMNS) return null;
  const now = num(cells[0]);
  const prior = num(cells[PRIOR_COLUMN]);
  if (now === null || prior === null) return null;
  return { now: now * unit, prior: prior * unit };
}

/** 본문 라벨 → 화면 라벨. 순서가 표의 순서다. */
const EARNINGS_LABELS: ReadonlyArray<[string, BodyEarningsRow["label"]]> = [
  ["매출액", "매출"],
  ["영업이익", "영업이익"],
  ["당기순이익", "순이익"],
];

/**
 * 잠정실적 공시 본문 → 당기·전년동기 실적.
 *
 * 기간·단위 중 하나라도 못 읽으면 `null` 이다. 항목이 하나도 안 읽히면 역시 `null` —
 * **빈 블록을 만들지 않는다.**
 */
export function parseBodyEarnings(text: string): BodyEarnings | null {
  const compact = text.replace(/ /g, " ");
  const unit = parseBodyUnit(compact);
  const periodLabel = parseBodyPeriod(compact);
  if (unit === null || !periodLabel) return null;

  const rows: BodyEarningsRow[] = [];
  for (const [bodyLabel, label] of EARNINGS_LABELS) {
    const found = earningsRow(compact, bodyLabel, unit);
    if (found) rows.push({ label, now: found.now, prior: found.prior });
  }
  return rows.length > 0 ? { periodLabel, rows } : null;
}

/* ────────────────────────────────────────────────────────────────────────────
   §B — 금액. **그 공시의 주제인 서식에서만 찾는다.**
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * 금액이 **그 공시의 주제**인 서식과, 본문에서 찾을 라벨.
 *
 * 지시서 §B-2 의 8종을 따른다. 정기보고서(반기·사업보고서)는 **여기 없다** — 본문에 남의
 * 숫자가 섞여 있어서(실측: 각주의 `배당금액(USD, 천)`) 그걸 이 공시의 금액이라고 말하면 거짓이다.
 */
export const AMOUNT_FORMS: ReadonlyArray<{ title: RegExp; labels: readonly string[] }> = [
  { title: /단일판매|공급계약|수주/, labels: ["계약금액", "공급금액", "수주금액"] },
  { title: /자기주식취득/, labels: ["취득금액", "계약금액", "취득예정금액"] },
  { title: /자기주식처분/, labels: ["처분금액", "처분예정금액"] },
  { title: /유상증자|주주배정|일반공모/, labels: ["모집총액", "발행금액", "자금조달금액"] },
  { title: /전환사채|신주인수권부사채|교환사채/, labels: ["발행금액", "권면총액", "사채의권면총액"] },
  { title: /담보제공/, labels: ["담보금액", "채무금액"] },
  { title: /신규시설투자|시설투자/, labels: ["투자금액", "투자총액"] },
  { title: /타법인주식|출자증권|주식취득/, labels: ["취득금액", "취득가액"] },
  { title: /현금[·ㆍ]?현물배당|배당결정/, labels: ["배당금액", "총배당금액"] },
];

/**
 * 유상증자는 금액이 **한 필드에 없다** — `신주수 × 발행가액` 이다(§B-2 는 「발행금액·주식수」로 적었다).
 *
 * 실측(20260821800396)에서 두 필드가 다 라벨을 갖고 있었고, 그 곱이 본문의 다른 라벨
 * (`영업양수자금(원) 401,114,915,289`)과 **일치**했다:
 *
 * ```
 * 신주의 종류와 수 보통주식(주)      274,683
 * 신주 발행가액 확정발행가 보통주식(원) 1,460,283
 * 274,683 × 1,460,283 = 401,114,915,... 
 * ```
 *
 * 이것은 추정이 아니라 **공시된 두 값 사이의 항등식**이다(SEC 4분기를 연간−1~3분기로
 * 구성하는 것과 같은 성격). 둘 중 하나라도 못 읽으면 만들지 않는다.
 */
const RIGHTS_SHARES = /신주의\s*종류와\s*수[^0-9]{0,40}?([0-9][0-9,]{2,})/;
const RIGHTS_PRICE = /신주\s*발행가액[^0-9]{0,40}?([0-9][0-9,]{2,})/;

/** 유상증자의 모집총액 = 신주수 × 발행가액. 못 만들면 `null`. */
export function parseRightsIssueAmount(text: string): BodyAmount | null {
  const shares = num(RIGHTS_SHARES.exec(text)?.[1]);
  const price = num(RIGHTS_PRICE.exec(text)?.[1]);
  if (shares === null || price === null || shares <= 0 || price <= 0) return null;
  const won = shares * price;
  // 한 주 값이 수천만 원을 넘거나 총액이 조를 넘으면 자리 수를 잘못 읽은 것이다 — 버린다.
  if (price > 100_000_000 || won > 500_000_000_000_000) return null;
  return { label: "모집총액", won };
}

/** 그 제목이 금액을 주제로 하는 서식인가. 아니면 본문을 뒤지지 않는다. */
export function amountLabelsFor(title: string | null | undefined): readonly string[] | null {
  const compact = (title ?? "").replace(/\s+/g, "");
  if (!compact) return null;
  for (const form of AMOUNT_FORMS) if (form.title.test(compact)) return form.labels;
  return null;
}

/**
 * 본문에서 그 서식의 금액을 읽는다. 못 읽으면 `null` — **0으로 채우거나 지어내지 않는다**(§B-4).
 *
 * 괄호 안 단위가 깨져 있으면 **원**으로 본다. 주요사항보고서의 금액 필드는 원 단위이고,
 * 다른 단위를 쓸 때는 `단위 : 백만원` 처럼 표 위에 따로 적는다.
 */
export function parseBodyAmount(title: string | null | undefined, text: string): BodyAmount | null {
  const labels = amountLabelsFor(title);
  if (!labels) return null;
  /**
   * 유상증자는 라벨 하나로 안 된다 — 곱으로 만든다. 라벨 탐색보다 **먼저** 시도한다
   * (본문에 `영업양수자금` 처럼 그 증자의 용처를 적은 다른 금액이 섞여 있을 수 있다).
   */
  if (/유상증자|주주배정|일반공모/.test((title ?? "").replace(/\s+/g, ""))) {
    const derived = parseRightsIssueAmount(text);
    if (derived) return derived;
  }
  for (const label of labels) {
    /**
     * `계약금액(원) 40,480,580,000` · `1. 계약금액(?��) 10,000,000,000` 둘 다 읽는다.
     * 괄호 안은 **숫자가 아닌 무엇이든** 허용한다(손상된 글자가 들어온다).
     */
    const re = new RegExp(`${label}\\s*[（(\\[]?\\s*([^)）\\]\\d]{0,14})?[)）\\]]?\\s*[:：]?\\s*(-?[0-9][0-9,]{2,})`);
    const m = re.exec(text);
    if (!m) continue;
    const raw = num(m[2]);
    if (raw === null || raw <= 0) continue;
    const inParen = (m[1] ?? "").replace(/\s+/g, "");
    const unit = inParen in UNIT_WON ? UNIT_WON[inParen]! : 1;
    return { label, won: raw * unit };
  }
  return null;
}
