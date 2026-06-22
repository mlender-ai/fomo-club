import type { ParsedAction } from "./actions";

export type NaturalRouteConfidence = "high" | "low";

export interface NaturalRoute {
  confidence: NaturalRouteConfidence;
  actions: ParsedAction[];
  reply: string;
  reason: string;
}

const PROJECT_ID_RE = /\bP\s*(\d+)\b/i;
const HASH_NUMBER_RE = /#\s*(\d+)/;
const STANDALONE_NUMBER_RE = /(?:^|\s)(\d{2,6})(?:\s|$)/;

function compact(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function projectId(text: string): string | null {
  const match = text.match(PROJECT_ID_RE);
  return match?.[1] ? `P${match[1]}` : null;
}

function numberIn(text: string): number | null {
  const hash = text.match(HASH_NUMBER_RE)?.[1];
  const raw = hash ?? text.match(STANDALONE_NUMBER_RE)?.[1];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function route(actions: ParsedAction[], reply: string, reason: string): NaturalRoute {
  return { confidence: "high", actions, reply, reason };
}

function noRoute(reason: string): NaturalRoute {
  return { confidence: "low", actions: [], reply: "", reason };
}

const ASK_ONLY = [
  /어때\??$/,
  /알려\s*줘/,
  /보여\s*줘/,
  /요약/,
  /설명/,
  /뭐\s*(야|임|있)/,
  /상태/,
  /됐(어|나|니)\??/,
  /진행\s*(상황|상태)/,
];

const EXEC_VERBS = [
  /해\s*줘/,
  /해라/,
  /해\b/,
  /하자/,
  /시작/,
  /진행/,
  /돌려/,
  /실행/,
  /체크/,
  /점검/,
  /찾아/,
  /발굴/,
  /승인/,
  /머지/,
  /닫아/,
  /클로즈/,
  /정리/,
];

function isLikelyExecution(text: string): boolean {
  return hasAny(text, EXEC_VERBS) && !/하지\s*마|말아|스킵|보류/.test(text);
}

function isAskOnly(text: string): boolean {
  return hasAny(text, ASK_ONLY) && !isLikelyExecution(text);
}

/**
 * Slack 자연어를 LLM 호출 전에 안전한 액션으로 분류한다.
 * - 확실한 실행 지시만 high confidence 로 반환한다.
 * - 조회/상태/요약 질문은 low confidence 로 두어 기존 Agent Chat 이 답하게 한다.
 * - 고영향 액션은 대상 번호/프로젝트 id가 없으면 실행하지 않는다.
 */
export function routeNaturalLanguage(input: string): NaturalRoute {
  const text = compact(input);
  if (!text) return noRoute("empty");
  if (isAskOnly(text)) return noRoute("ask-only");

  const lower = text.toLowerCase();

  // ── 새 에이전트 운영 3종 ──────────────────────────────────────
  if (/(파이프라인|pipeline).*(점검|체크|확인|봐|모니터|monitor)/i.test(text)) {
    return route(
      [{ name: "pipeline_check", payload: { query: text } }],
      "🛠️ 파이프라인 점검 요청으로 이해했어요. `pipeline-monitor` 작업 이슈를 만들고 실행 로그를 남길게요.",
      "pipeline_check",
    );
  }

  if (/소스.*(후보|찾아|발굴|리서치|조사)|source.*(discover|candidate|research)/i.test(text)) {
    return route(
      [{ name: "source_discovery", payload: { query: text } }],
      "🔎 소스 후보 발굴 요청으로 이해했어요. 실제 연동은 하지 않고 후보 리포트 작업 이슈만 만들게요.",
      "source_discovery",
    );
  }

  if (/(정합성|무결성|integrity|grounding|그라운딩).*(체크|검수|확인|봐|검증)|금칙어.*(체크|검수)|투자조언.*(체크|검수)/i.test(text)) {
    return route(
      [{ name: "integrity_check", payload: { query: text } }],
      "🧪 정합성 검수 요청으로 이해했어요. `integrity-checker` 작업 이슈를 만들고 금칙어·근거·균형 기준으로 보게 할게요.",
      "integrity_check",
    );
  }

  // ── 톱다운 프로젝트 흐름 ─────────────────────────────────────
  if (/프로젝트.*(제안|뽑아|추천|정리)|뭐부터\s*할지.*(제안|정리)/i.test(text)) {
    return noRoute("autonomous-project-proposal-locked");
  }

  const pid = projectId(text);
  if (pid && /(기획|prd).*(승인|오케이|ok|진행)|승인.*(기획|prd)/i.test(text)) {
    return route(
      [{ name: "approve_plan", payload: { id: pid } }],
      `✅ ${pid} 기획 승인으로 이해했어요. PRD 기준으로 하위 task 분해를 실행할게요.`,
      "approve_plan",
    );
  }

  if (pid && /(시작|하자|킥오프|착수|선택)/i.test(text)) {
    return route(
      [{ name: "select_project", payload: { id: pid } }],
      `🗺️ ${pid} 프로젝트 시작으로 이해했어요. 먼저 기획문서(PRD) 이슈를 만들게요.`,
      "select_project",
    );
  }

  // ── 구현/개발 ────────────────────────────────────────────────
  const n = numberIn(text);
  if (/(개발|구현|작업).*(해|진행|시작|착수)|진행해|만들어\s*줘/i.test(text)) {
    if (n && /#?\s*\d{2,6}/.test(text)) {
      return route(
        [{ name: "implement_task", payload: { issue: n } }],
        `🚀 #${n} 이슈 구현 요청으로 이해했어요. 해당 task 구현 워크플로를 실행할게요.`,
        "implement_task",
      );
    }
    return route(
      [{ name: "implement", payload: {} }],
      "🚀 개발 실행 요청으로 이해했어요. 오늘 기준 auto-implement를 실행할게요.",
      "implement",
    );
  }

  // ── PR 머지 / 이슈 정리 ──────────────────────────────────────
  const actions: ParsedAction[] = [];
  const wantsMerge = /(pr|pull request|풀리퀘|피알)?.*(머지|merge)|(머지|merge).*(pr|풀리퀘|피알)/i.test(text);
  const wantsCloseIssue = /(이슈|issue).*(닫아|클로즈|close|정리)|닫아.*(이슈|issue)|클로즈.*(이슈|issue)/i.test(text);

  if (wantsMerge) {
    const prNumber = n;
    const all = /(전부|전체|다|모두|남은|이상\s*없|문제\s*없)/i.test(text);
    if (prNumber && !all) actions.push({ name: "merge", payload: { pr: prNumber } });
    else actions.push({ name: "merge_all", payload: {} });
  }

  if (wantsCloseIssue) {
    const completedOnly = /(완료|끝난|해결|머지된|merged)/i.test(text);
    actions.push({ name: completedOnly ? "close_completed" : "close_all", payload: {} });
  }

  if (actions.length > 0) {
    return route(
      actions,
      `🧹 정리 요청으로 이해했어요. ${actions.map((a) => `\`${a.name}\``).join(" + ")} 액션을 실행할게요.`,
      "merge-or-close",
    );
  }

  return noRoute("no-confident-route");
}
