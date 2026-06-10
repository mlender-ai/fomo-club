/**
 * Slack Agent Track — Step 2 (행동 천장).
 *
 * 봇 답변에서 액션 토큰을 파싱한다. Groq(텍스트 모델)에서도 동작하는 tool-use 패턴.
 * 형식:
 *   [[ACTION:name]]              — 페이로드 없는 액션
 *   [[ACTION:name]] {json}       — JSON 페이로드 (한 줄)
 * 하위호환:
 *   [[TRIGGER_IMPLEMENT]]        → implement
 *   [[ADD_CONSTRAINT]]{json}     → add_constraint
 *
 * 순수 함수 — apps/web/__tests__ 에서 vitest 로 검증. 실행은 events/route.ts 가 담당.
 */

export type ActionName =
  | "run_council"
  | "propose_projects"
  | "select_project"
  | "approve_plan"
  | "implement"
  | "merge"
  | "merge_all"
  | "approve"
  | "comment"
  | "close_completed"
  | "close_all"
  | "add_constraint"
  | "log_feedback";

export const KNOWN_ACTIONS: ReadonlySet<string> = new Set<ActionName>([
  "run_council",
  "propose_projects",
  "select_project",
  "approve_plan",
  "implement",
  "merge",
  "merge_all",
  "approve",
  "comment",
  "close_completed",
  "close_all",
  "add_constraint",
  "log_feedback",
]);

/** 비가역/고영향 — 실행 전 신중해야 하는 액션 */
export const HIGH_IMPACT_ACTIONS: ReadonlySet<string> = new Set<ActionName>([
  "merge",
  "merge_all",
  "implement",
  "close_completed",
  "close_all",
  "add_constraint",
  "select_project",
  "approve_plan",
]);

export interface ParsedAction {
  name: ActionName;
  payload: Record<string, unknown>;
}

export interface ParseResult {
  actions: ParsedAction[];
  /** 토큰을 제거한 사용자 표시용 텍스트 */
  cleaned: string;
}

function safeJson(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 답변 문자열에서 액션을 파싱하고 토큰을 제거한 cleaned 텍스트를 반환.
 * 알 수 없는 액션 이름은 무시(실행 안 함).
 */
export function parseActions(reply: string): ParseResult {
  const actions: ParsedAction[] = [];
  let cleaned = reply;

  // 1) 범용 [[ACTION:name]] {json}?
  const actionRe = /\[\[ACTION:(\w+)\]\]\s*(\{[^\n]*\})?/g;
  let m: RegExpExecArray | null;
  while ((m = actionRe.exec(reply)) !== null) {
    const name = m[1];
    if (name && KNOWN_ACTIONS.has(name)) {
      actions.push({ name: name as ActionName, payload: safeJson(m[2]) });
    }
  }
  cleaned = cleaned.replace(actionRe, "").trim();

  // 2) 하위호환: [[TRIGGER_IMPLEMENT]]
  if (/\[\[TRIGGER_IMPLEMENT\]\]/.test(cleaned)) {
    actions.push({ name: "implement", payload: {} });
    cleaned = cleaned.replace(/\[\[TRIGGER_IMPLEMENT\]\]/g, "").trim();
  }

  // 3) 하위호환: [[ADD_CONSTRAINT]]{json}
  const addC = cleaned.match(/\[\[ADD_CONSTRAINT\]\]\s*(\{[^\n]*\})/);
  if (addC && addC[1]) {
    actions.push({ name: "add_constraint", payload: safeJson(addC[1]) });
    cleaned = cleaned.replace(/\[\[ADD_CONSTRAINT\]\]\s*\{[^\n]*\}/g, "").trim();
  }

  return { actions, cleaned };
}
