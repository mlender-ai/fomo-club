import { companyDisplay, normalizeCompanyName } from "@fomo/core";
import type { QuietPick } from "@/lib/fomoApi";

/**
 * 화면 표기 단일 창구(WO-P6 ③).
 * canonical 은 원장 조인 키라 원문 그대로 보관하고, 사람이 읽는 자리에는 이 함수만 쓴다.
 * 데이터 계층이 이미 normalize 한 subject.displayName 이 있으면 그 값을 우선한다(전 화면 동일 값 보장).
 */
export function subjectName(subject: QuietPick["subject"]): string {
  const fromData = subject.displayName?.trim();
  if (fromData) return fromData;
  return companyDisplay(subject).displayName;
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
