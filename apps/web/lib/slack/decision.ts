/**
 * Slack Agent Team — Stage D: CEO 참여형 의사결정 (순수 로직).
 *
 * docs/AGENT_TEAM_VISION.md §3(D). 회의 합의 실패 → 봇이 CEO 호출 → CEO가 스레드에
 * 한마디 → 즉시 결정 반영 + standing constraint 로 규칙화(Phase 2 메커니즘 재사용).
 *
 * 여기서는 결정론적 판단만: 결정 스레드 감지 / CEO 판정 분류 / 개입 레벨 / 규칙화 유도문.
 * 실제 규칙 적재는 기존 [[ACTION:add_constraint]] (events/route.ts executeAction) 가 수행.
 * apps/web/__tests__/slack-decision.test.ts 에서 vitest 로 검증.
 */

/**
 * 합의 실패 시 봇이 CEO를 호출하는 메시지에 박는 마커.
 * scripts/council-meeting.ts 의 CEO 호출 발화와 공유한다(스레드 후속 답변을 결정으로 인식).
 */
export const CEO_DECISION_MARKER = "[council-decision]";

export type DecisionKind = "adopt" | "reject" | "hold" | "none";
export type InterventionLevel = "observe" | "lead";

const HOLD_RE = /보류|나중|대기|홀드|hold|미뤄|미루/i;
const REJECT_RE = /거부|폐기|중단|reject|안\s*함|안\s*해|하지\s*마|별로|드랍|drop/i;
const ADOPT_RE = /채택|승인|진행|가자|하자|좋아|오케이|ok\b|go\b|approve/i;

/** CEO 발화를 판정으로 분류. 보류를 채택보다 먼저(“나중에 하자” = hold). */
export function classifyDecision(text: string): DecisionKind {
  if (HOLD_RE.test(text)) return "hold";
  if (REJECT_RE.test(text)) return "reject";
  if (ADOPT_RE.test(text)) return "adopt";
  return "none";
}

interface HistoryMsg {
  text?: string;
  bot_id?: string;
}

/** 스레드가 "합의 실패 → CEO 판단 대기" 스레드인지 (봇 발화의 마커로만 판단). */
export function isCeoDecisionThread(history: HistoryMsg[]): boolean {
  return history.some((m) => !!m.bot_id && !!m.text && m.text.includes(CEO_DECISION_MARKER));
}

const OBSERVE_RE = /지켜|관전|보기만|일단\s*둬|놔둬|지켜볼/i;

/** CEO 개입 레벨. 명시적 관전 신호가 없으면 결정 주도(lead)로 간주. */
export function parseInterventionLevel(text: string): InterventionLevel {
  return OBSERVE_RE.test(text) ? "observe" : "lead";
}

/**
 * CEO 판정을 영구 규칙으로 굳히도록 LLM 에 주는 유도문(systemPrompt 보강).
 * none 이면 빈 문자열(간섭 안 함).
 */
export function decisionGuidance(kind: DecisionKind): string {
  switch (kind) {
    case "reject":
      return `\n\n[CEO 결정 모드 — 거부]
CEO가 이 안건을 거부했다. 반복 재제안을 막기 위해 답변 끝에
\`[[ACTION:add_constraint]] {"rule":"<거부 사유를 한 문장 규칙으로>","scope":["all"],"kind":"prohibition","permanent":true}\`
를 출력해 영구 규칙으로 굳혀라. 결정을 1-2문장으로 먼저 확인하라.`;
    case "adopt":
      return `\n\n[CEO 결정 모드 — 채택]
CEO가 이 안건을 채택했다. 결정을 1-2문장으로 확인하고, 방향성이 향후에도 적용되면
\`[[ACTION:add_constraint]] {"rule":"<채택 방향을 한 문장으로>","scope":["all"],"kind":"priority","permanent":true}\`
또는 1회성이면 \`[[ACTION:log_feedback]] {"note":"..."}\` 로 기억에 남겨라.`;
    case "hold":
      return `\n\n[CEO 결정 모드 — 보류]
CEO가 보류했다. 언제 다시 볼지/조건을 \`[[ACTION:log_feedback]] {"note":"..."}\` 로 남겨라. 영구 규칙은 만들지 마라.`;
    default:
      return "";
  }
}
