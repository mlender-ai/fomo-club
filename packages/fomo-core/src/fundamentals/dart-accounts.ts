import mapping from "./dart-accounts.json";

/**
 * DART 계정 매핑 (WO-SUB-03.5 지시 ②: "매핑 테이블을 코드에 인라인하지 말고 파일로 관리하고 버전을 찍어").
 *
 * 정본은 `dart-accounts.json` 하나다. 버전 없이 고치면 **과거 파싱 결과의 의미가 달라진다** —
 * 팩트시트에 `mapping_version` 을 남기므로 나중에 어느 체계로 읽은 값인지 구분할 수 있다.
 *
 * 등재 원칙: **실제 DART 응답이 준 `account_id` 만 쓴다.** 표준 계정 ID 를 외부 지식으로
 * 적어 넣는 것은 추측 파서다(WO-SUB-00 규칙).
 */

export type DartStatement = "BS" | "IS" | "CIS" | "CF" | "SCE";

export interface DartAccountField {
  field: string;
  statement: DartStatement;
  /** 우선순위 순서. 앞이 먼저다. */
  account_ids: string[];
  /** 주요계정 응답에는 `account_id` 가 없어 이름으로 찾는다. */
  account_names: string[];
  note?: string;
}

export interface DartAccountMapping {
  mapping_version: string;
  evidenced_at: string;
  evidence: string;
  note: string;
  endpoints: Record<string, { has_account_id: boolean; match_by: "account_id" | "account_nm"; note: string }>;
  fields: DartAccountField[];
  unavailable: Array<{ field: string; reason: string }>;
}

export const DART_ACCOUNTS = mapping as DartAccountMapping;
export const DART_MAPPING_VERSION = DART_ACCOUNTS.mapping_version;

const BY_FIELD = new Map(DART_ACCOUNTS.fields.map((entry) => [entry.field, entry]));

export function dartField(field: string): DartAccountField {
  const found = BY_FIELD.get(field);
  if (!found) throw new Error(`DART 계정 매핑 없음: ${field}`);
  return found;
}

/** 이 필드가 확보 불가로 등재됐는가. `null` 을 내는 것이 정답인 필드다. */
export function dartUnavailableReason(field: string): string | null {
  return DART_ACCOUNTS.unavailable.find((entry) => entry.field === field)?.reason ?? null;
}

export interface DartRow {
  sj_div?: string;
  account_id?: string;
  account_nm?: string;
  thstrm_amount?: string;
  frmtrm_amount?: string;
  bfefrmtrm_amount?: string;
}

/** 쉼표 포함 문자열 금액 → 숫자. 빈 값·`-` 는 `null`(0 으로 읽으면 결측이 값이 된다). */
export function parseDartAmount(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * 필드 1개를 행 목록에서 찾는다.
 *
 * `account_id` 가 있으면 그것으로(우선순위 순서), 없으면 계정명으로 찾는다 —
 * 어느 쪽으로 찾았는지 돌려주므로 감사에서 구분된다.
 */
export function findDartRow(rows: readonly DartRow[], field: string): { row: DartRow; matchedBy: "account_id" | "account_nm"; key: string } | null {
  const spec = dartField(field);
  const inStatement = rows.filter((row) => row.sj_div === spec.statement);
  for (const id of spec.account_ids) {
    const row = inStatement.find((candidate) => candidate.account_id === id);
    if (row) return { row, matchedBy: "account_id", key: id };
  }
  for (const name of spec.account_names) {
    const row = inStatement.find((candidate) => candidate.account_nm?.trim() === name);
    if (row) return { row, matchedBy: "account_nm", key: name };
  }
  return null;
}
