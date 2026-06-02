/**
 * Slack Agent Track — Step 1 (읽기 천장).
 *
 * CEO 질문의 의도를 분류해 어떤 데이터를 깊게 로드할지 결정한다.
 * 결정론적 키워드/번호 라우팅 (추가 LLM 콜 없음 — 빠르고 토큰 0).
 * 순수 함수 — apps/web/__tests__ 에서 vitest 로 검증.
 */

export type IntentKind = "brief" | "pr" | "issue" | "workflow" | "constraints" | "general";

export interface Intent {
  kind: IntentKind;
  /** 본문을 깊게 로드할 이슈 번호 */
  issueNumbers: number[];
  /** 본문을 깊게 로드할 PR 번호 */
  prNumbers: number[];
}

/** 텍스트에서 #NNN 번호를 추출 (중복 제거, 최대 5개). */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /#(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= 5) break;
  }
  return out;
}

const PR_RE = /\bpr\b|풀\s*리퀘|풀리퀘|머지|merge|pull request/i;
const BRIEF_RE = /브리핑|브리프|brief|데일리|daily/i;
const WORKFLOW_RE = /의회|council|워크플로|workflow|실행|돌려|run|상태|status|진행\s*상황/i;
const CONSTRAINTS_RE = /규칙|제약|constraint|컨스트레인/i;
const ISSUE_RE = /이슈|issue/i;

/** CEO 질문을 분류 + 깊게 로드할 번호 추출. */
export function classifyIntent(text: string): Intent {
  const numbers = extractNumbers(text);
  const isPR = PR_RE.test(text);

  let kind: IntentKind;
  if (BRIEF_RE.test(text)) kind = "brief";
  else if (isPR) kind = "pr";
  else if (CONSTRAINTS_RE.test(text)) kind = "constraints";
  else if (WORKFLOW_RE.test(text)) kind = "workflow";
  else if (numbers.length > 0 || ISSUE_RE.test(text)) kind = "issue";
  else kind = "general";

  // PR 의도면 번호를 PR 로, 그 외 번호는 이슈로 취급
  const prNumbers = isPR ? numbers : [];
  const issueNumbers = isPR ? [] : numbers;

  return { kind, issueNumbers, prNumbers };
}

/** 본문을 토큰 폭주 없이 자르기 (기본 3000자). */
export function truncate(text: string, max = 3000): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n…(이하 생략)" : text;
}
