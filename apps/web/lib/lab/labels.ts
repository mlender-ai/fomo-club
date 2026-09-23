/**
 * 화면에 나가는 말 — **여러 화면이 같이 쓰는 것만** 여기 둔다.
 *
 * 한 화면에만 있으면 그 화면에 둔다. 두 곳에 같은 표가 있으면 한쪽만 고쳐져서
 * 화면마다 다른 말을 한다.
 */
import type { PillTone } from "../../components/ui";

/**
 * FCE 청산 사유 → 사람이 읽는 말. **실제로 오는 값**으로 적었다(147건 분포).
 * 모르는 값은 원문 그대로 둔다.
 */
export const EXIT_LABEL: Record<string, string> = {
  invalidation_breach: "전제 무효",
  take_profit_1: "목표 1",
  take_profit_2: "목표 2",
  take_profit_pressure: "목표 부근 압력",
  time_decay: "시간 소모",
  time_stop: "시간 만료",
  breakeven_stop: "본전 정지",
  opposite_stance_flip: "반대 전환",
  duplicate_bootstrap_suppressed: "중복 억제",
};

export function exitLabel(reason: string | null): string {
  if (!reason) return "—";
  return EXIT_LABEL[reason] ?? reason;
}

/**
 * 트랙 상태 → 알약. **초록·빨강을 쓰지 않는다** — 손익이 아니라 상태다(UI-01 A-2).
 * 운용중만 점 하나로 표시한다.
 */
export const TRACK_STATUS: Record<string, { label: string; tone: PillTone; dot?: boolean }> = {
  running: { label: "운용중", tone: "mute", dot: true },
  held: { label: "보류", tone: "warn" },
  stopped: { label: "정지", tone: "mute" },
  excluded: { label: "제외", tone: "mute" },
};

export function trackStatus(status: string): { label: string; tone: PillTone; dot?: boolean } {
  return TRACK_STATUS[status] ?? { label: status, tone: "mute" };
}

/** 롱·숏. */
export function sideLabel(direction: string): string {
  return direction === "short" || direction === "SHORT" ? "숏" : "롱";
}

/** `2026-09-22T12:00:00Z` → `09-22 12:00`. 연도는 화면에서 거의 안 필요하다. */
export function shortStamp(at: string | null): string {
  if (!at) return "—";
  return at.slice(5, 16).replace("T", " ");
}
