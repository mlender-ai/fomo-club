/**
 * 햅틱 (DS-06 §2) — **탭에 몸이 반응하는 감각.**
 *
 * ## 웹에서 할 수 있는 것과 없는 것
 *
 * DS-06 은 네이티브 API(iOS `impactLight` / Android `CONTEXT_CLICK`)를 지정한다. 웹에서는
 * `navigator.vibrate` 만 있고 **iOS Safari 는 이것도 없다**. 그래서 이 모듈은
 *
 * - Android·지원 브라우저: 짧은 진동을 준다(light 8ms / medium 16ms)
 * - iOS·미지원: **아무 일도 하지 않는다.** 대체 효과를 흉내내지 않는다
 *
 * 네이티브 앱(`apps/fomo-club`)이 붙을 때 이 함수의 구현만 교체하면 화면 코드는 그대로다 —
 * 호출 지점을 한 곳으로 모아 두는 것이 이 파일의 목적이다.
 *
 * 모션 감소(`prefers-reduced-motion`)를 켠 사용자에게는 진동도 주지 않는다(§7).
 */

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type Strength = "light" | "medium";

/** 세기별 지속시간(ms). 길면 알림처럼 느껴진다 — 탭 피드백은 짧아야 한다. */
const DURATION: Record<Strength, number> = { light: 8, medium: 16 };

export function haptic(strength: Strength = "light"): void {
  if (typeof navigator === "undefined" || reducedMotion()) return;
  const vibrate = (navigator as Navigator & { vibrate?: (pattern: number | Iterable<number>) => boolean }).vibrate;
  if (typeof vibrate !== "function") return;
  try {
    vibrate.call(navigator, DURATION[strength]);
  } catch {
    /* 브라우저가 거부하면 조용히 넘어간다 — 피드백 실패가 동작을 막지 않는다. */
  }
}

/** 관심 등록처럼 "기록됐다"를 알리는 자리 (§2 — 관심만 medium). */
export function hapticMedium(): void {
  haptic("medium");
}
