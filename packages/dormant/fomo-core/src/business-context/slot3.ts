import { dependencyVariable, mapDependencyVariable } from "./dependency-variables";
import type { DependencyState } from "./types";

/**
 * 슬롯 3 렌더 (WO-SUB-03 §4-6).
 *
 * **템플릿 고정, 자유 서술 금지, 인과 서술 없음.**
 *   `"{변수명}은 {기준일} 기준 {값}입니다.({기간} {방향})"`
 *
 * 인과를 쓰지 않는 이유는 규칙이기도 하지만 사실이기도 하다 — 우리는 이 변수가 이 회사 실적을
 * 움직였다는 것을 증명할 수 없다. 시점 병기까지가 우리가 말할 수 있는 전부다.
 */

export interface VariableObservation {
  /** 카탈로그 변수 코드. */
  code: string;
  /** 표시값(단위 포함). 소스 그대로 — 여기서 환산하지 않는다. */
  value_text: string;
  as_of: string;
  source: string;
  /** 방향 표기 — `{ window: "3개월", direction: "상승" }`. 없으면 문장에서 생략된다. */
  trend?: { window: string; direction: "상승" | "하락" | "보합" };
}

/**
 * 조사 선택 — 받침 있으면 "은", 없으면 "는".
 *
 * 라벨에 괄호 표기가 붙는다("국제유가(WTI)", "장단기 금리차(10년−2년)"). 마지막 글자로만 판정하면
 * 괄호·라틴 문자를 보고 엉뚱한 조사를 고른다 — 실측: "국제유가(WTI)은" 이 나왔다.
 * 읽을 때는 괄호를 건너뛰므로 **괄호 앞의 한글**로 판정한다.
 */
export function topicParticle(word: string): "은" | "는" {
  const withoutParens = word.replace(/\([^)]*\)\s*$/, "").trim();
  const base = withoutParens || word.trim();
  // 뒤에서부터 첫 한글 음절을 찾는다(라틴 꼬리·기호를 건너뛴다).
  for (let i = base.length - 1; i >= 0; i -= 1) {
    const code = base.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "는" : "은";
  }
  return "은"; // 한글이 없으면 보수적으로 "은"
}

/**
 * 슬롯 2 문장 → 변수 매핑 → 관측값 결합. 어느 단계든 실패하면 `null`(슬롯 3 미표시).
 * `observations` 는 코드 → 관측값 맵이며, 값이 없는 변수는 그대로 비운다.
 */
export function buildSlot3(
  slot2Text: string,
  observations: Readonly<Record<string, VariableObservation | undefined>>
): DependencyState | null {
  const variable = mapDependencyVariable(slot2Text);
  if (!variable) return null;
  // 소스가 없는 변수는 값을 만들 수 없다 — 카탈로그에 있어도 렌더하지 않는다(가짜 숫자 금지).
  if (variable.source === null) return null;
  const observation = observations[variable.code];
  if (!observation || !observation.value_text.trim() || !observation.as_of) return null;
  if (!dependencyVariable(observation.code)) return null;

  const particle = topicParticle(variable.label_ko);
  const trendText = observation.trend ? `${observation.trend.window} ${observation.trend.direction}` : null;
  const base = `${variable.label_ko}${particle} ${observation.as_of} 기준 ${observation.value_text}입니다.`;
  return {
    variable: variable.code,
    label_ko: variable.label_ko,
    value_text: observation.value_text,
    as_of: observation.as_of,
    source: observation.source,
    trend_text: trendText,
    text: trendText ? `${base} (${trendText})` : base,
  };
}
