import { companyDisplay, normalizeCompanyName } from "@fomo/core";
import type { QuietPick } from "@/lib/fomoApi";

/**
 * 화면 표기 단일 창구(WO-P6 ③).
 *
 * canonical 은 원장 조인 키라 원문 그대로 보관하고, 사람이 읽는 자리에는 이 함수만 쓴다.
 * 데이터 계층이 구운 `displayName` 을 우선한다(전 화면 동일 값 보장).
 *
 * ## 과잉 축약은 읽는 쪽에서 되살린다 (DS-05 §4-2)
 *
 * payload 는 하루 한 번 구워진다. 종전 규칙이 `On Holding AG` 를 **`On`** 으로 줄여 놓았고,
 * 그 값이 배치가 돌기 전까지 화면에 남는다. 지금 규칙으로 canonical 을 다시 정규화한 값이
 * **구운 값의 확장**이면(같은 접두 + 더 길다) 그쪽을 쓴다 — 없는 사실을 만드는 게 아니라
 * 잘린 이름을 복원하는 것이다.
 */
export function subjectName(subject: QuietPick["subject"]): string {
  const baked = subject.displayName?.trim();
  const fresh = companyDisplay(subject).displayName;
  if (!baked) return fresh;
  if (fresh.length > baked.length && fresh.startsWith(baked)) return fresh;
  return baked;
}

/** 병기 티커 — US 심볼 / KR 6자리 코드. 없으면 undefined. */
export function subjectTicker(subject: QuietPick["subject"]): string | undefined {
  const fromData = subject.ticker?.trim();
  if (fromData) return fromData;
  return companyDisplay(subject).ticker;
}

/** 원장·성적표처럼 canonical 문자열만 들고 있는 자리용. */
export function canonicalName(canonical: string): string {
  return normalizeCompanyName(canonical);
}
