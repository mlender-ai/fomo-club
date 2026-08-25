/**
 * 화면에 쓸 당일 등락률 — 못 믿으면 `null`(WO-RESET-01 B-1).
 *
 * ## 왜 프론트에도 두는가
 *
 * 서버(`apps/web/lib/quiet-pick.ts`)가 이미 껍데기 0 을 걸러 페이로드에 안 싣는다. 그런데
 * 페이로드는 **하루에 한 번** 구워지므로, 고친 코드가 배포돼도 그날 이미 구워진 구 페이로드는
 * `changePct: 0` 을 그대로 들고 있다. 그 하루 동안 화면은 여전히 `0.0%` 다.
 *
 * 그래서 그리는 쪽에서도 한 번 더 본다. 서버가 고쳐지면 이 함수는 아무 일도 하지 않는다.
 *
 * ## 왜 0 을 버리나
 *
 * 실측(2026-08-25): 덱 7장이 전부 `0.0%` 였다. `asOf` 가 08:57 KST — **장 시작 3분 전**이라
 * 네이버가 등락률 `0.00%` 껍데기를 줬다. 진짜 보합인 날과 구별할 방법이 없고, `0.0%` 는
 * 사용자에게 아무것도 알려주지 않는다. **구별할 수 없으면 말하지 않는다.**
 */
export function displayChangePct(changePct: number | undefined): number | null {
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) return null;
  if (changePct === 0) return null;
  return changePct;
}
