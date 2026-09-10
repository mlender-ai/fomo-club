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
 * 중앙값은 그 한 종목에 흔들리지 않는다. (화면 표시는 `평균` 이다 — `중간값` 은 통계
 * 용어라 읽는 사람에게 장벽이고, 중앙값이라는 사실은 계산 방법 줄이 밝힌다. FIX-01 E-2.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## FIX-02 PART B — **업종 평균이 자기 자신이었다**
 *
 * Pinnacle Financial 실측 화면:
 *
 * ```
 * PBR      1.02배    Major Banks 업종 중간값 1.02배와 비슷해요
 * 부채비율  770.3%    Major Banks 업종 중간값 770.3%와 비슷해요
 * ```
 *
 * **두 숫자가 완전히 똑같다.** 원인은 둘이고 **둘 다 이 파일에 있었다.**
 *
 * ### ① 5종목 게이트가 그룹 크기만 봤다
 *
 * `SECTOR_MIN_MEMBERS` 를 `rows.length` 에만 걸었다. 그런데 중앙값은 **그 지표를 가진
 * 종목만**으로 낸다 — 5종목 그룹에서 `pbr` 을 가진 종목이 하나뿐이면 그 하나의 값이
 * 중앙값이 된다. 그 하나가 조회 중인 종목이면 **자기 값과 자기를 견주는 것**이다.
 * 그래서 게이트를 **지표별 표본 수**로 옮긴다.
 *
 * ### ② 자기 자신을 표본에서 빼지 않았다
 *
 * `다른 은행 12곳 평균` 이라고 말하려면 그 12곳에 자기가 없어야 한다. 그래서 이 파일은
 * 이제 **중앙값을 미리 굳히지 않고 표본 목록을 들고 있다** — 읽는 쪽이 자기 값을 빼고
 * 그 자리에서 중앙값을 낸다(`sectorComparison`).
 *
 * 표본 목록은 **굽는 경로 안에만 있다.** 화면에 가는 것은 문장이고, 이 배열은 페이로드에
 * 실리지 않는다.
 */

/** 업종 비교에 쓸 지표 이름. 팩트시트가 그대로 들고 있는 것만. */
export type SectorMetric = "per" | "pbr" | "debtToEquity" | "dividendYield";

/**
 * 한 분류의 표본. **중앙값을 미리 굳히지 않는다**(FIX-02 B-3) — 읽는 쪽이 자기 값을 빼고
 * 그 자리에서 낸다. 값 목록은 굽는 경로 안에만 있고 페이로드에 실리지 않는다.
 */
export interface SectorStat {
  /** 지표별 **쓸 수 있는 값**만 모은 목록. 정렬돼 있다(중앙값을 자주 다시 내므로). */
  samples: Readonly<Record<SectorMetric, readonly number[]>>;
  /** 이 분류에 묶인 종목 수. **지표별 표본 수와 다르다** — 게이트는 표본 수로 건다. */
  members: number;
  /** 어느 분류로 묶었나 — `industry`(좁음) 또는 `sector`(상위). */
  level: "industry" | "sector";
  /** 분류 원문 이름. 화면 표시명 변환은 `sector-display` 가 한다. */
  label: string;
}

/** 자기 자신을 뺀 비교 결과. 표본이 모자라면 아예 `null` 이라 문장이 만들어지지 않는다. */
export interface SectorComparison {
  /** 분류 원문 이름. */
  label: string;
  level: "industry" | "sector";
  /** 자기 자신을 뺀 중앙값. */
  median: number;
  /** **몇 곳과 견줬나** — 화면이 이 수를 밝힌다(`다른 은행 12곳 평균`, FIX-02 B-4). */
  count: number;
}

/**
 * 이 수보다 적으면 통계로 쓰지 않는다. **자기 자신을 뺀 비교 대상 수**에 건다(FIX-02 B-2).
 *
 * WO §4-6 이 정한 값이다. 세 종목의 중앙값은 가운데 한 종목일 뿐이라 "업종은 이렇다"는 말을
 * 지탱하지 못한다. 모자라면 **상위 분류로 올리고**, 그래도 모자라면 **업종 비교를 안 쓴다**
 * (5년 밴드만 쓴다). 없는 비교를 만들지 않는다.
 *
 * 종전에는 이 수를 **그룹 종목 수**에 걸었다. 그래서 5종목 그룹에서 그 지표를 가진 종목이
 * 하나뿐일 때 그 하나(= 조회 중인 종목 자신)가 중앙값이 됐다.
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
  const collect = (pick: (r: SectorStatInput) => number | null): number[] =>
    rows
      .map(pick)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
  return {
    samples: {
      per: collect((r) => usablePer(r.per)),
      pbr: collect((r) => usablePositive(r.pbr)),
      debtToEquity: collect((r) => usablePositive(r.debtToEquity)),
      dividendYield: collect((r) => (r.dividendYield !== null && Number.isFinite(r.dividendYield) ? r.dividendYield : null)),
    },
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
 *
 * **크기로 걸러내지 않는다**(FIX-02 B-2): 게이트는 지표별 표본 수라 읽는 쪽에서 건다.
 * 여기서 미리 잘라내면 「PBR 은 표본이 충분한데 부채비율은 모자란」 분류를 통째로 잃는다.
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
  for (const [label, group] of byIndustry) out.set(`industry:${label}`, statOf(group, "industry", label));
  for (const [label, group] of bySector) out.set(`sector:${label}`, statOf(group, "sector", label));
  return out;
}

/**
 * 이 종목에 쓸 후보 — **좁은 분류부터, 그다음 상위 분류.**
 *
 * 종전 `sectorStatFor` 는 하나만 돌려줬다. 이제 **둘 다** 돌려준다 — 지표마다 표본 수가
 * 다르므로 「PBR 은 좁은 분류로, 부채비율은 상위 분류로」가 정상 결과다(FIX-02 B-2 사다리).
 */
export function sectorCandidates(
  stats: ReadonlyMap<string, SectorStat>,
  classification: { industry: string | null; sector: string | null }
): SectorStat[] {
  const out: SectorStat[] = [];
  const ind = classification.industry?.trim();
  if (ind) {
    const hit = stats.get(`industry:${ind}`);
    if (hit) out.push(hit);
  }
  const sec = classification.sector?.trim();
  if (sec) {
    const hit = stats.get(`sector:${sec}`);
    if (hit) out.push(hit);
  }
  return out;
}

/** 정렬된 목록의 중앙값. 빈 목록이면 `null`. */
function medianOfSorted(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * **자기 자신을 뺀** 업종 비교 (FIX-02 B-2·B-3).
 *
 * 후보를 좁은 분류부터 보고, **비교 대상이 `SECTOR_MIN_MEMBERS` 이상인 첫 분류**를 쓴다.
 * 어디에서도 모자라면 `null` — 호출부는 업종 비교를 쓰지 않고 5년 밴드로 간다.
 *
 * `own` 을 빼는 방식: **값이 같은 항목 하나만** 지운다. 같은 값을 가진 다른 종목이 있어도
 * 그 하나까지 지우면 표본이 줄어든다 — 지우는 것은 자기 한 몫이다.
 */
export function sectorComparison(
  candidates: readonly SectorStat[],
  metric: SectorMetric,
  own: number | null
): SectorComparison | null {
  for (const stat of candidates) {
    const samples = stat.samples[metric];
    const others = typeof own === "number" && Number.isFinite(own) ? removeOne(samples, own) : [...samples];
    if (others.length < SECTOR_MIN_MEMBERS) continue;
    const median = medianOfSorted(others);
    if (median === null) continue;
    return { label: stat.label, level: stat.level, median, count: others.length };
  }
  return null;
}

/** 정렬을 유지하며 `value` 와 같은 항목 **하나**만 지운다. 없으면 그대로 돌려준다. */
function removeOne(sorted: readonly number[], value: number): number[] {
  const out = [...sorted];
  const at = out.findIndex((v) => Math.abs(v - value) < 1e-9);
  if (at >= 0) out.splice(at, 1);
  return out;
}
