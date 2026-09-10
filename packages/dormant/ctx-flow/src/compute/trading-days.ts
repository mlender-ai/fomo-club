/**
 * 거래일 캘린더 도출 (CTX-01 §3-1 규칙 3 · 완료조건 4).
 *
 * `computeStreak` 는 거래일 목록을 요구한다. 그런데 저장소에 휴장일 헬퍼가 없다(2026-08-16 실측).
 * 새 소스를 붙이기 전에, **이미 가진 데이터로 휴장과 결손을 가를 수 있다.**
 *
 * ```
 * 휴장일        → 시장 전체가 데이터 없음
 * 거래정지·결손 → 그 종목만 없고 나머지는 있음
 * ```
 *
 * 그래서 **시장 전체 관측 비율**로 판정한다. 종목 하나만 보면 두 경우가 똑같이 "행이 없음" 이라
 * 구분이 불가능한데, 시장 전체를 보면 갈린다. 이것이 결손을 건너뛰고 이어붙이는 실패 모드를
 * 막는 핵심이다 — 거래정지 종목의 빈 날은 **결손으로 남아 연속을 끊어야** 한다.
 *
 * 한계는 정직하게 적는다. 유니버스 전체가 수집 실패한 날은 휴장으로 오인된다.
 * 그런 날은 연속이 끊기지 않고 **이어붙는다** — 그래서 `minObserved` 하한을 둔다.
 */

export interface TradingDayOptions {
  /** 거래일로 인정할 최소 관측 비율(0~1). 기본 0.5 — 절반 넘게 관측되면 시장이 열렸다고 본다. */
  minRatio?: number;
  /**
   * 비율과 무관하게 필요한 최소 관측 종목 수. 기본 5.
   *
   * 유니버스가 작을 때 한두 종목만 보고 "거래일" 이라 판정하는 것을 막는다. 표본이 얇으면
   * 판정하지 않는 쪽이 안전하다 — 잘못 거래일로 세면 결손이 이어붙고, 잘못 휴장으로 세면
   * 연속이 조금 짧아질 뿐이다. **틀릴 거면 짧게 틀린다.**
   */
  minObserved?: number;
}

/**
 * @param datesByTicker 종목별 "데이터가 있는 날짜" 목록. 유니버스 전체를 넣을수록 정확해진다.
 * @returns 오름차순 거래일(YYYY-MM-DD).
 */
export function deriveTradingDays(
  datesByTicker: readonly (readonly string[])[],
  options: TradingDayOptions = {}
): string[] {
  const minRatio = options.minRatio ?? 0.5;
  const minObserved = options.minObserved ?? 5;

  const tickers = datesByTicker.length;
  if (tickers === 0) return [];

  const observed = new Map<string, number>();
  for (const dates of datesByTicker) {
    // 같은 종목이 같은 날짜를 두 번 주더라도 한 번만 센다.
    for (const date of new Set(dates)) observed.set(date, (observed.get(date) ?? 0) + 1);
  }

  const days: string[] = [];
  for (const [date, count] of observed) {
    if (count < minObserved) continue;
    if (count / tickers < minRatio) continue;
    days.push(date);
  }
  return days.sort();
}
