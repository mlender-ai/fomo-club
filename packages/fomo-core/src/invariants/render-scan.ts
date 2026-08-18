/**
 * CTX-07 — 렌더 표면 소스 스캐너 (INV-C8 · INV-C15). 순수 함수, 파일 I/O 없음.
 *
 * ## 왜 파일 워커가 아니라 순수 함수인가
 *
 * 역검증(의도적 위반 주입)을 하려면 **위반이 담긴 소스를 손으로 만들어 넣을 수 있어야** 한다.
 * 스캐너가 `readdirSync` 와 붙어 있으면 위반 케이스를 만들려고 임시 파일을 쓰게 되고, 그러면
 * 역검증 자체가 파일시스템에 의존해 불안정해진다. 그래서 판정은 문자열 → 위반 목록 이고,
 * 파일 워킹은 테스트가 담당한다. 실제 검사와 역검증이 **같은 함수**를 통과한다.
 */

export interface SourceViolation {
  /** 위반 줄(1-indexed). */
  line: number;
  /** 걸린 조각. */
  matched: string;
  why: string;
}

/** 주석을 제거한다 — 주석 안의 언급은 위반이 아니다(설명하려고 용어를 쓰는 것은 정상이다). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

// ── INV-C8 — 화면에 와이코프 용어 미노출 ────────────────────────────────────
/**
 * 어기면 사용자가 무엇을 잘못 믿는가: **자기가 이해하지 못한 단어를 근거로 읽는다.**
 * "매집 국면" 은 우리 판정이지 시장의 사실이 아닌데, 전문용어로 나가면 확립된 사실로 읽힌다.
 *
 * 타입 이름(`WyckoffAnalysis`)·데이터 비교(`=== "markup"`)는 화면에 나가지 않으므로 대상이 아니다.
 * **문자열 리터럴 안의 용어만** 본다.
 */
export const WYCKOFF_TERMS: readonly string[] = [
  "와이코프",
  "Wyckoff",
  "매집 국면",
  "분산 국면",
  "재축적",
  "스프링",
  "업스러스트",
];

/**
 * 영어 소문자 열거값(`accumulation`·`markup`·`distribution`·`markdown`·`spring`·`upthrust`)은
 * **의도적으로 목록에 없다.**
 *
 * 실측(2026-08-19): 저장소에서 그 단어들은 전부 **내부 키**로 쓰인다 — 유니온 타입 멤버,
 * `DEPTH_PHASE_TEXT` 의 객체 키, `easyMarketCopy` 의 치환 대상 키, `keys.push("accumulation")`.
 * 화면에 나가는 것은 그 키가 가리키는 **한국어 값**이다. 목록에 넣으면 위반 12건이 뜨는데
 * 전부 오탐이고, 오탐이 쌓이면 사람이 가드를 끈다 — 그게 가드가 죽는 방식이다.
 *
 * ## 그래서 못 잡는 것 (정직하게 적는다)
 *
 * `phase`·`zone.kind` 의 **원시 영어 값이 그대로 렌더되는 경우**는 이 정적 스캔으로 못 잡는다.
 * 그 축은 번역 테이블(`DEPTH_PHASE_TEXT`)과 쉬운말 변환 테스트(`easyMarketCopy.test.ts`)가 맡는다.
 * 이 불변식이 막는 것은 **사람이 한국어 전문용어를 문안에 직접 쓰는 것**이다.
 */

/** 값 비교·유니온 타입 멤버로 쓰인 리터럴은 표시가 아니다. */
const NON_DISPLAY_BEFORE = /(===|!==|==|case|includes\(|startsWith\(|endsWith\(|\|)\s*$/;

/**
 * 용어가 **괄호 안 주석으로** 붙은 형태는 위반이 아니다 — 오히려 이 불변식이 원하는 형태다.
 *
 * `"바닥 다지는 반등 시도(스프링)"` 는 쉬운말을 먼저 주고 전문용어를 괄호로 덧붙인다.
 * 사용자는 이해한 다음 용어를 만난다. 이걸 막으면 용어를 **가르치는 문장**까지 사라지고,
 * 남는 것은 용어 없는 불친절이 아니라 **번역이 없는 원어**다(그게 진짜 위반이다).
 */
const GLOSS = (term: string) => new RegExp(`[가-힣)\\s]\\(\\s*${escapeRe(term)}\\s*\\)`);

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 라틴 용어가 식별자의 일부인가 — `WyckoffAnalysis`·`WyckoffEvent` 는 타입 이름이다. */
function isIdentifierPart(source: string, index: number, term: string): boolean {
  const before = source[index - 1] ?? "";
  const after = source[index + term.length] ?? "";
  return /[A-Za-z0-9_$]/.test(before) || /[A-Za-z0-9_$]/.test(after);
}

/** 이 줄에서 용어가 인용부호 안에 있는가(대략) — 타입 주석·식별자를 걸러낸다. */
function insideQuotes(line: string, index: number): boolean {
  const before = line.slice(0, index);
  const after = line.slice(index);
  return /["'`]/.test(before) && /["'`]/.test(after);
}

/**
 * 화면 문자열에 와이코프 전문용어가 있는지 본다. **줄 단위**로 훑는다.
 *
 * 리터럴을 렉싱하지 않는 이유: 한국어 문안의 어포스트로피 하나로 렉서가 어긋나면 스캔이
 * 조용히 엉뚱한 줄을 지목한다(실측에서 타입 주석 줄이 위반으로 잡혔다). 줄 단위는 덜 정교하지만
 * **어긋나지 않는다** — 게이트에서는 그게 더 중요하다.
 */
export function scanForWyckoffTerms(source: string): SourceViolation[] {
  const clean = stripComments(source);
  const out: SourceViolation[] = [];
  const lines = clean.split("\n");
  lines.forEach((line, i) => {
    for (const term of WYCKOFF_TERMS) {
      let from = 0;
      for (;;) {
        const at = line.indexOf(term, from);
        if (at === -1) break;
        from = at + term.length;
        if (isIdentifierPart(line, at, term)) continue; // 타입·식별자 이름
        if (!insideQuotes(line, at)) continue; // 문자열 밖 = 화면에 안 나간다
        if (NON_DISPLAY_BEFORE.test(line.slice(0, at).replace(/["'`]\s*$/, "").trimEnd())) continue;
        if (GLOSS(term).test(line)) continue; // 쉬운말 뒤 괄호 주석 — 권장 형태다
        out.push({ line: i + 1, matched: term, why: "화면 문자열에 번역 없는 와이코프 용어" });
      }
    }
  });
  return out;
}

// ── INV-C15 — 조회 경로에서 신규 모듈 미호출 ────────────────────────────────
/**
 * 어기면 사용자가 무엇을 잘못 믿는가: 사용자는 화면이 **저장된 기록**을 보여준다고 믿는데,
 * 실제로는 요청 시점에 계산·수집이 돌아 느려지거나(504) 그날그날 다른 값이 나온다.
 * 이건 정보의 신뢰가 아니라 **재현성**의 문제다 — 같은 카드를 두 번 열면 같아야 한다.
 *
 * CTX-01~04 가 만든 신규 패키지는 전부 배치 전용이다. 조회 경로에 하나라도 들어오면 504 사고의 재발이다.
 */
export const REQUEST_PATH_FORBIDDEN_PACKAGES: readonly string[] = [
  "@fomo/flow",
  "@fomo/structure",
  "@fomo/materials",
  "@fomo/background",
  "@fomo/lab",
];

/** 배럴을 우회한 깊은 임포트도 막는다 — `packages/flow/src/...` 직접 참조. */
const DEEP_IMPORT = /from\s+["'][^"']*packages\/(flow|structure|materials|background|lab)\//g;

export function scanForRequestPathImports(source: string): SourceViolation[] {
  const clean = stripComments(source);
  const out: SourceViolation[] = [];
  for (const pkg of REQUEST_PATH_FORBIDDEN_PACKAGES) {
    const re = new RegExp(`from\\s+["']${pkg.replace("/", "\\/")}(?:["'/])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean)) !== null) {
      out.push({ line: lineOf(clean, m.index), matched: pkg, why: "조회 경로에서 배치 전용 패키지 임포트" });
    }
  }
  let d: RegExpExecArray | null;
  while ((d = DEEP_IMPORT.exec(clean)) !== null) {
    out.push({ line: lineOf(clean, d.index), matched: d[0], why: "배럴 우회 깊은 임포트" });
  }
  DEEP_IMPORT.lastIndex = 0;
  return out;
}
