import { buildQuietPickHook } from "@fomo/core";
import type { QuietPick } from "./fomoApi";

/**
 * 발행된 payload 의 옛 카피를 화면에서 고친다 (WO-SUB-HOOK — 배치 시차 대응).
 *
 * ## 왜 필요한가
 *
 * 픽 payload 는 **하루 한 번 크론이 구워** `feed-content` 에 저장한다. 즉 코드가 배포돼도
 * 다음 배치가 돌기 전까지 화면에는 **어제 문장이 그대로 나온다**. 실측(2026-08-14 01:02 UTC)
 * 에서 배포 직후 `GET /api/fomo/quiet-picks` 가 여전히
 * `기관이 25일 연속 — 최근 40거래일 중 가장 길어요 — …` 를 주고 있었다.
 *
 * "머지는 완료가 아니다" 가 이 WO 의 완료 조건이고, 배치 실행은 이 WO 범위 밖이다(`하지 않을 것`).
 * 그래서 **읽는 쪽에서 옛 문자열을 고친다.** 새 payload 에는 걸릴 문자열이 없으므로, 다음 배치가
 * 돌면 이 shim 은 자동으로 아무 일도 하지 않는다(제거는 그때 별건으로).
 *
 * 여기서 하는 것은 **용어 치환과 형식 복구뿐이다.** 없는 사실을 만들지 않는다 —
 * 훅 재조립도 payload 의 신호(주체·인원·일수)만 쓴다.
 */

/** 사전 치환 — 긴 표현이 먼저다(부분 치환으로 문장이 뭉개지지 않게). */
const REPAIRS: ReadonlyArray<[RegExp, string]> = [
  [/내부자 클러스터/g, "임원 여러 명이 함께"],
  [/이 관점은 무효예요/g, "이 판단은 다시 봐야 해요"],
  [/약세 관점은 무효예요/g, "약세 판단은 다시 봐야 해요"],
  [/관점 경계/g, "판단 경계"],
  [/무효선/g, "되돌아보는 선"],
  [/내부자/g, "임원"],
  [/이례적으로 몰린/g, "드물게 몰린"],
  [/이례적/g, "드문"],
  [/수급이 먼저 말하는 자리예요/g, "돈이 먼저 움직인 쪽이에요"],
  [/말라 있던 자리예요/g, "말라 있었어요"],
  [/(\d+)% 위 자리예요/g, "$1% 위예요"],
  [/작지 않은 매집이에요/g, "작지 않아요"],
  [/\s?매집/g, ""],
  [/자리는 /g, "시점은 "],
  [/자리도 /g, "시점도 "],
  [/자리예요/g, "시점이에요"],
  [/수급/g, "돈 흐름"],
];

/** 옛 payload 문자열을 화면 카피로 고친다. 이미 새 문구면 그대로 통과한다. */
export function repairPickCopy(text: string | null | undefined): string {
  let out = (text ?? "").trim();
  if (!out) return "";
  for (const [pattern, replacement] of REPAIRS) out = out.replace(pattern, replacement);
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * 옛 훅인가.
 *
 * 새 훅은 **반드시 주체로 시작한다**(기관·외국인·임원). 그것이 H3("무엇이 일어났는지를 먼저")의
 * 구조적 결과다. 그래서 주체가 없는 훅은 옛 것이다 — `거래량도 안 늘었어요` 같은 부정문 훅이
 * 여기서 걸린다. 절을 em-dash 로 이은 훅과 사전에 걸리는 말도 옛 것이다.
 */
export function isLegacyHook(hook: string): boolean {
  if (hook.includes("—") || /내부자|자리|이례적|수급/.test(hook)) return true;
  return !/(기관|외국인|임원)/.test(hook);
}

/**
 * 해요체 결론인가 — `…사고 있어요` / `…샀어요` / `…사들였어요`.
 *
 * 결론은 **명사형**이 정본이다(기획자 모킹 · DS-01 §3-③). payload 는 하루 한 번 구워지므로
 * 배치가 돌기 전까지 해요체 문장이 내려온다 → 읽는 쪽에서 같은 사실로 다시 만든다.
 * 다음 배치 이후엔 이 조건에 걸리는 훅이 없어 아무 일도 하지 않는다.
 */
export function isPoliteBuyHook(hook: string): boolean {
  return /(사고 있어요|샀어요|사들였어요|사고 있습니다)\s*$/.test(hook);
}

/**
 * 카드·뎁스가 쓸 결론. 옛 형식이거나 해요체면 **payload 의 신호·실수치만으로** 다시 만든다.
 * 신호가 없으면 사전 치환만 적용한다 — 문장을 지어내지 않는다.
 */
export function pickHook(pick: QuietPick): string {
  const hook = (pick.hook ?? "").trim();
  if (!hook) return "";
  const stale = isLegacyHook(hook) || isPoliteBuyHook(hook);
  if (!stale) return hook;
  const signal = pick.signal;
  if (!signal?.kind) return repairPickCopy(hook);
  return buildQuietPickHook({
    kind: signal.kind,
    actorNoun: repairPickCopy(signal.actors ?? "").replace(/\s*\d+명$/, ""),
    scale: signal.scale ?? "",
    days: signal.days ?? 0,
    ...(typeof signal.insiderCount === "number" ? { insiderCount: signal.insiderCount } : {}),
    // 새 결론 템플릿은 희소성(1년 매수 건수)·최장 여부로 갈린다 — 실수치를 함께 넘긴다.
    ...pick.signalFacts,
  });
}
