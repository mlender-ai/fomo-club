/**
 * LAB-03 PART B-2 — 시세 끊김 판정.
 *
 * > **끊긴 채로 계속 매매하면 성과가 거짓이 된다.**
 *
 * 그래서 판정을 한 곳에 둔다. 화면(`LAB-08`)과 페이퍼 실행기(`LAB-07`)가
 * **같은 함수**를 쓴다 — 둘이 따로 판단하면 화면은 초록인데 실행기는 멈춰 있는
 * 상태가 생기고, 그러면 왜 안 사는지 아무도 모른다.
 *
 * 순수 함수다. `now` 를 인자로 받는 이유가 그것이다.
 */

/** 데이터 상태. `stale` 이면 **신규 진입을 멈춘다.** */
export type Freshness = "fresh" | "stale" | "missing";

export interface FreshnessInput {
  symbol: string;
  /** 우리가 시세를 받은 시각. 한 번도 못 받았으면 null. */
  fetchedAt: Date | null;
}

export interface FreshnessResult {
  symbol: string;
  status: Freshness;
  /** 마지막 수신 이후 경과 밀리초. 한 번도 못 받았으면 null. */
  ageMs: number | null;
}

export interface FeedStatus {
  /** 하나라도 stale·missing 이면 false. **이게 신규 진입 허용 여부다.** */
  ok: boolean;
  /** 진입을 막아야 하는 종목. 비어 있으면 전부 신선하다. */
  blocked: string[];
  symbols: FreshnessResult[];
  staleAfterMs: number;
  checkedAt: Date;
}

/** 한 종목의 신선도. */
export function freshnessOf(
  input: FreshnessInput,
  now: Date,
  staleAfterMs: number
): FreshnessResult {
  if (!input.fetchedAt) return { symbol: input.symbol, status: "missing", ageMs: null };
  const ageMs = now.getTime() - input.fetchedAt.getTime();
  return {
    symbol: input.symbol,
    // 미래 시각(시계 어긋남)은 신선한 것으로 본다 — 그건 별개 문제고,
    // 여기서 stale 로 만들면 시계 하나 틀렸다고 매매가 멈춘다.
    status: ageMs > staleAfterMs ? "stale" : "fresh",
    ageMs,
  };
}

/**
 * 유니버스 전체 상태.
 *
 * **한 종목이라도 끊기면 `ok` 가 false 다.** 끊긴 종목만 막고 나머지는 사도 되지
 * 않나 싶지만, 끊김이 한 종목에서 보이면 대개 수집 자체가 멈춘 것이다.
 * 진입을 막는 쪽이 틀렸을 때의 손해가 작다 — 기회를 놓칠 뿐 거짓 성과는 안 남는다.
 * 종목별 판단이 필요해지면 `symbols` 를 보면 된다.
 */
export function feedStatus(
  inputs: readonly FreshnessInput[],
  now: Date,
  staleAfterMs: number
): FeedStatus {
  const symbols = inputs.map((input) => freshnessOf(input, now, staleAfterMs));
  const blocked = symbols.filter((s) => s.status !== "fresh").map((s) => s.symbol);
  return {
    ok: blocked.length === 0 && symbols.length > 0,
    blocked,
    symbols,
    staleAfterMs,
    checkedAt: now,
  };
}

/** 사람이 읽는 한 줄. 화면이 그대로 쓴다. */
export function describeAge(ageMs: number | null): string {
  if (ageMs === null) return "수신 없음";
  if (ageMs < 0) return "방금";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
