/**
 * FIX-03 PART A-3 — **다시 나온 종목의 훅은 「지난번과 무엇이 다른가」다.**
 * 순수 함수(네트워크·시간·난수 0).
 *
 * ## 왜 필요한가 — 있는 장치가 안 켜지고 있었다
 *
 * WO-RESET-06 은 재노출 카드의 훅을 `이번엔 ${재등장 사유}` 로 쓰기로 했다. 그 코드는
 * 카드에 **이미 있다**(`QuietPickCard`: `returning && reentryText`). 그런데 실측
 * (2026-09-04 프로덕션 15장 중 재노출 5장)에서 **다섯 장 모두 `signal.reentry` 가 비어
 * 있었다.** 그래서 종전 훅이 그대로 나가고 「무엇이 새로운가」는 화면에 없었다.
 *
 * 이유는 `reentry` 의 재료다 — `detectReentry(prior, …)` 의 `prior` 는 **어제 발행한 픽**이다.
 * 재노출은 보통 **며칠 건너** 일어난다(실측: 8월 29일 → 9월 3일, 8월 30일 → 9월 3일).
 * 어제 덱에 없던 종목은 `prior` 가 없어 `reentry` 가 `null` 이고, 그러면 이 장치가 꺼진다.
 *
 * ## 그래서 **노출 이력**으로 판정한다
 *
 * 노출 이력(`exposure.recent`)은 **며칠 전이든** 지난번에 무엇으로 나왔는지를 들고 있다:
 *
 * ```
 * 녹십자홀딩스  지난번 9월 2일  「22거래일 만에 가장 길게 사고 있어요」(수급)
 *              이번           거래량 8배 (volume_awakening)          → 종류가 다르다
 * 유진기업      지난번 9월 2일  「22거래일 만에 가장 길게 사고 있어요」(수급)
 *              이번           기관 3일째 (institution_streak)        → 같은 종류
 * ```
 *
 * **종류가 바뀐 것만 새로운 일이다.** 같은 종류로 또 나온 것은 어제와 같은 말이고,
 * 그걸 `이번엔` 으로 포장하면 없는 신규성을 지어내는 것이다 — 그때는 `null` 을 준다.
 */

import { josa } from "./josa";

/** 신호를 무엇으로 묶어 보는가 — 지난번과 이번을 견주는 축. */
export type ReexposureKind = "supply" | "volume" | "insider" | "divergence" | "flow" | "unknown";

/**
 * 지난번 노출 사유(문장)에서 종류를 읽는다.
 *
 * 이력에 남는 것은 **문장**이라(당시 화면에 나간 그대로) 코드가 아니다. 그래서 문장에
 * 실제로 박혀 있는 말로만 판정한다 — 추론하지 않고, 모르면 `unknown` 이다.
 * 순서가 규칙의 일부다: `임원` 이 든 문장은 수급 낱말도 같이 갖는 경우가 많다.
 */
export function reexposureKindOf(reason: string | null | undefined): ReexposureKind {
  const text = (reason ?? "").trim();
  if (!text) return "unknown";
  if (/임원|내부자/.test(text)) return "insider";
  /**
   * `거래가 3배로 붙었어요` 처럼 **낱말이 떨어져** 있다. 붙어 있는 것만 보면 놓친다.
   * `22거래일 만에 가장 길게 사고 있어요`(수급)를 잡지 않도록 뒤따르는 말을 함께 본다.
   */
  if (/거래량|거래대금|거래.{0,8}(붙|늘|배로|배가)/.test(text)) return "volume";
  if (/자금|수급이\s*들어/.test(text)) return "flow";
  if (/코스피|코스닥|지수|시장(을|보다)/.test(text)) return "divergence";
  if (/기관|외국인|사고\s*있|순매수|담고\s*있/.test(text)) return "supply";
  return "unknown";
}

/** 이번 신호의 종류 — 검출기 코드로 판정한다(문장 추측이 필요 없다). */
export function kindOfSignal(signalKind: string | null | undefined): ReexposureKind {
  switch ((signalKind ?? "").trim()) {
    case "volume_awakening":
      return "volume";
    case "market_divergence":
      return "divergence";
    case "insider_cluster":
      return "insider";
    case "flow_entry":
      return "flow";
    case "institution_streak":
    case "foreign_streak":
    case "multi_actor":
      return "supply";
    default:
      return "unknown";
  }
}

/**
 * 「이번엔 …」 한 줄. **종류가 바뀌었을 때만** 만든다.
 *
 * 주체가 있는 수급 신호는 주체 이름을 그대로 쓴다(`외국인도` · `기관도`) — 조사는
 * `josa()` 가 붙인다. 주체가 없는 형(거래량·시장 대비)은 그 형의 말을 쓴다.
 *
 * @param previousReason 지난번 노출 사유 문장(노출 이력). 없으면 판정하지 않는다.
 * @param signalKind 이번 검출기 코드.
 * @param actors 이번 매수 주체(`기관` · `외국인·기관`). 수급 형에서만 쓴다.
 */
export function reexposureHook(input: {
  previousReason: string | null | undefined;
  signalKind: string | null | undefined;
  actors?: string | null;
}): string | null {
  const before = reexposureKindOf(input.previousReason);
  const now = kindOfSignal(input.signalKind);
  // 모르는 것끼리 견주지 않는다. 같은 종류면 새로운 일이 아니다.
  if (before === "unknown" || now === "unknown" || before === now) return null;

  switch (now) {
    case "volume":
      return "이번엔 거래도 붙기 시작했어요";
    case "divergence":
      return "이번엔 시장을 앞서기 시작했어요";
    case "flow":
      return "이번엔 자금이 들어오기 시작했어요";
    case "insider":
      return "이번엔 임원도 사기 시작했어요";
    case "supply": {
      const actor = input.actors?.trim();
      if (!actor) return "이번엔 수급도 붙기 시작했어요";
      return `이번엔 ${actor}${josa(actor, "이가")} 사기 시작했어요`;
    }
    default:
      return null;
  }
}
