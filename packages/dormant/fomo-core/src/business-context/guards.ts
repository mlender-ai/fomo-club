import type { BusinessContext, SourcedSentence } from "./types";

/**
 * 출력 금지 패턴 (WO-SUB-03 완료 조건 6·7, §9 실패 모드).
 *
 * 이 파일이 막는 두 가지 실패는 성격이 다르다.
 *  ① **소재지·법인격 설명** — 문법적으로 완벽하고 근거도 있지만 사용자에게 정보가 아니다.
 *     현재 CLBK 노출 문구("메릴랜드 주에 소재한 … 주식 보유 회사입니다")가 정확히 이 실패다.
 *     검증 패스는 "근거가 있는가"만 보므로 이건 별도 게이트가 필요하다.
 *  ② **평가 형용사** — 근거로 지지될 수 없는 판단어. INV-09 와 같은 계열.
 */

/**
 * 소재지·법인격만 설명하는 문형. 회사가 **무엇으로 돈을 버는지**를 말하지 않는다.
 * 지명이 문장에 있는 것 자체는 금지가 아니다("뉴저지 100여 개 지점 예대마진"은 정보다) —
 * 금지되는 것은 `~에 소재한 ~회사입니다` 처럼 소재지·법인격이 문장의 **술어**인 경우다.
 */
export const LOCATION_ONLY_PATTERNS: readonly RegExp[] = [
  /소재(한|하는|의)?\s*[^.]{0,20}(지주|보유|holding)?\s*회사\s*(입니다|이다|임)/,
  /본사를?\s*(둔|두고 있는)\s*[^.]{0,20}회사\s*(입니다|이다|임)/,
  /(주식|지분)\s*보유\s*회사\s*(입니다|이다|임)/,
  /지주\s*회사\s*(입니다|이다|임)\s*$/,
  /설립된\s*[^.]{0,20}(회사|기업)\s*(입니다|이다|임)\s*$/,
];

/**
 * 평가 형용사·전망어. 지시서 §4-4 가 명시한 것("우수한·유망한·탄탄한")에
 * 같은 계열을 더했다. 근거 문서에서 지지될 수 없는 판단어다.
 */
export const EVALUATIVE_PATTERNS: readonly RegExp[] = [
  /우수(한|하다|함)/,
  /유망/,
  /탄탄(한|하다|함)/,
  /견고(한|하다|함)/,
  /안정적인\s*성장/,
  /독보적/,
  /선도(적|하는)/,
  /매력적/,
  /저평가|고평가/,
  /(성장|개선|상승|하락)이?\s*(기대|전망|예상)/,
  /수혜/,
];

/**
 * 인과 단정 문형(§3 규칙 4) — 시점 병기까지만 허용한다.
 *
 * **이 가드는 검증 패스가 잡을 수 없는 실패를 담당한다.** 검증기는 "이 사실이 청크에 있나"만 판정하므로
 * 인과는 구조적으로 통과시킨다 — 실측(`EVAL_verifier.md` 케이스 8): "예금 조달비용 상승으로
 * 순이자마진이 하락했다"를 **지지된다**고 판정했다. 청크에 조달비용 상승과 순이자이익이 각각 있으니
 * 검증기 입장에서는 틀리지 않았다. 두 사실을 인과로 이은 것이 문제이고, 그건 여기서 막는다.
 */
export const CAUSAL_PATTERNS: readonly RegExp[] = [
  /때문에/,
  /덕분에/,
  /(으)?로 인해/,
  /영향으로/,
  /(에|이)\s*따라\s*(늘|줄|증가|감소)/,
  // "A 상승으로 B가 하락" 류 — 조사 '(으)로'가 원인을 표시하고 뒤에 변화 서술이 오는 구문.
  /(상승|하락|증가|감소|확대|축소|개선|악화)(으)?로\s+[^.]{0,24}(상승|하락|증가|감소|개선|악화|성장|둔화)/,
  /(으)?로\s+[^.]{0,16}(이|가|은|는)\s*(상승|하락|증가|감소|개선|악화)(했|하였|한|하)/,
];

export interface CopyViolation {
  slot: "slot1" | "slot2" | "slot3";
  rule: "location_only" | "evaluative" | "causal";
  matched: string;
}

function violationsOf(text: string, slot: CopyViolation["slot"]): CopyViolation[] {
  const out: CopyViolation[] = [];
  for (const [rule, patterns] of [
    ["location_only", LOCATION_ONLY_PATTERNS],
    ["evaluative", EVALUATIVE_PATTERNS],
    ["causal", CAUSAL_PATTERNS],
  ] as const) {
    for (const pattern of patterns) {
      const hit = text.match(pattern);
      if (hit) out.push({ slot, rule, matched: hit[0] });
    }
  }
  return out;
}

/** 문장 하나를 검사. 위반이 있으면 그 문장은 폐기 대상이다. */
export function sentenceViolations(sentence: SourcedSentence | null, slot: CopyViolation["slot"]): CopyViolation[] {
  return sentence ? violationsOf(sentence.text, slot) : [];
}

/** 레코드 전체 검사 — 렌더 전 마지막 게이트. 비어 있지 않으면 렌더하지 않는다. */
export function contextViolations(context: BusinessContext): CopyViolation[] {
  return [
    ...sentenceViolations(context.slot1_revenue_source, "slot1"),
    ...sentenceViolations(context.slot2_dependency, "slot2"),
    ...(context.slot3_dependency_state ? violationsOf(context.slot3_dependency_state.text, "slot3") : []),
  ];
}

/** 렌더 가능한 문장인가 — 근거가 있고, 검증을 통과했고, 금지 패턴이 없다. */
export function isRenderable(sentence: SourcedSentence | null, slot: CopyViolation["slot"]): boolean {
  if (!sentence) return false;
  if (!sentence.verified) return false;
  if (sentence.source_ids.length === 0) return false;
  return sentenceViolations(sentence, slot).length === 0;
}
