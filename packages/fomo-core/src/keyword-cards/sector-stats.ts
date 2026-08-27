/**
 * WO-RESET-05 §4-6 — **업종 평균**. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 왜 이게 3걸음의 핵심인가
 *
 * 상세의 「값」이 이랬다:
 *
 * ```
 * PER  12.25배
 * PBR   0.88배
 * ```
 *
 * **12.25배가 싼 건지 비싼 건지 읽는 사람은 모른다.** 숫자 하나만으로는 아무 말도 안 한 것과
 * 같다. 비교 기준이 있어야 문장이 된다 — `같은 업종 평균 18배보다 낮아요`.
 *
 * ## 새로 모으는 것이 없다
 *
 * 팩트시트를 이미 전부 읽고 있다(`readAllFactSheets`). 거기 `classification.industry` ·
 * `valuation.per_ttm` · `balance.debt_to_equity` 가 다 들어 있다. **묶어서 중앙값을 내면 끝이다.**
 * 유니버스 때와 같다 — 데이터는 와 있었고 안 쓰고 있었다.
 *
 * ## 중앙값을 쓴다
 *
 * 평균이 아니다. PER 은 적자 직전 종목에서 수백 배로 튀어서 평균을 통째로 망가뜨린다.
 * 중앙값은 그 한 종목에 흔들리지 않는다. (화면 문구는 「평균」이라고 쓰지 않는다 —
 * `업종 중간값` 이라고 쓴다. 아닌 것을 그렇다고 하지 않는다.)
 */

/** 업종 비교에 쓸 지표. 팩트시트가 그대로 들고 있는 것만. */
export interface SectorStat {
  per: number | null;
  pbr: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
  /** 이 통계를 만든 종목 수 — 몇 개로 잰 값인지 화면에서 밝힌다. */
  members: number;
  /** 어느 분류로 묶었나 — `industry`(좁음) 또는 `sector`(상위). */
  level: "industry" | "sector";
  /** 분류 이름 — 화면에 그대로 쓴다. */
  label: string;
}

/**
 * 이 수보다 적으면 통계로 쓰지 않는다.
 *
 * WO §4-6 이 정한 값이다. 세 종목의 중앙값은 가운데 한 종목일 뿐이라 "업종은 이렇다"는 말을
 * 지탱하지 못한다. 모자라면 **상위 분류로 올리고**, 그래도 모자라면 **업종 비교를 안 쓴다**
 * (5년 밴드만 쓴다). 없는 비교를 만들지 않는다.
 */
export const SECTOR_MIN_MEMBERS = 5;

/** 통계를 만들 때 필요한 최소 입력. 팩트시트에서 이 모양만 뽑아 넘긴다. */
export interface SectorStatInput {
  industry: string | null;
  sector: string | null;
  per: number | null;
  pbr: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
}

function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * PER 의 유효 범위.
 *
 * 적자면 PER 이 음수이거나 없다 — 그건 "싸다"가 아니라 **잴 수 없다**이다. 통계에서 뺀다.
 * 위쪽도 자른다: 이익이 0에 가까우면 PER 이 수천 배로 뜨는데, 그건 밸류에이션이 아니라
 * 분모가 0에 가깝다는 뜻이다. 중앙값이라 한두 개엔 안 흔들리지만 애초에 넣지 않는다.
 */
const PER_MIN = 0;
const PER_MAX = 300;

function usablePer(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return v > PER_MIN && v <= PER_MAX ? v : null;
}

/** PBR·부채비율은 음수가 나올 수 있다(자본잠식). 그건 통계가 아니라 개별 사정이라 뺀다. */
function usablePositive(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return v > 0 ? v : null;
}

function statOf(rows: readonly SectorStatInput[], level: "industry" | "sector", label: string): SectorStat {
  return {
    per: median(rows.map((r) => usablePer(r.per)).filter((v): v is number => v !== null)),
    pbr: median(rows.map((r) => usablePositive(r.pbr)).filter((v): v is number => v !== null)),
    debtToEquity: median(rows.map((r) => usablePositive(r.debtToEquity)).filter((v): v is number => v !== null)),
    dividendYield: median(
      rows.map((r) => (r.dividendYield !== null && Number.isFinite(r.dividendYield) ? r.dividendYield : null))
        .filter((v): v is number => v !== null)
    ),
    members: rows.length,
    level,
    label,
  };
}

/**
 * 분류별 통계표. 좁은 분류(`industry`)와 상위 분류(`sector`)를 **둘 다** 만든다 —
 * 조회할 때 좁은 것부터 보고 모자라면 상위로 내려간다.
 *
 * 키는 `industry:<이름>` · `sector:<이름>` 로 접두를 붙인다. 두 분류 체계에 같은 이름이
 * 있을 수 있어서 그냥 이름만 쓰면 섞인다.
 */
export function buildSectorStats(rows: readonly SectorStatInput[]): Map<string, SectorStat> {
  const byIndustry = new Map<string, SectorStatInput[]>();
  const bySector = new Map<string, SectorStatInput[]>();
  for (const row of rows) {
    const ind = row.industry?.trim();
    const sec = row.sector?.trim();
    if (ind) (byIndustry.get(ind) ?? byIndustry.set(ind, []).get(ind)!).push(row);
    if (sec) (bySector.get(sec) ?? bySector.set(sec, []).get(sec)!).push(row);
  }
  const out = new Map<string, SectorStat>();
  for (const [label, group] of byIndustry) {
    if (group.length >= SECTOR_MIN_MEMBERS) out.set(`industry:${label}`, statOf(group, "industry", label));
  }
  for (const [label, group] of bySector) {
    if (group.length >= SECTOR_MIN_MEMBERS) out.set(`sector:${label}`, statOf(group, "sector", label));
  }
  return out;
}

/**
 * 이 종목에 쓸 통계 — **좁은 분류부터**. 없으면 상위, 그것도 없으면 `null`.
 *
 * `null` 이면 화면은 업종 비교를 **안 쓴다**. 5년 밴드로 갈아탄다(WO §4-3 우선순위 ②).
 * 비교 기준이 없으면 그 숫자를 아예 안 보여준다 — 맨숫자를 남기지 않는다.
 */
export function sectorStatFor(
  stats: ReadonlyMap<string, SectorStat>,
  classification: { industry: string | null; sector: string | null }
): SectorStat | null {
  const ind = classification.industry?.trim();
  if (ind) {
    const hit = stats.get(`industry:${ind}`);
    if (hit) return hit;
  }
  const sec = classification.sector?.trim();
  if (sec) {
    const hit = stats.get(`sector:${sec}`);
    if (hit) return hit;
  }
  return null;
}
