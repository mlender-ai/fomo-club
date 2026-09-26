/**
 * LAB-08 PART B-2 — **청산 조건은 화면 밖으로 나가지 않는다.**
 *
 * | 보여준다 | 보여주지 않는다 |
 * |---|---|
 * | 진입가 · 현재 손익 · 보유 기간 · 청산 **후** 결과 | 목표가 · 손절선 · 청산 조건 |
 *
 * `OpenPosition` 에는 `stopPrice`·`targetPrice`·`maxHoldBars` 가 들어 있다.
 * **그 객체를 그대로 내보내면 안 된다.** 지금은 혼자 쓰지만 나중에 공개할 때
 * 한 번 새면 되돌릴 수 없다 — 그래서 경계를 지금 만든다.
 *
 * ## 예외 하나 — FCE 페이퍼 포지션 (UI-06 · 광혁 결정 2026-09-26)
 *
 * 포지션 탭은 FCE **페이퍼** 포지션의 무효화·손절·익절을 가격 레일과 차트 선으로 보여준다. UI-06 이
 * 화면의 핵심으로 요구했고, 공개해도 된다고 정했다. 이 규칙은 **랩 자체 엔진**의 포지션에 그대로 남는다.
 * FCE 라이브(Bitget 실계좌) 포지션은 랩이 아예 받지 않는다(`apps/web/lib/lab/positions.ts`).
 *
 * 규칙을 사람 주의력에 맡기지 않는다. `toLivePosition` 은 **칸을 하나씩 옮기고**
 * (스프레드 금지 — 칸이 늘면 그것도 같이 샌다), `findForbiddenKeys` 가 나가는
 * JSON 전체를 훑어 확인한다.
 */
import type { OpenPosition } from "./engine/types";

/** 응답에 있으면 안 되는 칸. 이름만 봐도 청산 조건이 드러나는 것들이다. */
export const FORBIDDEN_LIVE_KEYS: readonly string[] = [
  "stopPrice",
  "targetPrice",
  "maxHoldBars",
  "exitSignalPending",
  "stop_pct",
  "target_pct",
  "max_hold_days",
  "definition",
  "entries",
  "exits",
];

/** 보유 중인 포지션 — **화면에 나가는 형태**. */
export interface LivePosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  /** 평가 손익률(%). 기준가가 없으면 null — 0 으로 채우지 않는다. */
  pnlPct: number | null;
  /** 보유 시간. */
  heldHours: number;
}

/**
 * 보유 포지션에서 **내보낼 칸만 골라** 새 객체를 만든다.
 *
 * `{ ...position }` 을 쓰지 않는 것이 이 함수의 전부다. 스프레드는 오늘의 칸만
 * 막는 게 아니라 **내일 추가될 칸까지 자동으로 내보낸다.**
 */
export function toLivePosition(
  position: OpenPosition,
  mark: number | null,
  now: Date
): LivePosition {
  const pnlPct =
    mark !== null && Number.isFinite(mark) && position.entryPrice > 0
      ? ((position.side === "LONG"
          ? mark - position.entryPrice
          : position.entryPrice - mark) /
          position.entryPrice) *
        100
      : null;

  return {
    symbol: position.symbol,
    side: position.side,
    entryPrice: position.entryPrice,
    pnlPct,
    heldHours: Math.max(0, (now.getTime() - position.entryAt.getTime()) / 3_600_000),
  };
}

/**
 * 나가는 값 전체에서 금지된 칸 이름을 찾는다. 하나라도 나오면 **응답을 내보내지 않는다.**
 *
 * 조용히 지우지 않는 이유: 지우면 다음에 또 들어오고, 그때는 아무도 모른다.
 */
export function findForbiddenKeys(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value !== "object" || value === null) return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const found = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) for (const key of findForbiddenKeys(item, seen)) found.add(key);
    return [...found];
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_LIVE_KEYS.includes(key)) found.add(key);
    for (const nested of findForbiddenKeys(child, seen)) found.add(nested);
  }
  return [...found];
}

/**
 * 페이퍼 한계 문구. **화면에서 빼지 않는다**(LAB-00 §7 · LAB-08 하지 말 것 4).
 *
 * 수수료·슬리피지·펀딩비는 반영한다. 반영하지 **못하는** 것을 적는다.
 */
export const PAPER_CAVEAT =
  "모의 매매다. 수수료·슬리피지·펀딩비는 반영했지만 호가 두께와 시장 충격은 재현할 수 없다. 실매매는 더 나쁘다.";

/** 백테스트 대비 비교를 믿기 시작하는 최소 기간. 이보다 짧으면 **숫자를 내지 않는다.** */
export const COMPARISON_MIN_DAYS = 30;
